import { Server as HttpServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import { findSession } from '../services/auth.service.js';
import { config } from '../config.js';

let io: Server | null = null;

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: config.clientOrigin, credentials: true },
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie || '';
      const match = cookieHeader.match(/(?:^|; )sid=([^;]+)/);
      const token = match ? decodeURIComponent(match[1]) : null;
      if (!token) return next(new Error('No session'));
      const session = await findSession(token);
      if (!session) return next(new Error('Invalid session'));
      (socket as any).user = session.user;
      next();
    } catch (e) {
      next(new Error('Auth failed'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user;
    const restaurantId = user.restaurantId;
    // join restaurant room
    socket.join(`restaurant:${restaurantId}`);
    // role rooms
    socket.join(`role:${user.role}:${restaurantId}`);
    // convenience rooms expected by clients/templates
    if (user.role === 'BILLER' || user.role === 'ADMIN') socket.join(`biller-${restaurantId}`);
    if (user.role === 'KITCHEN' || user.role === 'ADMIN' || user.role === 'WAITER') socket.join(`kitchen-${restaurantId}`);
    // user room
    socket.join(`user:${user.id}`);

    socket.on('subscribe:table', (tableId: string) => {
      // basic: join table room; authorization could be checked here
      socket.join(`table:${tableId}`);
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

export function getIO(): Server | null {
  return io;
}

export function emitToRestaurant(restaurantId: string, event: string, payload: any) {
  if (!io) return;
  io.to(`restaurant:${restaurantId}`).emit(event, payload);
}

export function emitToRole(restaurantId: string, role: string, event: string, payload: any) {
  if (!io) return;
  io.to(`role:${role}:${restaurantId}`).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: any) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}
