import { Request, Response, NextFunction } from 'express';
import * as userService from '../services/userService';
import * as companionService from '../services/companionService';
import * as accountService from '../services/accountService';
import { UpdateUsernameBody, UpdateSettingsBody, UpdateFcmTokenBody } from '../validators/userValidator';
import * as userRepo from '../repositories/userRepository';

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await userService.getMe(req.userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function updateUsername(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await companionService.updateUsername(req.userId, req.body as UpdateUsernameBody);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await companionService.updateSettings(req.userId, req.body as UpdateSettingsBody);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function updateFcmToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await userRepo.updateFcmToken(req.userId, (req.body as UpdateFcmTokenBody).fcmToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await accountService.deleteAccount(req.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
