import mongoose from 'mongoose';

/**
 * Run `fn` inside a multi-document transaction when the server supports one.
 *
 * MongoDB only offers transactions on a replica set (or a sharded cluster);
 * a standalone mongod rejects startTransaction outright. docker-compose starts
 * Mongo as a single-node replica set precisely so these commit properly.
 *
 * But the T1 promise is "docker compose up produces a working portal", and a
 * contributor pointing MONGO_URI at a plain local mongod should not meet a
 * wall of IllegalOperation errors. So when transactions are unavailable we run
 * `fn` without a session and carry on.
 *
 * The trade-off is explicit: without a replica set, a failure part-way through
 * a multi-write operation can leave the two writes out of step (a team created
 * but the user's participatingIn not updated, say). Every caller here writes a
 * document plus a denormalised pointer to it, so the blast radius is one
 * stale reference rather than lost user data. Run the replica set in anything
 * you care about; DATA-MODEL.md says so too.
 */

/** Cached so we probe the deployment once per process, not once per call. */
let transactionsSupported = null;

const probeTransactionSupport = async () => {
    if (transactionsSupported !== null) return transactionsSupported;
    try {
        const admin = mongoose.connection.db.admin();
        const info = await admin.command({ hello: 1 });
        // `setName` is present on a replica set member; `msg: 'isdbgrid'` on mongos.
        transactionsSupported = Boolean(info.setName) || info.msg === 'isdbgrid';
    } catch {
        transactionsSupported = false;
    }
    return transactionsSupported;
};

export const runInTransaction = async (fn) => {
    if (!(await probeTransactionSupport())) {
        console.warn(
            'MongoDB is not running as a replica set, so this multi-step write is not atomic. ' +
            'Use the bundled docker-compose (which starts a single-node replica set) for a durable setup.',
        );
        return await fn(null);
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const result = await fn(session);
        await session.commitTransaction();
        return result;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

/** Exposed for tests, which start a fresh deployment per run. */
export const _resetTransactionProbe = () => {
    transactionsSupported = null;
};
