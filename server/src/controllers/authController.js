import bcryp from "bcryptjs";   
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
                error: {code: 'EMAIL_TAEKN', message: "An account with this email already exists"},
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