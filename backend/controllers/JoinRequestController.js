import * as joinRequestService from '../services/JoinRequestService.js';

export const create = async (req, res, next) => {
    try {
        const reqDoc = await joinRequestService.createRequest(req.body.teamId, req.user);
        res.status(201).json({ success: true, data: reqDoc, message: "Join request sent successfully" });
    } catch (error) { next(error); }
};

export const getForTeam = async (req, res, next) => {
    try {
        const reqs = await joinRequestService.getRequestsForTeam(req.params.teamId, req.user);
        res.json({ success: true, data: reqs });
    } catch (error) { next(error); }
};

export const accept = async (req, res, next) => {
    try {
        const reqDoc = await joinRequestService.acceptRequest(req.params.id, req.user);
        res.json({ success: true, data: reqDoc, message: "Join request accepted" });
    } catch (error) { next(error); }
};

export const reject = async (req, res, next) => {
    try {
        const reqDoc = await joinRequestService.rejectRequest(req.params.id, req.user);
        res.json({ success: true, data: reqDoc, message: "Join request rejected" });
    } catch (error) { next(error); }
};
