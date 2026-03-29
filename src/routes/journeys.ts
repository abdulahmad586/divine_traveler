import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  createJourneySchema,
  updateProgressSchema,
  updateStatusSchema,
} from '../validators/journeyValidator';
import * as controller from '../controllers/journeyController';

const router = Router();

router.post('/', authMiddleware, validateBody(createJourneySchema), controller.create);
router.get('/', authMiddleware, controller.list);
router.get('/:id', controller.getOne);
router.post('/:id/progress', authMiddleware, validateBody(updateProgressSchema), controller.progress);
router.patch('/:id/status', authMiddleware, validateBody(updateStatusSchema), controller.updateStatus);

export default router;
