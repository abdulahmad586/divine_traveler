import { Router } from 'express';
import healthRouter from './health';
import contributionsRouter from './contributions';
import journeysRouter from './journeys';
import usersRouter from './users';

const router = Router();

router.use('/health', healthRouter);
router.use('/contributions', contributionsRouter);
router.use('/journeys', journeysRouter);
router.use('/users', usersRouter);

export default router;
