import * as notificationRepository from '../repositories/NotificationRepository.js';

export const getMyNotifications = async (userId) => {
    return await notificationRepository.findByUserId(userId);
};

export const markAsRead = async (id, userId) => {
    const notif = await notificationRepository.findById(id);
    if (!notif) throw Object.assign(new Error('Notification not found'), { statusCode: 404 });
    
    if (notif.userId.toString() !== userId.toString()) {
        throw Object.assign(new Error('Access denied'), { statusCode: 403 });
    }
    
    return await notificationRepository.update(id, { isRead: true });
};
