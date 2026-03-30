import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';

/**
 * Like authMiddleware but never rejects — attaches userId if a valid
 * Bearer token is present, otherwise just calls next() with no userId.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();

  try {
    const decoded = await auth.verifyIdToken(authHeader.slice(7));
    req.userId = decoded.uid;
    req.userName = decoded.name ?? 'Anonymous';
  } catch {
    // Invalid token — proceed as unauthenticated
  }

  next();
}
