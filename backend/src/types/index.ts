export type Column = 'todo' | 'inprogress' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  column: Column;
  position: string;  // fractional index as string
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTaskInput {
  id?: string;
  title: string;
  description?: string;
  column?: Column;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  column?: Column;
  position?: string;
  version: number;  // optimistic lock version
}

export interface ConflictResult {
  resolved: Task;
  conflict: boolean;
  conflictType?: 'move_move' | 'move_edit' | 'concurrent_edit';
  loserUserId?: string;
}

export interface WebSocketMessage {
  type: string;
  payload: unknown;
  clientId: string;
  timestamp: number;
}

export interface PresenceUser {
  clientId: string;
  name: string;
  color: string;
  editingTaskId?: string;
}
