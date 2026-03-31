import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  createJourneySchema,
  updateProgressSchema,
  updateStatusSchema,
  updateJourneySettingsSchema,
} from '../validators/journeyValidator';
import * as controller from '../controllers/journeyController';

const router = Router();

router.post('/', authMiddleware, validateBody(createJourneySchema), controller.create);
router.get('/', authMiddleware, controller.list);
router.get('/:id', controller.getOne);
router.post('/:id/progress', authMiddleware, validateBody(updateProgressSchema), controller.progress);
router.patch('/:id/status', authMiddleware, validateBody(updateStatusSchema), controller.updateStatus);
router.patch('/:id/settings', authMiddleware, validateBody(updateJourneySettingsSchema), controller.updateSettings);
router.post('/:id/join', authMiddleware, controller.join);
router.delete('/:id/leave', authMiddleware, controller.leave);
router.delete('/:id/members/:memberId', authMiddleware, controller.removeMember);
router.post('/:id/members/:memberId/nudge', authMiddleware, controller.nudge);

export default router;
