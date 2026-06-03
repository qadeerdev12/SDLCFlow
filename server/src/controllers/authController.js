import jwt from "jsonwebtoken";
import User from "../models/User.js";
import bcrypt from "bcryptjs";

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
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
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
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email
                }
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