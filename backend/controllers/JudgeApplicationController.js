import * as judgeApplicationService from '../services/JudgeApplicationService.js';
import * as auditService from '../services/AuditService.js';
import { ACTIONS } from '../services/AuditService.js';

export const apply = async (req, res, next) => {
    try {
        const app = await judgeApplicationService.apply(req.body.eventId, req.body.trackId, req.user);
        res.status(201).json({ success: true, data: app });
    } catch (error) { next(error); }
};
export const getForEvent = async (req, res, next) => {
    try {
        const apps = await judgeApplicationService.getForEvent(req.params.eventId, req.user);
        res.json({ success: true, data: apps });
    } catch (error) { next(error); }
};
export const accept = async (req, res, next) => {
    try {
        const app = await judgeApplicationService.accept(req.params.id, req.user);
        await auditService.record(req, ACTIONS.APPLICATION_ACCEPTED, {
            eventId: app?.eventId?._id ?? app?.eventId ?? null,
            targetType: 'JudgeApplication',
            targetId: app?._id,
            meta: { applicantId: String(app?.userId?._id ?? app?.userId ?? ''), trackId: String(app?.trackId?._id ?? app?.trackId ?? '') },
        });
        res.json({ success: true, data: app });
    } catch (error) { next(error); }
};
export const reject = async (req, res, next) => {
    try {
        const app = await judgeApplicationService.reject(req.params.id, req.user);
        await auditService.record(req, ACTIONS.APPLICATION_REJECTED, {
            eventId: app?.eventId?._id ?? app?.eventId ?? null,
            targetType: 'JudgeApplication',
            targetId: app?._id,
            meta: { applicantId: String(app?.userId?._id ?? app?.userId ?? ''), trackId: String(app?.trackId?._id ?? app?.trackId ?? '') },
        });
        res.json({ success: true, data: app });
    } catch (error) { next(error); }
};
