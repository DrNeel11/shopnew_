import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { PresenceUser } from '../types/index';
import { handleTaskEvents } from './handlers/task.handler';
import { handlePresence } from './handlers/presence.handler';

let io: SocketIOServer | null = null;

const presenceUsers = new Map<string, PresenceUser>();

export function initWebSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Register handlers (separated from business logic)
    handleTaskEvents(socket);
    handlePresence(socket, presenceUsers);

    socket.on('disconnect', (reason) => {
      console.log(`Client disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}
