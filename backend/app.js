/**
 * The Express application, with no database connection and no listener.
 *
 * Kept separate from server.js so tests can mount the real app against a
 * throwaway database without opening a port, and so the seed script can import
 * models without accidentally starting a server.
 */
import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { publicReadLimiter, writeLimiter } from './middlewares/rateLimit.js';
import { authenticate } from './middlewares/authMiddleware.js';
import v1Routes from './routes/v1Routes.js';

/**
 * Allowed browser origins for cookie-bearing requests.
 *
 * `credentials: true` is what lets the httpOnly session cookie travel on
 * cross-origin XHR, and the CORS spec forbids pairing it with `*`. So the
 * origin has to be listed explicitly — CORS_ORIGIN accepts a comma-separated
 * list, defaulting to the Vite dev server and the docker-compose web port.
 */
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

export function createApp() {
    const app = express();

    /**
     * How many proxies sit in front of this process.
     *
     * Everything that counts requests per client -- the rate limiters, the
     * audit trail's record of where an action came from -- reads req.ip, and
     * req.ip is the proxy's address unless Express is told to look past it. In
     * docker-compose there is exactly one hop, nginx, which appends the real
     * address to X-Forwarded-For; trusting exactly that one hop means a client
     * that sends its own X-Forwarded-For cannot shift the blame, because the
     * address Express reads is the one nginx appended, not the one the client
     * supplied. Set TRUST_PROXY=0 when the API is exposed directly.
     */
    app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));

    app.use(
        cors({
            origin(origin, callback) {
                // No Origin header: same-origin, curl, or a server-side call.
                if (!origin) return callback(null, true);
                if (allowedOrigins.includes(origin)) return callback(null, true);
                return callback(new Error(`Origin ${origin} is not allowed by CORS`));
            },
            credentials: true,
        }),
    );

    // 10mb rather than the 100kb default: an exported event bundle (T4 import)
    // is one JSON body carrying every entry and ballot of an event.
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Liveness probe, used by docker-compose's healthcheck.
    app.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));

    // The public read API, mounted before /api so its own limiter answers
    // first. Keyless, so it is counted per address rather than per account.
    app.use('/api/v1', publicReadLimiter, v1Routes);

    // `authenticate` runs BEFORE the limiter, not just inside each route, so
    // the limiter can count a signed-in caller against their account instead
    // of their address. Mounted here it resolved to nothing: req.user was
    // still undefined at this point, so every write from a shared connection
    // shared one bucket -- the exact failure the login limiter is shaped to
    // avoid. It is idempotent, so the per-route calls still read naturally
    // and cost nothing.
    app.use('/api', authenticate, writeLimiter, apiRoutes);

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}

export default createApp;
