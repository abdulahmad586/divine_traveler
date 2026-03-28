import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { postContributionSchema } from '../validators/contributionValidator';
import * as controller from '../controllers/contributionController';

const router = Router();

router.post('/', authMiddleware, validateBody(postContributionSchema), controller.submit);
router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/:id/like', authMiddleware, controller.like);
router.post('/:id/download', authMiddleware, controller.recordDownload);
router.delete('/:id', authMiddleware, controller.deleteOne);

export default router;
