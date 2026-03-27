export type Column = 'todo' | 'inprogress' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  column: Column;
  position: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PresenceUser {
  clientId: string;
  name: string;
  color: string;
  editingTaskId?: string;
}

export interface QueuedAction {
  id: string;
  type: 'create' | 'update' | 'move' | 'delete';
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface ConflictNotification {
  taskId: string;
  conflictType: 'move_move' | 'move_edit' | 'concurrent_edit';
  resolvedTask: Task;
  message: string;
}

export const COLUMN_LABELS: Record<Column, string> = {
  todo: 'To Do',
  inprogress: 'In Progress',
  done: 'Done',
};

export const COLUMNS: Column[] = ['todo', 'inprogress', 'done'];
