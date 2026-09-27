import express from 'express';
import * as notificationController from '../controllers/NotificationController.js';
import { authenticate, requireAuth } from '../middlewares/authMiddleware.js';

const router = express.Router();
router.use(authenticate, requireAuth);

router.get('/', notificationController.getMyNotifications);
router.patch('/:id/read', notificationController.markAsRead);

export default router;
