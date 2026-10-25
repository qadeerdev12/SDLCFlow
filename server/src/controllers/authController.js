import { sessionVersion } from '../utils/sessionTokens.js';
import { issueAuthSession } from '../services/authSessionService.js';
import RefreshSession from '../models/RefreshSession.js';
import { revokeSocketSessions } from '../services/socketSessionService.js';
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import Board from "../models/Board.js";
import List from "../models/List.js";
import Card from "../models/Card.js";
import Comment from "../models/Comment.js";
import Activity from "../models/Activity.js";
import Notification from "../models/Notification.js";
import Message from "../models/Message.js";
import Workflow from "../models/Workflow.js";
import GitHubAccount from "../models/GitHubAccount.js";
import BoardGitHubIntegration from "../models/BoardGitHubIntegration.js";
import { disconnectUserSockets, revokeBoardAccess } from '../socket.js';
import { authBody, accountName, accountEmail, credentialPassword, newAccountPassword, sendAuthError } from '../utils/authValidation.js';

//POST /api/v1/auth/register

export async function register(req, res) {
    try{
        const body = authBody(req.body);
        const name = accountName(body.name);
        const email = accountEmail(body.email);
        const password = newAccountPassword(body.password);

        //2. Is this email already taken?
        const existing = await User.findOne({email});
        if (existing) {
            return res.status(409).json({
                error: {code: 'EMAIL_TAKEN', message: "An account with this email already exists"},
            });
        }

        //3. hash the plaintext password (salt + hash in one call).
        const passwordHash = await bcrypt.hash(password, 10);

        // Explicit fields prevent clients from supplying internal session state.
        const user = await User.create({
            name,
            email,
            passwordHash
        });

        // Newly created documents include the schema's sessionVersion default.
        const session = await issueAuthSession(user, res);

        //6. Send the token and user data in the response.
        res.status(201).json({
            data: {
                ...session,
                user: { id: user._id, name: user.name, email: user.email }
            }
        });
    } catch (error) {
        return sendAuthError(res, error, 'An error occurred while registering the user');
    }
}

export async function login(req, res)  {
    try {
        const body = authBody(req.body);
        const email = accountEmail(body.email);
        const password = credentialPassword(body.password);
        // Both fields are hidden by default: one verifies credentials, the other
        // ensures the new token matches current account state rather than zero.
        const user = await User.findOne({email}).select('+passwordHash +sessionVersion');

        // 3. If user not found, or password doesn't match, return error.
        if (!user) {
            return res.status(401).json({
                error: {code: 'INVALID_CREDENTIALS', message: 'Invalid email or password'},
            });
        }

        // 4. Compare the provided password with the stored hash using the instance method.
        // If User model exposes comparePassword helper use it, otherwise compare manually
        const isMatch = typeof user.comparePassword === 'function'
            ? await user.comparePassword(password)
            : await bcrypt.compare(password, user.passwordHash);

        // 5. Wrong password? same error as user not found, to avoid giving hints to attackers.
        if (!isMatch) {
            return res.status(401).json({
                error: {code: 'INVALID_CREDENTIALS', message: 'Invalid email or password'},
            });
        }
        //6. Success! Generate a JWT and send it back with user data.
        const session = await issueAuthSession(user, res);
        return res.status(200).json({
            data: {
                ...session,
                user: { id: user._id, name: user.name, email: user.email}
            }
         });
    } catch (error) {
        return sendAuthError(res, error, 'An error occurred while logging in');
    }
}

// GET /api/v1/auth/me
// (This route is protected by the auth middleware, so req.user will be set if the token is valid)
export async function getMe(req, res) {
    // protect has verified both the JWT and its current account session version.
    return res.status(200).json({
        data: {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email
        }
    });
}

