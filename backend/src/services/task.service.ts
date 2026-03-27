import { PoolClient } from 'pg';
import pool from '../db/index';
import { Task, Column, CreateTaskInput, UpdateTaskInput, ConflictResult } from '../types/index';
import {
  generatePosition,
  positionAtEnd,
  rebalancePositions,
  needsRebalance,
} from './fractional-index.service';

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    column: row.column_name as Column,
    position: row.position as string,
    version: row.version as number,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

export async function getAllTasks(): Promise<Task[]> {
  const result = await pool.query(
    'SELECT * FROM tasks ORDER BY column_name, position::float ASC'
  );
  return result.rows.map(rowToTask);
}

export async function getTaskById(id: string): Promise<Task | null> {
  const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;
  return rowToTask(result.rows[0]);
}

export async function createTask(
  input: CreateTaskInput,
  clientId: string
): Promise<Task> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const column = input.column || 'todo';

    // Get the last position in the column
    const lastPosResult = await client.query(
      'SELECT position FROM tasks WHERE column_name = $1 ORDER BY position::float DESC LIMIT 1',
      [column]
    );

    const lastPos = lastPosResult.rows.length > 0 ? lastPosResult.rows[0].position : null;
    const position = positionAtEnd(lastPos);

    const result = await client.query(
      `INSERT INTO tasks (title, description, column_name, position, version)
       VALUES ($1, $2, $3, $4, 1)
       RETURNING *`,
      [input.title, input.description || '', column, position]
    );

    await client.query('COMMIT');
    return rowToTask(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateTask(
  id: string,
  input: UpdateTaskInput,
  clientId: string
): Promise<ConflictResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the row for update
    const currentResult = await client.query(
      'SELECT * FROM tasks WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (currentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Task not found');
    }

    const current = rowToTask(currentResult.rows[0]);

    // Detect conflict: client sent an older version
    const conflict = input.version < current.version;
    let conflictType: ConflictResult['conflictType'] = undefined;

    // Determine what changed
    const clientChangedColumn = input.column !== undefined && input.column !== current.column;
    const clientChangedContent =
      (input.title !== undefined && input.title !== current.title) ||
      (input.description !== undefined && input.description !== current.description);

    if (conflict) {
      // Conflict resolution strategy:
      // - If client is only moving (no content change), we still apply it (last-write-wins on moves)
      // - If client is editing content AND server moved it, we apply both
      // - Concurrent move+move: server version wins for column, notify loser
      if (clientChangedColumn && !clientChangedContent) {
        conflictType = 'move_move';
        // Server wins: reject client's move, return current state
        await client.query('ROLLBACK');
        return { resolved: current, conflict: true, conflictType, loserUserId: clientId };
      } else if (clientChangedContent) {
        conflictType = 'move_edit';
        // Both win: apply client's content changes on top of server's column change
        const updates: string[] = [];
        const values: unknown[] = [];
        let paramIdx = 1;

        if (input.title !== undefined) {
          updates.push(`title = $${paramIdx++}`);
          values.push(input.title);
        }
        if (input.description !== undefined) {
          updates.push(`description = $${paramIdx++}`);
          values.push(input.description);
        }

        updates.push(`version = version + 1`);
        values.push(id);

        const updateResult = await client.query(
          `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
          [...values]
        );

        await client.query('COMMIT');
        return {
          resolved: rowToTask(updateResult.rows[0]),
          conflict: true,
          conflictType,
        };
      } else {
        conflictType = 'concurrent_edit';
        // Last-write-wins: apply update
      }
    }

    // Build update query
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (input.title !== undefined) {
      updates.push(`title = $${paramIdx++}`);
      values.push(input.title);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIdx++}`);
      values.push(input.description);
    }
    if (input.column !== undefined) {
      updates.push(`column_name = $${paramIdx++}`);
      values.push(input.column);
    }
    if (input.position !== undefined) {
      updates.push(`position = $${paramIdx++}`);
      values.push(input.position);
    }

    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return { resolved: current, conflict: false };
    }

    updates.push(`version = version + 1`);
    values.push(id);

    const updateResult = await client.query(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      [...values]
    );

    // Check if rebalance needed after position update
    if (input.position !== undefined && input.column !== undefined) {
      await maybeRebalance(client, input.column as Column, id);
    }

    await client.query('COMMIT');

    return {
      resolved: rowToTask(updateResult.rows[0]),
      conflict: conflict && conflictType !== undefined,
      conflictType,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function maybeRebalance(
  client: PoolClient,
  column: Column,
  movedTaskId: string
): Promise<void> {
  const posResult = await client.query(
    'SELECT id, position FROM tasks WHERE column_name = $1 ORDER BY position::float ASC',
    [column]
  );

  const positions = posResult.rows;
  let needsReb = false;

  for (let i = 0; i < positions.length - 1; i++) {
    if (needsRebalance(positions[i].position, positions[i + 1].position)) {
      needsReb = true;
      break;
    }
  }

  if (needsReb) {
    const ids = positions.map((r: { id: string }) => r.id);
    const newPositions = rebalancePositions(ids);

    for (const [taskId, newPos] of newPositions.entries()) {
      await client.query(
        'UPDATE tasks SET position = $1, version = version + 1 WHERE id = $2',
        [newPos, taskId]
      );
    }
  }
}

export async function moveTask(
  id: string,
  targetColumn: Column,
  prevTaskId: string | null,
  nextTaskId: string | null,
  clientVersion: number,
  clientId: string
): Promise<ConflictResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the task being moved
    const currentResult = await client.query(
      'SELECT * FROM tasks WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (currentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Task not found');
    }

    const current = rowToTask(currentResult.rows[0]);

    // Conflict: someone else moved it already
    if (clientVersion < current.version && current.column !== targetColumn) {
      await client.query('ROLLBACK');
      return {
        resolved: current,
        conflict: true,
        conflictType: 'move_move',
        loserUserId: clientId,
      };
    }

    // Calculate new position
    let prevPosition: string | null = null;
    let nextPosition: string | null = null;

    if (prevTaskId) {
      const prevResult = await client.query(
        'SELECT position FROM tasks WHERE id = $1',
        [prevTaskId]
      );
      if (prevResult.rows.length > 0) {
        prevPosition = prevResult.rows[0].position;
      }
    }

    if (nextTaskId) {
      const nextResult = await client.query(
        'SELECT position FROM tasks WHERE id = $1',
        [nextTaskId]
      );
      if (nextResult.rows.length > 0) {
        nextPosition = nextResult.rows[0].position;
      }
    }

    let newPosition: string;
    try {
      newPosition = generatePosition(prevPosition, nextPosition);
    } catch (e) {
      // Gap too small, need to rebalance first
      await rebalanceColumn(client, targetColumn);
      // Recalculate positions after rebalance
      if (prevTaskId) {
        const prevResult = await client.query(
          'SELECT position FROM tasks WHERE id = $1',
          [prevTaskId]
        );
        prevPosition = prevResult.rows.length > 0 ? prevResult.rows[0].position : null;
      }
      if (nextTaskId) {
        const nextResult = await client.query(
          'SELECT position FROM tasks WHERE id = $1',
          [nextTaskId]
        );
        nextPosition = nextResult.rows.length > 0 ? nextResult.rows[0].position : null;
      }
      newPosition = generatePosition(prevPosition, nextPosition);
    }

    const updateResult = await client.query(
      `UPDATE tasks SET column_name = $1, position = $2, version = version + 1
       WHERE id = $3 RETURNING *`,
      [targetColumn, newPosition, id]
    );

    await client.query('COMMIT');

    return {
      resolved: rowToTask(updateResult.rows[0]),
      conflict: false,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function rebalanceColumn(client: PoolClient, column: Column): Promise<void> {
  const posResult = await client.query(
    'SELECT id FROM tasks WHERE column_name = $1 ORDER BY position::float ASC',
    [column]
  );
  const ids = posResult.rows.map((r: { id: string }) => r.id);
  const newPositions = rebalancePositions(ids);

  for (const [taskId, newPos] of newPositions.entries()) {
    await client.query(
      'UPDATE tasks SET position = $1, version = version + 1 WHERE id = $2',
      [newPos, taskId]
    );
  }
}

export async function deleteTask(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function getTasksInColumn(column: Column): Promise<Task[]> {
  const result = await pool.query(
    'SELECT * FROM tasks WHERE column_name = $1 ORDER BY position::float ASC',
    [column]
  );
  return result.rows.map(rowToTask);
}
