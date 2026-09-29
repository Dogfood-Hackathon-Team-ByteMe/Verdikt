import * as notificationService from '../services/NotificationService.js';

export const getMyNotifications = async (req, res, next) => {
    try {
        const notifs = await notificationService.getMyNotifications(req.user._id);
        res.json({ success: true, data: notifs });
    } catch (error) { next(error); }
};

export const markAsRead = async (req, res, next) => {
    try {
        const notif = await notificationService.markAsRead(req.params.id, req.user._id);
        res.json({ success: true, data: notif });
    } catch (error) { next(error); }
};
