import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long').trim(),
  description: z.string().max(2000, 'Description too long').optional().default(''),
  column: z.enum(['todo', 'inprogress', 'done']).optional().default('todo'),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).optional(),
  column: z.enum(['todo', 'inprogress', 'done']).optional(),
  position: z.string().optional(),
  version: z.number().int().positive('Version must be positive'),
});

export const moveTaskSchema = z.object({
  targetColumn: z.enum(['todo', 'inprogress', 'done']),
  prevTaskId: z.string().uuid().nullable().optional(),
  nextTaskId: z.string().uuid().nullable().optional(),
  version: z.number().int().positive(),
});

export const uuidSchema = z.string().uuid('Invalid task ID');

export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateParams(schema: z.ZodSchema<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params.id);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid ID format' });
      return;
    }
    next();
  };
}
