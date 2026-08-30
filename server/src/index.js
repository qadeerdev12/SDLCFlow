import 'dotenv/config'; //loads .env valuyes into process.env (must be first line)
import express from 'express';
import {createServer} from 'http'; //for real-time features later (socket.io)
import { Server } from 'socket.io';
import { connectDB } from './config/db.js'; //import the DB connection function
import authRoutes from './routes/authRoutes.js'; //import our auth routes
import cors from 'cors'; //import CORS middleware to allow cross-origin requests (from our React client)
import boardRoutes from './routes/boardRoutes.js'; //import our board routes
import { configureSockets } from './socket.js';

const app = express();  //create the Express application
const httpServer = createServer(app); //create an HTTP server instance

// Keep HTTP and Socket.IO CORS in sync. CLIENT_ORIGIN accepts a comma-separated
// list so local dev can use either localhost or 127.0.0.1, and deploys can add
// the production web URL without code changes.
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
app.use(cors({
    origin: CLIENT_ORIGINS,
    credentials: true //allow cookies and auth headers
})); //enable CORS for all routes

// Attach Socket.IO to that same HTTP server.
// The `cors` block lets our (future) React client connect from its own origin.
const io = new Server(httpServer, {
    cors: {
        origin: CLIENT_ORIGINS,
        methods: ['GET', 'POST']
    }
});
app.set('io', io);

await connectDB();
app.use(express.json()); // middleware to parse JSON request bodies into req.body
app.use('/api/v1/auth', authRoutes); //use the auth routes for any request to /api/v1/auth
app.use('/api/v1/boards', boardRoutes); //use the board routes for any request to /api/v1/boards


//Health-check route: a trivival endpoint to confirm the server is alive.
//standard practice - hosting platforms (like render) ping this to check the status.
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket handlers live outside this bootstrap file so auth, presence, and board
// mutation events can evolve without turning server startup into a catch-all.
configureSockets(io);


const PORT = process.env.PORT || 5050; //read the port from.env, fallback to 5050

httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
