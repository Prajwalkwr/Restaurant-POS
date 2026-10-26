import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { v2 as cloudinary } from 'cloudinary';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.errors });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (cloudinary.config().api_secret && err && typeof err === 'object' && 'http_code' in err) {
    return res.status(502).json({ error: 'Image upload failed at Cloudinary. Please try again.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
