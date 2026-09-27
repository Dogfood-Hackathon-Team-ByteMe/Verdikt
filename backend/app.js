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

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Liveness probe, used by docker-compose's healthcheck.
    app.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));

    app.use('/api', apiRoutes);

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}

export default createApp;
