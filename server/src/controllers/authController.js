import jwt from "jsonwebtoken";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import Board from "../models/Board.js";
import List from "../models/List.js";
import Card from "../models/Card.js";
import Comment from "../models/Comment.js";
import Activity from "../models/Activity.js";

//Helper: create a signed JWT carrying the user's id.
// The token is signed with our secret so it can't be forged.
function generateToken(userId) {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
        expiresIn: '7d', //token expires in 7 days
    });
}

//POST /api/v1/auth/register

export async function register(req, res) {
    try{
        const  {name, email, password } = req.body;
        //1.Basic validation - never the client to send complete data.
        if (!name || !email || !password) {
            return res.status(400).json({
                error: {code: 'VALIDATION', message: 'Name, email and password are required'},
            });
        }

        //2. Is this email already taken?
        const existing = await User.findOne({email});
        if (existing) {
            return res.status(409).json({
                error: {code: 'EMAIL_TAKEN', message: "An account with this email already exists"},
            });
        }

        //3. hash the plaintext password (salt + hash in one call).
        const passwordHash = await bcrypt.hash(password, 10);

        //4. Create the user in the database.
        const user = await User.create({
            name,
            email,
            passwordHash
        });

        //5. Generate a JWT for the new user.
        const token = generateToken(user._id);

        //6. Send the token and user data in the response.
        res.status(201).json({
            data: {
                token,
                user: { id: user._id, name: user.name, email: user.email }
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: {code: 'INTERNAL_SERVER_ERROR', message: 'An error occurred while registering the user'}
        });
    }
}

export async function login(req, res)  {
    try {
        const {email, password } = req.body;
        
        //1. Basic validation
        if (!email || !password) {
            return res.status(400).json({
                error: {code: 'VALIDATION', message: 'Email and password are required'},
            });
        }
        //2. Find the user by email and include the passwordHash field.
        const user = await User.findOne({email}).select('+passwordHash');

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
        const token = generateToken(user._id);
        return res.status(200).json({
            data: {
                token,
                user: { id: user._id, name: user.name, email: user.email}
            }
         });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: {code: 'INTERNAL_SERVER_ERROR', message: 'An error occurred while logging in'},
        });
    }
}

// GET /api/v1/auth/me
// (This route is protected by the auth middleware, so req.user will be set if the token is valid)
export async function getMe(req, res) {
    // if we reach here, 'Proteect' already verififed the token and set req.user
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
        const { name, email } = req.body;
        const updates = {};

        if (name !== undefined) {
            const safeName = typeof name === 'string' ? name.trim() : '';
            if (!safeName) {
                return res.status(400).json({
                    error: { code: 'VALIDATION', message: 'Name is required.' },
                });
            }
            updates.name = safeName;
        }

        if (email !== undefined) {
            const safeEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
            if (!safeEmail) {
                return res.status(400).json({
                    error: { code: 'VALIDATION', message: 'Email is required.' },
                });
            }

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
        console.error('Update profile error:', error);
        return res.status(500).json({
            error: { code: 'INTERNAL_SERVER_ERROR', message: 'An error occurred while updating the profile' },
        });
    }
}

// PATCH /api/v1/auth/password
// Requires the current password before replacing the stored hash.
export async function updatePassword(req, res) {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                error: { code: 'VALIDATION', message: 'Current password and new password are required.' },
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                error: { code: 'VALIDATION', message: 'New password must be at least 8 characters.' },
            });
        }

        const user = await User.findById(req.user._id).select('+passwordHash');
        if (!user) {
            return res.status(404).json({
                error: { code: 'NOT_FOUND', message: 'User not found.' },
            });
        }

        const passwordMatches = await user.comparePassword(currentPassword);
        if (!passwordMatches) {
            return res.status(401).json({
                error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' },
            });
        }

        user.passwordHash = await bcrypt.hash(newPassword, 10);
        await user.save();

        return res.status(200).json({ data: { updated: true } });
    } catch (error) {
        console.error('Update password error:', error);
        return res.status(500).json({
            error: { code: 'INTERNAL_SERVER_ERROR', message: 'An error occurred while updating the password' },
        });
    }
}

// DELETE /api/v1/auth/me
// Deletes the signed-in user and removes their personal footprint from boards.
export async function deleteAccount(req, res) {
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({
                error: { code: 'VALIDATION', message: 'Password is required to delete your account.' },
            });
        }

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

        // Owned boards depend on the owner account for administration. Deleting
        // them keeps private project data from becoming orphaned after account removal.
        await Promise.all([
            Comment.deleteMany({ board: { $in: ownedBoardIds } }),
            Card.deleteMany({ board: { $in: ownedBoardIds } }),
            List.deleteMany({ board: { $in: ownedBoardIds } }),
            Activity.deleteMany({ board: { $in: ownedBoardIds } }),
            Board.deleteMany({ _id: { $in: ownedBoardIds } }),
        ]);

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
            Activity.deleteMany({ actor: user._id }),
            User.deleteOne({ _id: user._id }),
        ]);

        return res.status(200).json({ data: { deleted: true } });
    } catch (error) {
        console.error('Delete account error:', error);
        return res.status(500).json({
            error: { code: 'INTERNAL_SERVER_ERROR', message: 'An error occurred while deleting the account' },
        });
    }
}
