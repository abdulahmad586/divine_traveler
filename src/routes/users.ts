import { Router } from 'express';
import * as journeyController from '../controllers/journeyController';

const router = Router();

// GET /users/:userId/journeys — public view of another user's journeys
router.get('/:userId/journeys', journeyController.listByUser);

export default router;
