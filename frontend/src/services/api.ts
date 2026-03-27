const API_BASE = '/api';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const clientId = localStorage.getItem('kanban-client-id') || '';
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': clientId,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getTasks: () => apiFetch<{ tasks: import('../types').Task[] }>('/tasks'),

  createTask: (data: { title: string; description?: string; column?: string }) =>
    apiFetch<{ task: import('../types').Task }>('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTask: (id: string, data: { title?: string; description?: string; version: number }) =>
    apiFetch<{ task: import('../types').Task; conflict?: boolean }>(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  moveTask: (
    id: string,
    data: {
      targetColumn: string;
      prevTaskId?: string | null;
      nextTaskId?: string | null;
      version: number;
    }
  ) =>
    apiFetch<{ task: import('../types').Task; conflict?: boolean }>(`/tasks/${id}/move`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteTask: (id: string) => apiFetch<void>(`/tasks/${id}`, { method: 'DELETE' }),
};
