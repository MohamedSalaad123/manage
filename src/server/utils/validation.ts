import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

export function parseObjectId(value: unknown, fieldName = 'ID'): mongoose.Types.ObjectId {
  if (typeof value !== 'string' || !mongoose.Types.ObjectId.isValid(value)) {
    throw Object.assign(new Error(`Invalid ${fieldName}`), { statusCode: 400 });
  }
  return new mongoose.Types.ObjectId(value);
}

export function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function validateBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const msg = first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Validation error';
    throw Object.assign(new Error(msg), { statusCode: 400 });
  }
  return parsed.data;
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
