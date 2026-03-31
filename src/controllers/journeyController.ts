import { Request, Response, NextFunction } from 'express';
import * as service from '../services/journeyService';
import {
  CreateJourneyBody,
  UpdateProgressBody,
  UpdateStatusBody,
  UpdateJourneySettingsBody,
} from '../validators/journeyValidator';

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const journey = await service.create(req.userId, req.body as CreateJourneyBody);
    res.status(201).json(journey);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const journeys = await service.listByUser(req.userId);
    res.json(journeys);
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const journey = await service.getById(req.params['id'] as string);
    res.json(journey);
  } catch (err) {
    next(err);
  }
}

export async function progress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const journey = await service.updateProgress(
      req.params['id'] as string,
      req.userId,
      req.body as UpdateProgressBody
    );
    res.json(journey);
  } catch (err) {
    next(err);
  }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const journey = await service.updateStatus(
      req.params['id'] as string,
      req.userId,
      req.body as UpdateStatusBody
    );
    res.json(journey);
  } catch (err) {
    next(err);
  }
}

export async function listByUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const journeys = await service.listByUser(req.params['userId'] as string);
    res.json(journeys);
  } catch (err) {
    next(err);
  }
}

export async function join(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const journey = await service.join(req.params['id'] as string, req.userId);
    res.json(journey);
  } catch (err) {
    next(err);
  }
}

export async function leave(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.leave(req.params['id'] as string, req.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const journey = await service.removeMember(
      req.params['id'] as string,
      req.userId,
      req.params['memberId'] as string
    );
    res.json(journey);
  } catch (err) {
    next(err);
  }
}

export async function nudge(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.nudge(
      req.params['id'] as string,
      req.userId,
      req.params['memberId'] as string
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const journey = await service.updateSettings(
      req.params['id'] as string,
      req.userId,
      req.body as UpdateJourneySettingsBody
    );
    res.json(journey);
  } catch (err) {
    next(err);
  }
}