// GET /api/v1/auth/profile
// Returns account details plus lightweight workspace stats for the profile page.
export async function getProfile(req, res) {
    try {
        const [boards, ownedBoards, assignedCards, comments] = await Promise.all([
            Board.countDocuments({ 'members.user': req.user._id }),
            Board.countDocuments({ owner: req.user._id }),
            Card.countDocuments({ assignee: req.user._id }),
            Comment.countDocuments({ author: req.user._id }),
        ]);

        return res.status(200).json({
            data: {
                user: {
                    id: req.user._id,
                    name: req.user.name,
                    email: req.user.email,
                    createdAt: req.user.createdAt,
                    updatedAt: req.user.updatedAt,
                },
                stats: {
                    boards,
                    ownedBoards,
                    sharedBoards: Math.max(boards - ownedBoards, 0),
                    assignedCards,
                    comments,
                },
            },
        });
    } catch (error) {
        console.error('Get profile error:', error);
        return res.status(500).json({
            error: { code: 'INTERNAL_SERVER_ERROR', message: 'An error occurred while loading the profile' },
        });
    }
}

// PATCH /api/v1/auth/profile
// Updates editable account fields. Password changes stay on their own endpoint
// so the client can present them as a separate, higher-friction action.
export async function updateProfile(req, res) {
    try {
        const { name, email } = authBody(req.body);
        const updates = {};

        if (name !== undefined) {
            updates.name = accountName(name);
        }

        if (email !== undefined) {
            const safeEmail = accountEmail(email);

            const existing = await User.findOne({ email: safeEmail, _id: { $ne: req.user._id } });
            if (existing) {
                return res.status(409).json({
                    error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' },
                });
            }
            updates.email = safeEmail;
        }

        const user = await User.findByIdAndUpdate(
            req.user._id,
            updates,
            { returnDocument: 'after', runValidators: true }
        );

        return res.status(200).json({
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt,
                },
            },
        });
    } catch (error) {
        return sendAuthError(res, error, 'An error occurred while updating the profile');
    }
}

