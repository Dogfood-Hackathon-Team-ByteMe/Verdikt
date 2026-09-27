import { runInTransaction } from '../utils/transaction.js';
import crypto from 'crypto';
import * as inviteRepository from '../repositories/InviteRepository.js';
import * as teamRepository from '../repositories/TeamRepository.js';
import * as userRepository from '../repositories/UserRepository.js';
import * as eventRepository from '../repositories/EventRepository.js';
import * as notificationRepository from '../repositories/NotificationRepository.js';

export const createInvite = async (teamId, creatorId) => {
    if (!teamId) throw Object.assign(new Error('Team ID is required'), { statusCode: 400 });

    // Verify the team exists
    const team = await teamRepository.findById(teamId);
    if (!team) throw Object.assign(new Error('Team not found'), { statusCode: 404 });

    // Only the team leader (first member) can create invites
    if (!team.members || team.members.length === 0 || team.members[0]._id.toString() !== creatorId.toString()) {
        throw Object.assign(new Error('Only the team leader can create invite links'), { statusCode: 403 });
    }

    // Check against dynamic maxTeamSize from the event
    const event = team.eventId ? await eventRepository.findById(team.eventId) : null;
    const maxTeamSize = event ? event.maxTeamSize : 4;
    if (team.members.length >= maxTeamSize) {
        throw Object.assign(new Error(`Team already has the maximum of ${maxTeamSize} members`), { statusCode: 400 });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    return await inviteRepository.create({
        teamId,
        token,
        createdBy: creatorId,
        expiresAt
    });
};

export const getInviteById = async (id) => {
    const invite = await inviteRepository.findById(id);
    if (!invite) throw Object.assign(new Error('Invite not found'), { statusCode: 404 });
    return invite;
};

export const getInviteByToken = async (token) => {
    const invite = await inviteRepository.findByToken(token);
    if (!invite) throw Object.assign(new Error('Invalid invite link'), { statusCode: 404 });

    // Check if expired
    if (invite.expiresAt && new Date() > new Date(invite.expiresAt)) {
        throw Object.assign(new Error('This invite link has expired'), { statusCode: 410 });
    }

    return invite;
};

export const acceptInvite = async (token, userId) => {
    const invite = await getInviteByToken(token);
    const team = await teamRepository.findById(invite.teamId._id || invite.teamId);

    if (!team) throw Object.assign(new Error('Team not found'), { statusCode: 404 });

    // Load the event first: every check below reads from it. (This used to sit
    // after the judge check, which therefore threw a TDZ ReferenceError and
    // made accepting an invite fail 100% of the time.)
    const event = team.eventId ? await eventRepository.findById(team.eventId) : null;

    if (event && event.judgeIds && event.judgeIds.some(id => id.toString() === userId.toString())) {
        throw Object.assign(new Error("Judges cannot participate in the event they are judging"), { statusCode: 403 });
    }

    // Dynamic maxTeamSize from the event
    const maxTeamSize = event ? event.maxTeamSize : 4;
    if (team.members.length >= maxTeamSize) {
        throw Object.assign(new Error('Team is already full'), { statusCode: 400 });
    }

    const isMember = team.members.some(m => {
        const memberId = m._id ? m._id.toString() : m.toString();
        return memberId === userId.toString();
    });
    if (isMember) {
        throw Object.assign(new Error('You are already a member of this team'), { statusCode: 409 });
    }

    await teamRepository.addMember(team._id, userId);

    // Sync participatingIn on the joining user's document
    if (team.eventId) {
        await userRepository.addParticipatingIn(userId, team.eventId);
    }

    // Sync hasMinimumMembers flag
    if (event) {
        await teamRepository.syncHasMinimumMembers(team._id, event.minTeamSize);
    }

    return teamRepository.findById(team._id);
};

export const getAllInvites = async (filter = {}) => {
    return await inviteRepository.findAll(filter);
};

export const deleteInvite = async (id, requesterId) => {
    const invite = await inviteRepository.findById(id);
    if (!invite) throw Object.assign(new Error('Invite not found'), { statusCode: 404 });
    
    // Only the creator can revoke
    const creatorId = invite.createdBy._id ? invite.createdBy._id.toString() : invite.createdBy.toString();
    if (creatorId !== requesterId.toString()) {
        throw Object.assign(new Error('Only the invite creator can delete it'), { statusCode: 403 });
    }

    return await inviteRepository.deleteById(id);
};

export const sendDirectInvite = async (teamId, targetUserId, requestingUser) => {
    const team = await teamRepository.findById(teamId);
    if (!team) throw Object.assign(new Error('Team not found'), { statusCode: 404 });

    const leaderId = team.members[0]._id ? team.members[0]._id.toString() : team.members[0].toString();
    if (leaderId !== requestingUser._id.toString() && !requestingUser.isAdmin) {
        throw Object.assign(new Error('Only the team leader can send direct invites'), { statusCode: 403 });
    }

    const event = team.eventId ? await eventRepository.findById(team.eventId) : null;
    const maxTeamSize = event ? event.maxTeamSize : 4;
    if (team.members.length >= maxTeamSize) {
        throw Object.assign(new Error(`Team already has the maximum of ${maxTeamSize} members`), { statusCode: 400 });
    }

    return await runInTransaction(async (session) => {
        const token = crypto.randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        
        const invite = await inviteRepository.create({
            teamId, token, createdBy: requestingUser._id, expiresAt
        }, session);

        await notificationRepository.create({
            userId: targetUserId,
            type: 'direct_invite',
            message: `You have been invited to join team ${team.name}.`,
            referenceToken: token
        }, session);

        return invite;
    });
};
