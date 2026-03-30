import { Router } from 'express';
import { optionalAuth } from '../middleware/optionalAuth';
import * as journeyController from '../controllers/journeyController';
import * as companionController from '../controllers/companionController';

const router = Router();

// GET /users/:username — public profile (optionally enriched with relationship if authed)
router.get('/:username', optionalAuth, companionController.getProfile);

// GET /users/:userId/journeys — public view of another user's journeys
router.get('/:userId/journeys', journeyController.listByUser);

export default router;
