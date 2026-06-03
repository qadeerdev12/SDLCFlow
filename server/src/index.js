import 'dotenv/config'; //loads .env valuyes into process.env (must be first line)
import express from 'express';
import {createServer} from 'http'; //for real-time features later (socket.io)
import { Server } from 'socket.io';
import { connectDB } from './config/db.js'; //import the DB connection function
import authRoutes from './routes/authRoutes.js'; //import our auth routes
import cors from 'cors'; //import CORS middleware to allow cross-origin requests (from our React client)
  

const app = express();  //create the Express application
const httpServer = createServer(app); //create an HTTP server instance
app.use(cors({
    origin: 'http://localhost:5173', //allow requests from our React dev server
    credentials: true //allow cookies and auth headers
})); //enable CORS for all routes

// Attach Socket.IO to that same HTTP server.
// The `cors` block lets our (future) React client connect from its own origin.
const io = new Server(httpServer, {
    cors: {
        origin: 'http://localhost:5173', //allow all origins for now (adjust in production)
        methods: ['GET', 'POST']
    }
});

await connectDB();
app.use(express.json()); // middleware to parse JSON request bodies into req.body
app.use('/api/v1/auth', authRoutes); //use the auth routes for any request to /api/v1/auth


//Health-check route: a trivival endpoint to confirm the server is alive.
//standard practice - hosting platforms (like render) ping this to check the status.
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.IO connection handler: runs every time a client connects.
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Listen for a "hello" event from this client...
  socket.on('hello', (msg) => {
    console.log(`📨 Received hello: ${msg}`);
    // ...and send one straight back to that same client.
    socket.emit('hello:response', `Server got your message: "${msg}"`);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});


const PORT = process.env.PORT || 5050; //read the port from.env, fallback to 5050

httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

