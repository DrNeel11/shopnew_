import { Socket } from 'socket.io';
import { createTask, updateTask, moveTask, deleteTask, getAllTasks } from '../../services/task.service';
import { createTaskSchema, updateTaskSchema, moveTaskSchema } from '../../middleware/validation';

export function handleTaskEvents(socket: Socket): void {
  // Request full board state (for reconnect/sync)
  socket.on('board:sync', async () => {
    try {
      const tasks = await getAllTasks();
      socket.emit('board:state', { tasks });
    } catch (err) {
      console.error('Error syncing board:', err);
      socket.emit('error', { message: 'Failed to sync board state' });
    }
  });

  // Create task
  socket.on('task:create', async (data: unknown) => {
    try {
      const parsed = createTaskSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('error', {
          message: 'Validation failed',
          details: parsed.error.errors,
        });
        return;
      }

      const task = await createTask(parsed.data, socket.id);

      // Broadcast to all including sender
      socket.nsp.emit('task:created', { task });
    } catch (err) {
      console.error('Error creating task via WS:', err);
      socket.emit('error', { message: 'Failed to create task' });
    }
  });

  // Update task
  socket.on('task:update', async (data: unknown) => {
    try {
      const payload = data as { id: string; [key: string]: unknown };
      if (!payload?.id || typeof payload.id !== 'string') {
        socket.emit('error', { message: 'Task ID is required' });
        return;
      }

      const { id: _updateId, ...updateData } = payload;

      const parsed = updateTaskSchema.safeParse(updateData);
      if (!parsed.success) {
        socket.emit('error', {
          message: 'Validation failed',
          details: parsed.error.errors,
        });
        return;
      }

      const result = await updateTask(payload.id, parsed.data, socket.id);

      // Broadcast updated task to all
      socket.nsp.emit('task:updated', {
        task: result.resolved,
        conflict: result.conflict,
        conflictType: result.conflictType,
      });

      // Notify loser about conflict
      if (result.conflict && result.loserUserId) {
        socket.emit('task:conflict', {
          taskId: payload.id,
          conflictType: result.conflictType,
          resolvedTask: result.resolved,
        });
      }
    } catch (err: unknown) {
      console.error('Error updating task via WS:', err);
      if (err instanceof Error && err.message === 'Task not found') {
        socket.emit('error', { message: 'Task not found' });
      } else {
        socket.emit('error', { message: 'Failed to update task' });
      }
    }
  });

  // Move task
  socket.on('task:move', async (data: unknown) => {
    try {
      const payload = data as { id: string; [key: string]: unknown };
      if (!payload?.id || typeof payload.id !== 'string') {
        socket.emit('error', { message: 'Task ID is required' });
        return;
      }

      const { id: _moveId, ...moveData } = payload;

      const parsed = moveTaskSchema.safeParse(moveData);
      if (!parsed.success) {
        socket.emit('error', {
          message: 'Validation failed',
          details: parsed.error.errors,
        });
        return;
      }

      const result = await moveTask(
        payload.id,
        parsed.data.targetColumn,
        parsed.data.prevTaskId ?? null,
        parsed.data.nextTaskId ?? null,
        parsed.data.version,
        socket.id
      );

      socket.nsp.emit('task:moved', {
        task: result.resolved,
        conflict: result.conflict,
        conflictType: result.conflictType,
      });

      if (result.conflict && result.loserUserId) {
        socket.emit('task:conflict', {
          taskId: payload.id,
          conflictType: result.conflictType,
          resolvedTask: result.resolved,
        });
      }
    } catch (err: unknown) {
      console.error('Error moving task via WS:', err);
      if (err instanceof Error && err.message === 'Task not found') {
        socket.emit('error', { message: 'Task not found' });
      } else {
        socket.emit('error', { message: 'Failed to move task' });
      }
    }
  });

  // Delete task
  socket.on('task:delete', async (data: unknown) => {
    try {
      const payload = data as { id: string };
      if (!payload?.id || typeof payload.id !== 'string') {
        socket.emit('error', { message: 'Task ID is required' });
        return;
      }

      const deleted = await deleteTask(payload.id);
      if (!deleted) {
        socket.emit('error', { message: 'Task not found' });
        return;
      }

      socket.nsp.emit('task:deleted', { taskId: payload.id });
    } catch (err) {
      console.error('Error deleting task via WS:', err);
      socket.emit('error', { message: 'Failed to delete task' });
    }
  });
}
