import { Router } from 'express';
import healthRouter from './health';
import contributionsRouter from './contributions';

const router = Router();

router.use('/health', healthRouter);
router.use('/contributions', contributionsRouter);

export default router;
