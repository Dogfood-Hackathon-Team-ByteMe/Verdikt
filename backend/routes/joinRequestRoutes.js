import express from 'express';
import * as joinRequestController from '../controllers/JoinRequestController.js';
import { authenticate, requireAuth } from '../middlewares/authMiddleware.js';

const router = express.Router();
router.use(authenticate, requireAuth);

router.post('/', joinRequestController.create);
router.get('/team/:teamId', joinRequestController.getForTeam);
router.post('/:id/accept', joinRequestController.accept);
router.post('/:id/reject', joinRequestController.reject);

export default router;
