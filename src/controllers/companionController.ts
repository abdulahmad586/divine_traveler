import { Request, Response, NextFunction } from 'express';
import * as companionService from '../services/companionService';
import { SendRequestBody, BlockUserBody } from '../validators/companionValidator';

export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const username = req.params['username'] as string;
    const profile = await companionService.getProfile(username, req.userId);
    res.json(profile);
  } catch (err) {
    next(err);
  }
}

export async function sendRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await companionService.sendRequest(
      req.userId,
      req.userName,
      (req.body as SendRequestBody).username
    );
    res.status(result.autoAccepted ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getIncomingRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requests = await companionService.getIncomingRequests(req.userId);
    res.json(requests);
  } catch (err) {
    next(err);
  }
}

export async function getOutgoingRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requests = await companionService.getOutgoingRequests(req.userId);
    res.json(requests);
  } catch (err) {
    next(err);
  }
}

export async function acceptRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requestId = req.params['requestId'] as string;
    const companionship = await companionService.acceptRequest(requestId, req.userId);
    res.json(companionship);
  } catch (err) {
    next(err);
  }
}

export async function deleteRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requestId = req.params['requestId'] as string;
    await companionService.deleteRequest(requestId, req.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getCompanions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const companions = await companionService.getCompanions(req.userId);
    res.json(companions);
  } catch (err) {
    next(err);
  }
}

export async function removeCompanion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const companionUserId = req.params['companionUserId'] as string;
    await companionService.removeCompanion(req.userId, companionUserId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function blockUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await companionService.blockUser(req.userId, (req.body as BlockUserBody).username, req.userName);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function unblockUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const blockedUserId = req.params['blockedUserId'] as string;
    await companionService.unblockUser(req.userId, blockedUserId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getBlocks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const blocks = await companionService.getBlocks(req.userId);
    res.json(blocks);
  } catch (err) {
    next(err);
  }
}
