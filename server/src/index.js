import 'dotenv/config';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { connectDB } from './config/db.js';
import { allowedClientOrigins, createApp } from './app.js';
import { configureSockets } from './socket.js';
import { registerNotificationSubscriber } from './events/notificationSubscriber.js';
import { appEvents } from './events/eventBus.js';
import { authRuntimeOptions } from './config/authRuntime.js';
import { validateProductionSecurity } from './config/productionSecurity.js';
import { defaultClientBuild } from './config/clientBuild.js';

import { createServerLifecycle, createShutdown } from './services/serverLifecycle.js';

let shutdown;
try {
    // Validate before opening a database connection or accepting traffic.
    validateProductionSecurity();
    const lifecycle = createServerLifecycle();
    const app = createApp({
        refresh: authRuntimeOptions(), lifecycle,
        clientBuild: (process.env.NODE_ENV || 'production') === 'production' ? defaultClientBuild : null,
    });
    const httpServer = createServer(app);
    const io = new Server(httpServer, {
        cors: { origin: allowedClientOrigins(), methods: ['GET', 'POST'] },
    });
    app.set('io', io);
    let stopSubscriber = () => {};
    shutdown = createShutdown({
        lifecycle,
        closeTransport: () => new Promise((resolve) => io.close(resolve)),
        stopSubscriber: () => stopSubscriber(),
        disconnectDatabase: () => mongoose.disconnect(),
    });
    // Repeated signals share the same cleanup and deadline, never a second drain.
    process.on('SIGTERM', () => { void shutdown(); });
    process.on('SIGINT', () => { void shutdown(); });

    await connectDB();
    if (!lifecycle.draining) {
        stopSubscriber = registerNotificationSubscriber(appEvents, { io });
        // HTTP and sockets use the same startup policy snapshot.
        configureSockets(io, { lifecycle, requireVerification: app.locals.emailVerificationRequired });
        const port = process.env.PORT || 5050;
        await new Promise((resolve, reject) => {
            httpServer.once('error', reject);
            httpServer.listen(port, '0.0.0.0', resolve);
        });
        console.info(`HTTP and WebSocket server listening on port ${httpServer.address().port}`);
    }
} catch {
    // Driver/configuration errors may contain credentials; keep startup logs
    // generic. The configuration checker reports safe setting names separately.
    console.error('Server startup failed; check configuration, database and listening port');
    if (shutdown) await shutdown(1);
    else process.exitCode = 1;
}
