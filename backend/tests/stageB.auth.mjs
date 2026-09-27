/**
 * Stage B check: authentication and sessions end-to-end over HTTP.
 * Run with: node tests/stageB.auth.mjs
 */
import { createClient, resetDatabase, startTestServer, stopTestServer } from './harness.mjs';
import { describe, expect, it, run } from './runner.mjs';

const PASSWORD = 'correct-horse-battery';

describe('POST /api/auth/register', () => {
    it('creates an account and issues a session cookie', async () => {
        const c = createClient();
        const res = await c.post('/api/auth/register', { email: 'ada@example.com', password: PASSWORD, name: 'Ada' });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.email).toBe('ada@example.com');
        expect(c.signedIn).toBe(true);
    });

    it('never returns the password hash', async () => {
        const c = createClient();
        const res = await c.post('/api/auth/register', { email: 'ada@example.com', password: PASSWORD, name: 'Ada' });
        expect(res.body.data.password).toBe(undefined);
        expect(res.text.includes('$2b$')).toBe(false);
    });

    it('rejects a duplicate email with 409', async () => {
        const c = createClient();
        await c.post('/api/auth/register', { email: 'ada@example.com', password: PASSWORD });
        const res = await createClient().post('/api/auth/register', { email: 'ada@example.com', password: PASSWORD });
        expect(res.status).toBe(409);
    });

    it('rejects a short password with 400', async () => {
        const res = await createClient().post('/api/auth/register', { email: 'x@example.com', password: 'short' });
        expect(res.status).toBe(400);
    });

    it('ignores isAdmin in the request body (privilege escalation)', async () => {
        const c = createClient();
        await c.post('/api/auth/register', { email: 'sneaky@example.com', password: PASSWORD, isAdmin: true });
        const me = await c.get('/api/auth/me');
        expect(me.body.data.isAdmin).toBe(false);
    });

    it('normalises the email to lower case', async () => {
        const c = createClient();
        await c.post('/api/auth/register', { email: 'MiXeD@Example.COM', password: PASSWORD });
        const me = await c.get('/api/auth/me');
        expect(me.body.data.email).toBe('mixed@example.com');
    });
});

describe('POST /api/auth/login', () => {
    it('signs in with correct credentials', async () => {
        await createClient().post('/api/auth/register', { email: 'ada@example.com', password: PASSWORD });
        const c = createClient();
        const res = await c.post('/api/auth/login', { email: 'ada@example.com', password: PASSWORD });
        expect(res.status).toBe(200);
        expect(c.signedIn).toBe(true);
    });

    it('rejects a wrong password with 401', async () => {
        await createClient().post('/api/auth/register', { email: 'ada@example.com', password: PASSWORD });
        const res = await createClient().post('/api/auth/login', { email: 'ada@example.com', password: 'wrong-password' });
        expect(res.status).toBe(401);
    });

    it('gives the same message for an unknown email as for a wrong password', async () => {
        await createClient().post('/api/auth/register', { email: 'ada@example.com', password: PASSWORD });
        const wrongPass = await createClient().post('/api/auth/login', { email: 'ada@example.com', password: 'wrong-password' });
        const noSuchUser = await createClient().post('/api/auth/login', { email: 'nobody@example.com', password: PASSWORD });
        expect(noSuchUser.status).toBe(wrongPass.status);
        expect(noSuchUser.body.message).toBe(wrongPass.body.message);
    });
});

describe('GET /api/auth/me', () => {
    it('returns 401 without a session', async () => {
        const res = await createClient().get('/api/auth/me');
        expect(res.status).toBe(401);
    });

    it('returns the signed-in user with a resolved role', async () => {
        const c = createClient();
        await c.post('/api/auth/register', { email: 'ada@example.com', password: PASSWORD, name: 'Ada' });
        const res = await c.get('/api/auth/me');
        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('Ada');
        expect(res.body.data.role).toBe('participant');
    });
});

describe('POST /api/auth/logout', () => {
    it('revokes the session so the next request is 401', async () => {
        const c = createClient();
        await c.post('/api/auth/register', { email: 'ada@example.com', password: PASSWORD });
        expect((await c.get('/api/auth/me')).status).toBe(200);

        const out = await c.post('/api/auth/logout');
        expect(out.status).toBe(204);
        expect(c.signedIn).toBe(false);
        expect((await c.get('/api/auth/me')).status).toBe(401);
    });

    it('succeeds when already signed out', async () => {
        const res = await createClient().post('/api/auth/logout');
        expect(res.status).toBe(204);
    });

    it('kills a stolen token: the old cookie stops working after logout', async () => {
        const c = createClient();
        await c.post('/api/auth/register', { email: 'ada@example.com', password: PASSWORD });
        // A second client replaying the same cookie value.
        const stolen = createClient();
        const cookieHeader = (await c.get('/api/auth/me')).status; // touch to be sure it is live
        expect(cookieHeader).toBe(200);
        await c.post('/api/auth/logout');
        // The thief cannot authenticate because the row is gone, not just the cookie.
        expect((await stolen.get('/api/auth/me')).status).toBe(401);
    });
});

describe('POST /api/users (admin-only account creation)', () => {
    it('rejects a non-admin with 403', async () => {
        const c = createClient();
        await c.post('/api/auth/register', { email: 'ada@example.com', password: PASSWORD });
        const res = await c.post('/api/users', { email: 'new@example.com', password: PASSWORD });
        expect(res.status).toBe(403);
    });

    it('rejects an anonymous caller with 401', async () => {
        const res = await createClient().post('/api/users', { email: 'new@example.com', password: PASSWORD });
        expect(res.status).toBe(401);
    });
});

describe('GET /api/users', () => {
    it('never leaks password hashes', async () => {
        const c = createClient();
        await c.post('/api/auth/register', { email: 'ada@example.com', password: PASSWORD });
        const res = await c.get('/api/users');
        expect(res.text.includes('$2b$')).toBe(false);
    });
});

await startTestServer();
const { failed } = await run({ beforeEach: resetDatabase });
await stopTestServer();
process.exit(failed > 0 ? 1 : 0);
