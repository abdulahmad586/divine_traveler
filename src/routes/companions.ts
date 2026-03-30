import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { sendRequestSchema } from '../validators/companionValidator';
import * as companionController from '../controllers/companionController';

const router = Router();

router.use(authMiddleware);

// GET /companions
router.get('/', companionController.getCompanions);

// DELETE /companions/:companionUserId
router.delete('/:companionUserId', companionController.removeCompanion);

// GET /companions/requests/incoming
router.get('/requests/incoming', companionController.getIncomingRequests);

// GET /companions/requests/outgoing
router.get('/requests/outgoing', companionController.getOutgoingRequests);

// POST /companions/requests
router.post('/requests', validateBody(sendRequestSchema), companionController.sendRequest);

// POST /companions/requests/:requestId/accept
router.post('/requests/:requestId/accept', companionController.acceptRequest);

// DELETE /companions/requests/:requestId
router.delete('/requests/:requestId', companionController.deleteRequest);

export default router;
