import express from 'express';
import * as ctrl from '../controllers/JudgeApplicationController.js';
import { authenticate, requireAuth } from '../middlewares/authMiddleware.js';

const router = express.Router();
router.use(authenticate, requireAuth);

router.post('/', ctrl.apply);
router.get('/event/:eventId', ctrl.getForEvent);
router.post('/:id/accept', ctrl.accept);
router.post('/:id/reject', ctrl.reject);

export default router;
