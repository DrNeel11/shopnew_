import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useBoardStore } from '../store/boardStore';
import { Task, PresenceUser, QueuedAction, ConflictNotification } from '../types';
import { api } from '../services/api';
import { v4 as uuidv4 } from '../utils/uuid';

const SOCKET_URL = '';  // Same origin (proxied)

let socketInstance: Socket | null = null;
let clientName = `User-${Math.floor(Math.random() * 9000 + 1000)}`;
const USER_COLORS = ['#4F46E5', '#DC2626', '#16A34A', '#D97706', '#7C3AED', '#DB2777'];
const clientColor = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];

// socketId tracks the current socket.id (set after connect, used for presence filtering)
let socketId: string | null = null;

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const {
    setTasks,
    addTask,
    updateTask,
    removeTask,
    setConnected,
    setOffline,
    addPresenceUser,
    removePresenceUser,
    updatePresenceUser,
    setPresenceUsers,
    addQueuedAction,
    clearQueue,
    addConflict,
  } = useBoardStore();

  const replayQueue = useCallback(
    async (queue: QueuedAction[], socket: Socket) => {
      for (const action of queue) {
        try {
          switch (action.type) {
            case 'create':
              socket.emit('task:create', action.payload);
              break;
            case 'update':
              socket.emit('task:update', action.payload);
              break;
            case 'move':
              socket.emit('task:move', action.payload);
              break;
            case 'delete':
              socket.emit('task:delete', action.payload);
              break;
          }
          // Small delay between replayed actions
          await new Promise((r) => setTimeout(r, 50));
        } catch (err) {
          console.error('Failed to replay action:', err);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (socketInstance) {
      socketRef.current = socketInstance;
      return;
    }

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketInstance = socket;
    socketRef.current = socket;

    socket.on('connect', async () => {
      socketId = socket.id ?? null;
      setConnected(true);
      setOffline(false);

      // Join presence
      socket.emit('presence:join', { name: clientName, color: clientColor });

      // Sync full board state on reconnect
      socket.emit('board:sync');

      // Replay offline queue
      const currentQueue = useBoardStore.getState().offlineQueue;
      if (currentQueue.length > 0) {
        await replayQueue(currentQueue, socket);
        clearQueue();
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
      setOffline(true);
    });

    socket.on('board:state', (data: { tasks: Task[] }) => {
      setTasks(data.tasks);
    });

    socket.on('task:created', (data: { task: Task }) => {
      addTask(data.task);
    });

    socket.on('task:updated', (data: { task: Task }) => {
      updateTask(data.task);
    });

    socket.on('task:moved', (data: { task: Task }) => {
      updateTask(data.task);
    });

    socket.on('task:deleted', (data: { taskId: string }) => {
      removeTask(data.taskId);
    });

    socket.on(
      'task:conflict',
      (data: {
        taskId: string;
        conflictType: ConflictNotification['conflictType'];
        resolvedTask: Task;
      }) => {
        const conflictMessages: Record<string, string> = {
          move_move:
            'Another user moved this task to a different column. Your move was not applied.',
          move_edit:
            'Concurrent move and edit detected. Both changes have been preserved.',
          concurrent_edit: 'Concurrent edit detected. The latest version has been applied.',
        };

        addConflict({
          taskId: data.taskId,
          conflictType: data.conflictType,
          resolvedTask: data.resolvedTask,
          message: conflictMessages[data.conflictType] || 'A conflict was detected.',
        });

        updateTask(data.resolvedTask);
      }
    );

    // Presence events
    socket.on('presence:list', (data: { users: PresenceUser[] }) => {
      setPresenceUsers(data.users);
    });

    socket.on('presence:user_joined', (data: { user: PresenceUser }) => {
      addPresenceUser(data.user);
    });

    socket.on('presence:user_left', (data: { clientId: string }) => {
      removePresenceUser(data.clientId);
    });

    socket.on('presence:user_editing', (data: { clientId: string; taskId: string | null }) => {
      updatePresenceUser(data.clientId, data.taskId);
    });

    // Fetch initial state via REST as fallback
    api.getTasks().then((data) => {
      setTasks(data.tasks);
    }).catch(console.error);

    return () => {
      // Don't disconnect on cleanup - socket is shared
    };
  }, [setTasks, addTask, updateTask, removeTask, setConnected, setOffline,
      addPresenceUser, removePresenceUser, updatePresenceUser, setPresenceUsers,
      addQueuedAction, clearQueue, addConflict, replayQueue]);

  const emitOrQueue = useCallback(
    (type: QueuedAction['type'], payload: Record<string, unknown>) => {
      const socket = socketRef.current;
      const isOffline = useBoardStore.getState().isOffline;

      if (isOffline || !socket?.connected) {
        addQueuedAction({
          id: uuidv4(),
          type,
          payload,
          timestamp: Date.now(),
        });
        return false;
      }

      const eventMap: Record<string, string> = {
        create: 'task:create',
        update: 'task:update',
        move: 'task:move',
        delete: 'task:delete',
      };

      socket.emit(eventMap[type], payload);
      return true;
    },
    [addQueuedAction]
  );

  const emitPresenceEditing = useCallback((taskId: string | null) => {
    socketRef.current?.emit('presence:editing', { taskId });
  }, []);

  return { socket: socketRef.current, emitOrQueue, emitPresenceEditing, socketId };
}
