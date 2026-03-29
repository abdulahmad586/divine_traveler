import { Request, Response, NextFunction } from 'express';
import * as service from '../services/contributionService';
import { PostContributionBody } from '../validators/contributionValidator';

export async function submit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const contribution = await service.submit(req.userId, req.body as PostContributionBody);
    res.status(201).json(contribution);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const surah = parseInt(req.query.surah as string, 10);
    if (isNaN(surah) || surah < 1 || surah > 114) {
      res.status(400).json({ error: 'surah query param must be an integer between 1 and 114' });
      return;
    }

    const contributions = await service.listBySurah(surah, false); //Fetch all contributions regardless of status
    res.json(contributions);
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const contribution = await service.getById(req.params['id'] as string);
    res.json(contribution);
  } catch (err) {
    next(err);
  }
}

export async function like(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.like(req.params['id'] as string);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function recordDownload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.recordDownload(req.params['id'] as string);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function deleteOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteContribution(req.params['id'] as string, req.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