// PATCH /api/v1/auth/password
// Requires the current password and revokes existing REST and socket sessions.
export async function updatePassword(req, res) {
    try {
        const body = authBody(req.body);
        const currentPassword = credentialPassword(body.currentPassword);
        const newPassword = newAccountPassword(body.newPassword);

        const user = await User.findById(req.user._id).select('+passwordHash +sessionVersion');
        if (!user) {
            return res.status(404).json({
                error: { code: 'NOT_FOUND', message: 'User not found.' },
            });
        }

        const version = sessionVersion(user.sessionVersion);
        // A revocation may have happened after protect loaded req.user.
        if (version === null || version !== sessionVersion(req.user.sessionVersion)) {
            return res.status(401).json({
                error: { code: 'SESSION_INVALIDATED', message: 'Your session is no longer valid. Please sign in again.' },
            });
        }
        // $inc does not run Mongoose's numeric validators; prevent overflow here.
        if (version === Number.MAX_SAFE_INTEGER) throw new Error('Session version exhausted');

        const passwordMatches = await user.comparePassword(currentPassword);
        if (!passwordMatches) {
            return res.status(401).json({
                error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' },
            });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        // Compare-and-swap prevents concurrent password changes from overwriting
        // one another. Hash replacement and revocation succeed or fail together.
        // Missing legacy counters match zero; $inc creates them with value one.
        const versionFilter = version === 0
            ? { $or: [{ sessionVersion: 0 }, { sessionVersion: { $exists: false } }] }
            : { sessionVersion: version };
        const updated = await User.findOneAndUpdate(
            { _id: user._id, passwordHash: user.passwordHash, ...versionFilter },
            { $set: { passwordHash }, $inc: { sessionVersion: 1 } },
            { returnDocument: 'after', runValidators: true }
        );
        if (!updated) {
            return res.status(409).json({
                error: { code: 'PASSWORD_CHANGE_CONFLICT', message: 'Your account changed during this request. Please sign in again before changing your password.' },
            });
        }

        // Revoke live and in-flight socket sessions only after the atomic write.
        revokeSocketSessions(req.app.get('io'), user._id, version + 1);
        res.locals.refreshSecurity?.clearCookie(res);
        // No replacement token: require a fresh login, including in this tab.
        return res.status(200).json({ data: { updated: true } });
    } catch (error) {
        return sendAuthError(res, error, 'An error occurred while updating the password');
    }
}

// POST /api/v1/auth/logout-all
// Revoke only the authenticated account's current session generation. Matching
// the caller's version prevents delayed/repeated requests from revoking a fresh login.
export async function logoutEverywhere(req, res) {
    try {
        const version = sessionVersion(req.user.sessionVersion);
        if (version === null || version === Number.MAX_SAFE_INTEGER) {
            throw new Error('Invalid session version for revocation');
        }
        const versionFilter = version === 0
            ? { $or: [{ sessionVersion: 0 }, { sessionVersion: { $exists: false } }] }
            : { sessionVersion: version };
        // Identity and counter come from protect, never from request fields.
        // No password/profile data is modified, and legacy counters start at one.
        const updated = await User.findOneAndUpdate(
            { _id: req.user._id, ...versionFilter },
            { $inc: { sessionVersion: 1 } },
            { returnDocument: 'after', runValidators: true }
        );
        if (!updated) {
            return res.status(401).json({
                error: { code: 'SESSION_INVALIDATED', message: 'Your session is no longer valid. Please sign in again.' },
            });
        }
        revokeSocketSessions(req.app.get('io'), req.user._id, version + 1);
        res.locals.refreshSecurity?.clearCookie(res);
        return res.status(200).json({ data: { loggedOut: true } });
    } catch (error) {
        return sendAuthError(res, error, 'An error occurred while logging out all sessions');
    }
}

// DELETE /api/v1/auth/me
// Deletes the signed-in user and removes their personal footprint from boards.
export async function deleteAccount(req, res) {
    try {
        const password = credentialPassword(authBody(req.body).password);

        const user = await User.findById(req.user._id).select('+passwordHash');
        if (!user) {
            return res.status(404).json({
                error: { code: 'NOT_FOUND', message: 'User not found.' },
            });
        }

        const passwordMatches = await user.comparePassword(password);
        if (!passwordMatches) {
            return res.status(401).json({
                error: { code: 'INVALID_CREDENTIALS', message: 'Password is incorrect.' },
            });
        }

        const ownedBoards = await Board.find({ owner: user._id }).select('_id');
        const ownedBoardIds = ownedBoards.map((board) => board._id);

        // Remove inbox references before deleting their user/project targets.
        // Keep unrelated notifications, including those on shared projects.
        // If cleanup fails, the account remains available for a deletion retry.
        await Notification.deleteMany({
            $or: [
                { recipient: user._id },
                { actor: user._id },
                { board: { $in: ownedBoardIds } },
            ],
        });

        // Owned boards depend on the owner account for administration. Deleting
        // them keeps private project data from becoming orphaned after account removal.
        await Promise.all([
            Comment.deleteMany({ board: { $in: ownedBoardIds } }),
            Message.deleteMany({ board: { $in: ownedBoardIds } }),
            BoardGitHubIntegration.deleteMany({ board: { $in: ownedBoardIds } }),
            Card.deleteMany({ board: { $in: ownedBoardIds } }),
            List.deleteMany({ board: { $in: ownedBoardIds } }),
            Workflow.deleteMany({ board: { $in: ownedBoardIds } }),
            Activity.deleteMany({ board: { $in: ownedBoardIds } }),
            Board.deleteMany({ _id: { $in: ownedBoardIds } }),
        ]);
        // Collaborators must also leave rooms for projects deleted with the owner.
        const io = req.app.get('io');
        await Promise.all(ownedBoardIds.map((boardId) => revokeBoardAccess(io, boardId)));

        // For boards this user only joined, remove membership and clear task ownership.
        await Promise.all([
            Board.updateMany(
                { owner: { $ne: user._id }, 'members.user': user._id },
                { $pull: { members: { user: user._id } } }
            ),
            Card.updateMany(
                { board: { $nin: ownedBoardIds }, assignee: user._id },
                { $set: { assignee: null } }
            ),
            Comment.deleteMany({ author: user._id }),
            Message.deleteMany({ sender: user._id }),
            Activity.deleteMany({ actor: user._id }),
            GitHubAccount.deleteMany({ user: user._id }),
            BoardGitHubIntegration.deleteMany({ connectedBy: user._id }),
            User.deleteOne({ _id: user._id }),
        ]);
        disconnectUserSockets(io, user._id);

        // Delete refresh records after the account is gone. Even if cleanup
        // fails, account-existence checks already reject all its credentials.
        await RefreshSession.deleteMany({ user: user._id });
        res.locals.refreshSecurity?.clearCookie(res);

        return res.status(200).json({ data: { deleted: true } });
    } catch (error) {
        return sendAuthError(res, error, 'An error occurred while deleting the account');
    }
}
