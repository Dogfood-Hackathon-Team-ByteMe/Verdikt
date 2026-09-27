/**
 * Strip everything the client must never see from a User document.
 *
 * Every path that returns a user goes through here. The password hash is not
 * a secret the way a plaintext password is, but shipping bcrypt hashes to
 * browsers hands an attacker an offline cracking target for free.
 */
export const toPublicUser = (user) => {
    if (!user) return null;
    const plain = typeof user.toObject === 'function' ? user.toObject() : { ...user };
    delete plain.password;
    delete plain.__v;
    return plain;
};

/**
 * Resolve the coarse role stored on a Session.
 *
 * Roles are really per-event (organiserIn and participatingIn hold event ids,
 * judgeIn holds track ids), so this single value is only a hint for UI chrome.
 * Anything that actually gates access re-checks the specific event in the
 * service layer.
 *
 * Note the spelling split that is easy to trip on: the Session enum uses the
 * American "organizer", while the User field is the British "organiserIn".
 */
export const resolveRole = (user) => {
    if (!user) return 'visitor';
    if (user.isAdmin) return 'admin';
    if (user.organiserIn && user.organiserIn.length > 0) return 'organizer';
    if (user.judgeIn && user.judgeIn.length > 0) return 'judge';
    return 'participant';
};
