import { runInTransaction } from '../utils/transaction.js';
import * as joinRequestRepository from '../repositories/JoinRequestRepository.js';
import * as notificationRepository from '../repositories/NotificationRepository.js';
import * as teamRepository from '../repositories/TeamRepository.js';
import * as eventRepository from '../repositories/EventRepository.js';
import * as userRepository from '../repositories/UserRepository.js';

export const createRequest = async (teamId, requestingUser) => {
    const team = await teamRepository.findById(teamId);
    if (!team) throw Object.assign(new Error('Team not found'), { statusCode: 404 });

    // Verify team isn't full
    const event = team.eventId ? await eventRepository.findById(team.eventId) : null;
    const maxTeamSize = event ? event.maxTeamSize : 4;
    if (team.members.length >= maxTeamSize) {
        throw Object.assign(new Error('Team is already full'), { statusCode: 400 });
    }

    if (event && event.judgeIds && event.judgeIds.some(id => id.toString() === requestingUser._id.toString())) {
        throw Object.assign(new Error("Judges cannot participate in the event they are judging"), { statusCode: 403 });
    }

    // Ensure user is not already participating in this event
    if (event && requestingUser.participatingIn && requestingUser.participatingIn.some(e => e.toString() === event._id.toString())) {
        throw Object.assign(new Error('You are already participating in a team for this event'), { statusCode: 400 });
    }

    // Check if already requested
    const existing = await joinRequestRepository.findPendingByUserAndTeam(requestingUser._id, teamId);
    if (existing) throw Object.assign(new Error('Join request already pending'), { statusCode: 400 });

    return await runInTransaction(async (session) => {
        const req = await joinRequestRepository.create({ teamId, userId: requestingUser._id }, session);
        
        // Notify team leader
        if (team.members && team.members.length > 0) {
            const leaderId = team.members[0]._id || team.members[0];
            await notificationRepository.create({
                userId: leaderId,
                type: 'join_request',
                message: `User ${requestingUser.name} has requested to join your team ${team.name}.`,
                referenceId: req._id
            }, session);
        }
        return req;
    });
};

export const getRequestsForTeam = async (teamId, requestingUser) => {
    const team = await teamRepository.findById(teamId);
    if (!team) throw Object.assign(new Error('Team not found'), { statusCode: 404 });

    const leaderId = team.members[0]._id ? team.members[0]._id.toString() : team.members[0].toString();
    if (leaderId !== requestingUser._id.toString() && !requestingUser.isAdmin) {
        throw Object.assign(new Error('Only team leader can view requests'), { statusCode: 403 });
    }
    return await joinRequestRepository.findByTeamId(teamId);
};

export const acceptRequest = async (requestId, requestingUser) => {
    return await runInTransaction(async (session) => {
        const req = await joinRequestRepository.findById(requestId, session);
        if (!req) throw Object.assign(new Error('Request not found'), { statusCode: 404 });
        if (req.status !== 'pending') throw Object.assign(new Error('Request already processed'), { statusCode: 400 });

        const team = req.teamId;
        const leaderId = team.members[0]._id ? team.members[0]._id.toString() : team.members[0].toString();
        if (leaderId !== requestingUser._id.toString() && !requestingUser.isAdmin) {
            throw Object.assign(new Error('Only team leader can accept requests'), { statusCode: 403 });
        }

        const event = team.eventId ? await eventRepository.findById(team.eventId, session) : null;
        const maxTeamSize = event ? event.maxTeamSize : 4;
        if (team.members.length >= maxTeamSize) {
            throw Object.assign(new Error('Team is already full'), { statusCode: 400 });
        }

        // Add member, sync everything
        await teamRepository.addMember(team._id, req.userId._id, session);
        if (team.eventId) {
            await userRepository.addParticipatingIn(req.userId._id, team.eventId, session);
        }
        if (event) {
            await teamRepository.syncHasMinimumMembers(team._id, event.minTeamSize, session);
        }

        const updatedReq = await joinRequestRepository.update(requestId, { status: 'accepted' }, session);

        await notificationRepository.create({
            userId: req.userId._id,
            type: 'request_accepted',
            message: `Your request to join team ${team.name} was accepted!`,
            referenceId: team._id
        }, session);

        return updatedReq;
    });
};

export const rejectRequest = async (requestId, requestingUser) => {
    return await runInTransaction(async (session) => {
        const req = await joinRequestRepository.findById(requestId, session);
        if (!req) throw Object.assign(new Error('Request not found'), { statusCode: 404 });
        if (req.status !== 'pending') throw Object.assign(new Error('Request already processed'), { statusCode: 400 });

        const team = req.teamId;
        const leaderId = team.members[0]._id ? team.members[0]._id.toString() : team.members[0].toString();
        if (leaderId !== requestingUser._id.toString() && !requestingUser.isAdmin) {
            throw Object.assign(new Error('Only team leader can reject requests'), { statusCode: 403 });
        }

        const updatedReq = await joinRequestRepository.update(requestId, { status: 'rejected' }, session);

        await notificationRepository.create({
            userId: req.userId._id,
            type: 'request_rejected',
            message: `Your request to join team ${team.name} was declined.`,
            referenceId: team._id
        }, session);

        return updatedReq;
    });
};
