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
 * A label for UI chrome. NOT a role, and never an input to an access decision.
 *
 * `admin` is the only thing anyone is globally. Every other word below is
 * shorthand for "has done this somewhere", derived from the per-event arrays
 * (organiserIn and participatingIn hold event ids, judgeIn holds track ids) --
 * it says nothing about the event in front of you. Someone organising their
 * own hackathon and competing in another is "organizer" here and must still be
 * treated as an ordinary entrant in the second one.
 *
 * So: pick a menu with it, never a permission. Authorisation asks
 * utils/eventRoles.js about the specific event instead.
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
