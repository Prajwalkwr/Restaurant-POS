import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.routes.js';
import staffRoutes from './routes/staff.routes.js';
import menuRoutes from './routes/menu.routes.js';
import tablesRoutes from './routes/tables.routes.js';
import sessionsRoutes from './routes/sessions.routes.js';
import ordersRoutes from './routes/orders.routes.js';
import kitchenRoutes from './routes/kitchen.routes.js';
import billsRoutes from './routes/bills.routes.js';
import reservationsRoutes from './routes/reservations.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import publicRoutes from './routes/public.routes.js';

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });
app.use('/api/auth', authLimiter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/tables', tablesRoutes);
app.use('/api/table-sessions', sessionsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/kitchen', kitchenRoutes);
app.use('/api/bills', billsRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/public', publicLimiter, publicRoutes);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
const menuUploads = path.resolve(__dirname, '../uploads/menu');
app.use('/uploads/menu', express.static(menuUploads, {
  fallthrough: false,
  immutable: true,
  maxAge: '1y',
}));
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => { if (err) next(); });
});
app.use(errorHandler);

export default app;
