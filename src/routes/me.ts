import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { updateUsernameSchema, updateSettingsSchema, updateFcmTokenSchema } from '../validators/userValidator';
import * as meController from '../controllers/meController';

const router = Router();

router.use(authMiddleware);

// GET /me
router.get('/', meController.getMe);

// PATCH /me/username
router.patch('/username', validateBody(updateUsernameSchema), meController.updateUsername);

// PATCH /me/settings
router.patch('/settings', validateBody(updateSettingsSchema), meController.updateSettings);

// PATCH /me/fcm-token
router.patch('/fcm-token', validateBody(updateFcmTokenSchema), meController.updateFcmToken);

// DELETE /me
router.delete('/', meController.deleteAccount);

export default router;
