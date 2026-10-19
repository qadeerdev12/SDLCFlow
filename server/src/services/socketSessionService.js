import { verifyAccessToken } from '../utils/accessTokens.js';
import { getAccessSessionFamily } from './accessSessionService.js';
import User from '../models/User.js';
import { sessionVersion } from '../utils/sessionTokens.js';

// Include pending handshakes, not just connected sockets. A password change
// must invalidate an authentication lookup that is still awaiting MongoDB.
// This registry is local to each server; clustered deployments need shared revocation.
const sessions = new WeakMap();

function sessionError(code, message = 'Your session is no longer valid. Please sign in again.') {
  return Object.assign(new Error(message), { data: { code } });
}

function assertLive(socket) {
  const session = socket.data.session;
  if (session.revoked) throw sessionError(session.revoked);
  if (session.expiresAt !== null && Date.now() >= session.expiresAt) {
    throw sessionError('SESSION_EXPIRED');
  }
}

async function loadSessionUser(socket) {
  assertLive(socket);
  const user = await User.findById(socket.data.session.userId).select('+sessionVersion');
  assertLive(socket); // Revocation can happen during the database read.
  if (!user) throw sessionError('USER_NOT_FOUND', 'User not found.');
  const version = sessionVersion(user.sessionVersion);
  if (version === null || version !== socket.data.session.version) throw sessionError('SESSION_INVALIDATED');
  const session = socket.data.session;
  if (session.familyId) {
    const family = await getAccessSessionFamily({ sessionId: session.familyId, userId: session.userId, version });
    // A logout may have evicted this pending socket while the query was waiting.
    assertLive(socket);
    if (!family || family.expiresAt.getTime() <= Date.now()) throw sessionError('SESSION_INVALIDATED');
    session.expiresAt = Math.min(session.expiresAt, family.expiresAt.getTime());
  }
  return user;
}

function endSession(socket, code) {
  socket.data.session.revoked = code;
  if (socket.connected) {
    socket.emit('session:invalidated', { code });
    socket.disconnect(true);
  }
}

/** Disconnect only older versions, so a fresh login racing revocation survives. */
export function revokeSocketSessions(io, userId, minimumVersion = Infinity, code = 'SESSION_INVALIDATED') {
  if (!io) return;
  for (const socket of sessions.get(io) || []) {
    const session = socket.data.session;
    if (session.userId === userId.toString().toLowerCase() && session.version < minimumVersion) {
      endSession(socket, code);
    }
  }
}

/** Persist revocation first. Include pending handshakes as well as idle sockets. */
export function revokeSocketFamily(io, familyId) {
  if (!io) return;
  for (const socket of sessions.get(io) || []) {
    if (socket.data.session.familyId === String(familyId)) endSession(socket, 'SESSION_INVALIDATED');
  }
}

export function configureSocketSessions(io) {
  const tracked = new Set();
  sessions.set(io, tracked);
  io.use(async (socket, next) => {
    let cleanup;
    try {
      const token = socket.handshake.auth?.token;
      if (!token) throw sessionError('NO_TOKEN_PROVIDED', 'Authentication token is required.');
      let claims;
      try {
        claims = verifyAccessToken(token);
      } catch (error) {
        throw sessionError(error.name === 'TokenExpiredError' ? 'SESSION_EXPIRED' : 'INVALID_TOKEN', 'Invalid authentication token.');
      }
      socket.data.session = {
        userId: claims.id.toLowerCase(), version: sessionVersion(claims.sessionVersion),
        familyId: claims.sid || null,
        expiresAt: claims.exp === undefined ? null : claims.exp * 1000,
        revoked: null,
      };
      socket.data.boardIds = new Set();
      tracked.add(socket);
      cleanup = () => tracked.delete(socket);
      // Failed handshakes don't emit socket disconnect; transport close also
      // cleans up clients that leave while authentication is in progress.
      socket.conn.once('close', cleanup);
      socket.once('disconnect', () => {
        cleanup();
        socket.conn.off('close', cleanup);
      });
      socket.data.user = await loadSessionUser(socket);
      next();
    } catch (error) {
      cleanup?.();
      if (cleanup) socket.conn.off('close', cleanup);
      // A database outage is not proof that credentials are invalid.
      next(error.data ? error : sessionError('AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.'));
    }
  });
}

/** Set up expiry and per-packet checks before joining any private rooms. */
export function startSocketSession(socket) {
  try {
    assertLive(socket);
  } catch (error) {
    endSession(socket, error.data.code);
    return false;
  }

  let timer;
  const scheduleExpiry = () => {
    const deadline = socket.data.session.expiresAt;
    if (deadline === null) return; // Compatibility with existing signed fixtures/legacy tokens.
    const remaining = deadline - Date.now();
    if (remaining <= 0) return endSession(socket, 'SESSION_EXPIRED');
    // Node timers overflow above ~24.8 days. Recheck instead of disconnecting early.
    timer = setTimeout(scheduleExpiry, Math.min(remaining, 2 ** 31 - 1));
    timer.unref();
  };
  scheduleExpiry();
  socket.once('disconnect', () => clearTimeout(timer));

  socket.use(async (packet, next) => {
    try {
      await loadSessionUser(socket);
      if (socket.connected) next();
    } catch (error) {
      const code = error.data?.code || 'AUTH_UNAVAILABLE';
      const callback = packet.at(-1);
      if (typeof callback === 'function') callback({ ok: false, error: { code, message: error.data ? error.message : 'Authentication is temporarily unavailable.' } });
      if (code !== 'AUTH_UNAVAILABLE') endSession(socket, code);
      // Do not dispatch an unauthenticated packet. Transient database failures
      // reject this operation without clearing the client's credentials.
    }
  });
  return true;
}
