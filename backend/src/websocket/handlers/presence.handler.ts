import { Socket } from 'socket.io';
import { PresenceUser } from '../../types/index';

export function handlePresence(
  socket: Socket,
  presenceUsers: Map<string, PresenceUser>
): void {
  // User joins
  socket.on('presence:join', (data: { name: string; color: string }) => {
    const user: PresenceUser = {
      clientId: socket.id,
      name: data.name || `User-${socket.id.substring(0, 4)}`,
      color: data.color || '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'),
    };
    presenceUsers.set(socket.id, user);

    // Notify all clients about the new user
    socket.broadcast.emit('presence:user_joined', { user });

    // Send current presence list to new user
    socket.emit('presence:list', {
      users: Array.from(presenceUsers.values()),
    });
  });

  // User starts editing
  socket.on('presence:editing', (data: { taskId: string | null }) => {
    const user = presenceUsers.get(socket.id);
    if (user) {
      user.editingTaskId = data.taskId ?? undefined;
      presenceUsers.set(socket.id, user);
      socket.broadcast.emit('presence:user_editing', {
        clientId: socket.id,
        taskId: data.taskId,
      });
    }
  });

  // User disconnects
  socket.on('disconnect', () => {
    presenceUsers.delete(socket.id);
    socket.broadcast.emit('presence:user_left', { clientId: socket.id });
  });
}
