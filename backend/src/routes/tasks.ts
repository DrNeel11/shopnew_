import { Router, Request, Response } from 'express';
import {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  moveTask,
  deleteTask,
} from '../services/task.service';
import {
  validateBody,
  validateParams,
  createTaskSchema,
  updateTaskSchema,
  moveTaskSchema,
  uuidSchema,
} from '../middleware/validation';
import { getIO } from '../websocket/index';

const router = Router();

// GET /api/tasks - Get all tasks
router.get('/', async (_req: Request, res: Response) => {
  try {
    const tasks = await getAllTasks();
    res.json({ tasks });
  } catch (err) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/:id - Get single task
router.get('/:id', validateParams(uuidSchema), async (req: Request, res: Response) => {
  try {
    const task = await getTaskById(req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({ task });
  } catch (err) {
    console.error('Error fetching task:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks - Create task
router.post(
  '/',
  validateBody(createTaskSchema),
  async (req: Request, res: Response) => {
    try {
      const clientId = (req.headers['x-client-id'] as string) || 'http';
      const task = await createTask(req.body, clientId);

      // Broadcast to all WebSocket clients
      const io = getIO();
      if (io) {
        io.emit('task:created', { task });
      }

      res.status(201).json({ task });
    } catch (err) {
      console.error('Error creating task:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PUT /api/tasks/:id - Update task
router.put(
  '/:id',
  validateParams(uuidSchema),
  validateBody(updateTaskSchema),
  async (req: Request, res: Response) => {
    try {
      const clientId = (req.headers['x-client-id'] as string) || 'http';
      const result = await updateTask(req.params.id, req.body, clientId);

      const io = getIO();
      if (io) {
        io.emit('task:updated', {
          task: result.resolved,
          conflict: result.conflict,
          conflictType: result.conflictType,
        });

        if (result.conflict && result.loserUserId) {
          io.to(result.loserUserId).emit('task:conflict', {
            taskId: req.params.id,
            conflictType: result.conflictType,
            resolvedTask: result.resolved,
          });
        }
      }

      res.json({
        task: result.resolved,
        conflict: result.conflict,
        conflictType: result.conflictType,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Task not found') {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      console.error('Error updating task:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/tasks/:id/move - Move task
router.post(
  '/:id/move',
  validateParams(uuidSchema),
  validateBody(moveTaskSchema),
  async (req: Request, res: Response) => {
    try {
      const clientId = (req.headers['x-client-id'] as string) || 'http';
      const { targetColumn, prevTaskId, nextTaskId, version } = req.body;

      const result = await moveTask(
        req.params.id,
        targetColumn,
        prevTaskId ?? null,
        nextTaskId ?? null,
        version,
        clientId
      );

      const io = getIO();
      if (io) {
        io.emit('task:moved', {
          task: result.resolved,
          conflict: result.conflict,
          conflictType: result.conflictType,
        });

        if (result.conflict && result.loserUserId) {
          io.to(result.loserUserId).emit('task:conflict', {
            taskId: req.params.id,
            conflictType: result.conflictType,
            resolvedTask: result.resolved,
          });
        }
      }

      res.json({
        task: result.resolved,
        conflict: result.conflict,
        conflictType: result.conflictType,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Task not found') {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      console.error('Error moving task:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// DELETE /api/tasks/:id - Delete task
router.delete('/:id', validateParams(uuidSchema), async (req: Request, res: Response) => {
  try {
    const deleted = await deleteTask(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const io = getIO();
    if (io) {
      io.emit('task:deleted', { taskId: req.params.id });
    }

    res.status(204).send();
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
