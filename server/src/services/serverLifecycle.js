import mongoose from 'mongoose';

// Track accepted socket/background work independently of connection lifetime:
// disconnecting a client does not cancel persistence or recovery email dispatch.
export function createServerLifecycle() {
    let draining = false;
    const pending = new Set();
    return {
        get draining() { return draining; },
        beginDrain() { draining = true; },
        track() {
            let resolve;
            const completion = new Promise((done) => { resolve = done; });
            pending.add(completion);
            return () => { pending.delete(completion); resolve(); };
        },
        async waitForIdle() {
            while (pending.size) await Promise.all([...pending]);
        },
    };
}

export async function databaseReady() {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return false;
    try {
        // A connected socket alone does not establish database availability.
        await mongoose.connection.db.admin().ping({ timeoutMS: 1000 });
        return true;
    } catch {
        return false;
    }
}

// Dependencies make ordering/deadline tests independent of process.exit and
// real signals. The deadline covers transport drain AND database disconnect.
export function createShutdown({ lifecycle, closeTransport, stopSubscriber,
    disconnectDatabase, exit = (code) => process.exit(code), timeoutMs = 15000,
    log = (message) => console.info(message) }) {
    let shutdown;
    return (exitCode = 0) => {
        if (shutdown) return shutdown;
        lifecycle.beginDrain();
        const timer = setTimeout(() => {
            log('Server shutdown deadline exceeded');
            exit(1);
        }, timeoutMs);
        shutdown = (async () => {
            try {
                // Closing Socket.IO also closes its shared HTTP listener. HTTP
                // responses drain there; tracked socket/background jobs drain separately.
                await closeTransport();
                await lifecycle.waitForIdle();
                stopSubscriber();
                await disconnectDatabase();
                log('Server shutdown complete');
                exit(exitCode);
            } catch {
                log('Server shutdown failed');
                exit(1);
            } finally {
                clearTimeout(timer);
            }
        })();
        return shutdown;
    };
}
