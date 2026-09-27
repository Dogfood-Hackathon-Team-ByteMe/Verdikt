import { runInTransaction } from '../utils/transaction.js';
import * as judgeApplicationRepo from '../repositories/JudgeApplicationRepository.js';
import * as eventRepo from '../repositories/EventRepository.js';
import * as trackRepo from '../repositories/TrackRepository.js';
import * as userRepo from '../repositories/UserRepository.js';
import * as notificationRepo from '../repositories/NotificationRepository.js';

export const apply = async (eventId, trackId, requestingUser) => {
    const event = await eventRepo.findById(eventId);
    if (!event) throw Object.assign(new Error('Event not found'), { statusCode: 404 });
    if (!event.isJudgeApplyOpen) throw Object.assign(new Error('Judge applications are closed'), { statusCode: 400 });

    if (requestingUser.participatingIn && requestingUser.participatingIn.some(e => e.toString() === eventId.toString())) {
        throw Object.assign(new Error('Participants cannot apply to judge'), { statusCode: 400 });
    }

    const existing = await judgeApplicationRepo.findPendingByUserAndEvent(requestingUser._id, eventId);
    if (existing) throw Object.assign(new Error('Application already pending'), { statusCode: 400 });

    return await runInTransaction(async (session) => {
        const app = await judgeApplicationRepo.create({ eventId, trackId, userId: requestingUser._id }, session);
        if (event.organiserId) {
            await notificationRepo.create({
                userId: event.organiserId._id || event.organiserId,
                type: 'system',
                message: `New judge application for your event ${event.name}.`,
                referenceId: app._id
            }, session);
        }
        return app;
    });
};

export const accept = async (applicationId, requestingUser) => {
    return await runInTransaction(async (session) => {
        const app = await judgeApplicationRepo.findById(applicationId, session);
        if (!app) throw Object.assign(new Error('Application not found'), { statusCode: 404 });
        if (app.status !== 'pending') throw Object.assign(new Error('Already processed'), { statusCode: 400 });

        const isOrganiser = requestingUser.organiserIn && requestingUser.organiserIn.some(e => e.toString() === app.eventId._id.toString());
        if (!isOrganiser && !requestingUser.isAdmin) {
            throw Object.assign(new Error('Only organizer can accept applications'), { statusCode: 403 });
        }

        await trackRepo.addJudge(app.trackId, app.userId._id, session);
        await userRepo.addJudgeIn(app.userId._id, app.trackId, session);
        await eventRepo.addJudge(app.eventId._id, app.userId._id, session);

        const updated = await judgeApplicationRepo.update(applicationId, { status: 'accepted' }, session);
        await notificationRepo.create({
            userId: app.userId._id, type: 'system', message: `Your application to judge was accepted!`
        }, session);
        return updated;
    });
};

export const reject = async (applicationId, requestingUser) => {
    return await runInTransaction(async (session) => {
        const app = await judgeApplicationRepo.findById(applicationId, session);
        if (!app) throw Object.assign(new Error('Application not found'), { statusCode: 404 });
        if (app.status !== 'pending') throw Object.assign(new Error('Already processed'), { statusCode: 400 });

        const isOrganiser = requestingUser.organiserIn && requestingUser.organiserIn.some(e => e.toString() === app.eventId._id.toString());
        if (!isOrganiser && !requestingUser.isAdmin) {
            throw Object.assign(new Error('Only organizer can reject applications'), { statusCode: 403 });
        }

        const updated = await judgeApplicationRepo.update(applicationId, { status: 'rejected' }, session);
        await notificationRepo.create({
            userId: app.userId._id, type: 'system', message: `Your application to judge was rejected.`
        }, session);
        return updated;
    });
};

export const getForEvent = async (eventId, requestingUser) => {
    const isOrganiser = requestingUser.organiserIn && requestingUser.organiserIn.some(e => e.toString() === eventId.toString());
    if (!isOrganiser && !requestingUser.isAdmin) {
        throw Object.assign(new Error('Only organizer can view applications'), { statusCode: 403 });
    }
    return await judgeApplicationRepo.findByEventId(eventId);
};
