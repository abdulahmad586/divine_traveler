import { Request, Response, NextFunction } from 'express';
import * as service from '../services/journeyService';
import { CreateJourneyBody, UpdateProgressBody, UpdateStatusBody } from '../validators/journeyValidator';

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
