import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function protect(req, res, next) {
    try {
        //1. Read the Authorization header: "Bearer <token>"
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: {code: 'NO_TOKEN_PROVIDED', message: 'Not Authorised - no token provided'},
            });
        }

        // 2. Extract the token from the header
        const token = authHeader.split(' ')[1];

        // 3. Verify the token and extract the user ID
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({
                error: {code: 'INVALID_TOKEN', message: 'Not Authorised - invalid token'},
            });
        }

        //4. decoded.id is the user id we signed in. Look the user up,
        // (No passwordHash needed here, so the default select: false is fine.)
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({
                error: {code: 'USER_NOT_FOUND', message: 'Not Authorised - user not found'},
            });
        }

        //5. Attach the user to the request object for use in later middleware/routes
        req.user = user;

        //6. Call next() to pass control to the next middleware/route handler
        next();     
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: {code: 'INTERNAL_SERVER_ERROR', message: 'An error occurred while authorizing the user'},
        });
    }
}   