const HOUR = 60 * 60 * 1000;
const COOLDOWN = 15 * 60 * 1000;

/** Single-instance, best-effort dispatch, not a durable queue. Unknown accounts
 * and failures consume budget too. Each flow owns its own bounded counters.
 */
export function createAuthEmailDispatcher({ lifecycle, failureMessage }) {
    let active = 0, windowStart = Date.now(), admitted = 0;
    const cooldowns = new Map();
    return (key, work) => {
        const now = Date.now();
        if (now - windowStart >= HOUR) { windowStart = now; admitted = 0; }
        for (const [key, expiry] of cooldowns) if (expiry <= now) cooldowns.delete(key);
        if (lifecycle?.draining || active >= 4 || admitted >= 20 || cooldowns.has(key)) return false;
        active++; admitted++;
        cooldowns.set(key, now + COOLDOWN);
        // Reserve before acknowledgement so shutdown cannot close MongoDB early.
        const finish = lifecycle?.track();
        setImmediate(async () => {
            try { await work(); }
            catch { console.warn(failureMessage); }
            finally { active--; finish?.(); }
        });
        return true;
    };
}
