import type { Request, Response, NextFunction } from 'express';
import { findSession } from '../services/auth.service.js';

export interface AuthedRequest extends Request {
  user?: any;
  sessionToken?: string;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.sid;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const session = await findSession(token);
  if (!session) return res.status(401).json({ error: 'Session expired or invalid' });
  req.user = session.user;
  req.sessionToken = token;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

export function requireRestaurantScope(req: AuthedRequest, res: Response, next: NextFunction) {
  // ensures restaurantId present; attach from user
  if (!req.user?.restaurantId) return res.status(403).json({ error: 'No restaurant scope' });
  next();
}
