/**
 * Process entry point: connect to MongoDB, then start listening.
 *
 * The app itself lives in app.js. Keeping the connection and the listener here
 * means tests and the seed script can use the same app and models against
 * their own database.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { createApp } from './app.js';

const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dogfood';

const app = createApp();

try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const server = app.listen(PORT, () => {
        console.log(`Verdikt API listening on port ${PORT}`);
    });

    // Close the port and the database cleanly so `docker compose down` and
    // Ctrl-C do not leave a half-open connection behind.
    const shutdown = async (signal) => {
        console.log(`\n${signal} received, shutting down.`);
        server.close(async () => {
            await mongoose.connection.close();
            process.exit(0);
        });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
} catch (error) {
    console.error('Error connecting to MongoDB:', error);
    // Exit non-zero so Docker restarts the container instead of it sitting
    // "up" with no database.
    process.exit(1);
}

export default app;
