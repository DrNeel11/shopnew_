import { create } from 'zustand';
import { Task, PresenceUser, ConflictNotification, QueuedAction } from '../types';

interface BoardState {
  tasks: Task[];
  presenceUsers: PresenceUser[];
  isConnected: boolean;
  isOffline: boolean;
  offlineQueue: QueuedAction[];
  conflicts: ConflictNotification[];
  editingTaskId: string | null;

  // Actions
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (task: Task) => void;
  removeTask: (taskId: string) => void;
  setConnected: (connected: boolean) => void;
  setOffline: (offline: boolean) => void;
  addPresenceUser: (user: PresenceUser) => void;
  removePresenceUser: (clientId: string) => void;
  updatePresenceUser: (clientId: string, editingTaskId: string | null) => void;
  setPresenceUsers: (users: PresenceUser[]) => void;
  addQueuedAction: (action: QueuedAction) => void;
  clearQueue: () => void;
  addConflict: (conflict: ConflictNotification) => void;
  dismissConflict: (taskId: string) => void;
  setEditingTaskId: (taskId: string | null) => void;
}

export const useBoardStore = create<BoardState>((set) => ({
  tasks: [],
  presenceUsers: [],
  isConnected: false,
  isOffline: false,
  offlineQueue: [],
  conflicts: [],
  editingTaskId: null,

  setTasks: (tasks) => set({ tasks }),

  addTask: (task) =>
    set((state) => ({
      tasks: [...state.tasks.filter((t) => t.id !== task.id), task],
    })),

  updateTask: (task) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
    })),

  removeTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    })),

  setConnected: (isConnected) => set({ isConnected }),
  setOffline: (isOffline) => set({ isOffline }),

  addPresenceUser: (user) =>
    set((state) => ({
      presenceUsers: [
        ...state.presenceUsers.filter((u) => u.clientId !== user.clientId),
        user,
      ],
    })),

  removePresenceUser: (clientId) =>
    set((state) => ({
      presenceUsers: state.presenceUsers.filter((u) => u.clientId !== clientId),
    })),

  updatePresenceUser: (clientId, editingTaskId) =>
    set((state) => ({
      presenceUsers: state.presenceUsers.map((u) =>
        u.clientId === clientId
          ? { ...u, editingTaskId: editingTaskId ?? undefined }
          : u
      ),
    })),

  setPresenceUsers: (users) => set({ presenceUsers: users }),

  addQueuedAction: (action) =>
    set((state) => ({
      offlineQueue: [...state.offlineQueue, action],
    })),

  clearQueue: () => set({ offlineQueue: [] }),

  addConflict: (conflict) =>
    set((state) => ({
      conflicts: [
        ...state.conflicts.filter((c) => c.taskId !== conflict.taskId),
        conflict,
      ],
    })),

  dismissConflict: (taskId) =>
    set((state) => ({
      conflicts: state.conflicts.filter((c) => c.taskId !== taskId),
    })),

  setEditingTaskId: (editingTaskId) => set({ editingTaskId }),
}));
