import { Router } from 'express';
import healthRouter from './health';
import contributionsRouter from './contributions';
import journeysRouter from './journeys';
import usersRouter from './users';
import meRouter from './me';
import companionsRouter from './companions';
import blocksRouter from './blocks';

const router = Router();

router.use('/health', healthRouter);
router.use('/contributions', contributionsRouter);
router.use('/journeys', journeysRouter);
router.use('/users', usersRouter);
router.use('/me', meRouter);
router.use('/companions', companionsRouter);
router.use('/blocks', blocksRouter);

export default router;
