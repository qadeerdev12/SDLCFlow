import { expect, it, vi } from 'vitest';
import { requireVerifiedEmail } from '../middleware/requireVerifiedEmail.js';

function invoke(req) {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    const next = vi.fn();
    requireVerifiedEmail(req, res, next);
    return { res, next };
}

// An omitted/misordered authentication middleware must never grant access or
// confuse a signed-out visitor with an authenticated but unverified account.
it.each([undefined, null])('requires authentication when req.user is %s', (user) => {
    const { res, next } = invoke({ user });
    expect(res.status).toHaveBeenCalledExactlyOnceWith(401);
    expect(res.json).toHaveBeenCalledExactlyOnceWith({ error: {
        code: 'AUTHENTICATION_REQUIRED', message: 'Please sign in to continue.',
    } });
    expect(next).not.toHaveBeenCalled();
});

// Missing legacy fields, omitted projections, and malformed values are not
// proof of verification. Mongoose returns valid stored timestamps as Date.
it.each([undefined, null, false, true, 0, 123, '', '2026-11-01T00:00:00Z', {}, new Date(NaN)])(
    'denies unverified or malformed stored state: %s', (emailVerifiedAt) => {
        const { res, next } = invoke({ user: { emailVerifiedAt } });
        expect(res.status).toHaveBeenCalledExactlyOnceWith(403);
        expect(res.json).toHaveBeenCalledExactlyOnceWith({ error: {
            code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Verify your email address to access this feature.',
        } });
        expect(next).not.toHaveBeenCalled();
    },
);

it('continues exactly once for a verified account without modifying the request', () => {
    const user = Object.freeze({ emailVerifiedAt: new Date('2026-11-01T00:00:00Z') });
    const req = Object.freeze({ user });
    const { res, next } = invoke(req);
    expect(next).toHaveBeenCalledExactlyOnceWith();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(req.user).toBe(user);
});

it('ignores caller-supplied proof flags and public/JWT verification claims', () => {
    const claimed = { emailVerified: true, emailVerifiedAt: new Date() };
    const { res, next } = invoke({ user: { emailVerified: true }, body: claimed,
        query: claimed, authSession: claimed, headers: { 'x-email-verified': 'true' } });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
});

it('does not exempt project owners or administrators from verification', () => {
    for (const role of ['owner', 'admin', 'member']) {
        const { res, next } = invoke({ user: { role, emailVerifiedAt: null } });
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    }
});

// The guard must not cache a successful decision across requests. Email edits
// clear the stored timestamp; protect supplies the new snapshot next time.
it('denies a later request after verification is cleared', () => {
    expect(invoke({ user: { emailVerifiedAt: new Date() } }).next).toHaveBeenCalledOnce();
    const { res, next } = invoke({ user: { emailVerifiedAt: null } });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
});

it('never includes account details in the denial response', () => {
    const { res } = invoke({ user: { email: 'private@example.test', passwordHash: 'private-hash', sessionVersion: 42 } });
    const output = JSON.stringify(res.json.mock.calls);
    for (const secret of ['private@example.test', 'private-hash', 'sessionVersion']) expect(output).not.toContain(secret);
});
