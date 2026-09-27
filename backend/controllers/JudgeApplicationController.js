import * as judgeApplicationService from '../services/JudgeApplicationService.js';

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
        res.json({ success: true, data: app });
    } catch (error) { next(error); }
};
export const reject = async (req, res, next) => {
    try {
        const app = await judgeApplicationService.reject(req.params.id, req.user);
        res.json({ success: true, data: app });
    } catch (error) { next(error); }
};
