import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';
import { upsertUser } from '../services/userService';
import { UnauthorizedError } from '../errors';

export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or invalid Authorization header'));
  }

  const token = authHeader.slice(7);

  try {
    const decoded = await auth.verifyIdToken(token);
    req.userId = decoded.uid;

    // Lazily create/update user record on every authenticated request
    await upsertUser(decoded.uid, decoded.name ?? '', decoded.email ?? '');

    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}
