import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { blockUserSchema } from '../validators/companionValidator';
import * as companionController from '../controllers/companionController';

const router = Router();

router.use(authMiddleware);

// GET /blocks
router.get('/', companionController.getBlocks);

// POST /blocks
router.post('/', validateBody(blockUserSchema), companionController.blockUser);

// DELETE /blocks/:blockedUserId
router.delete('/:blockedUserId', companionController.unblockUser);

export default router;
