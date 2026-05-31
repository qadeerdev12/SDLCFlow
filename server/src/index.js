import 'dotenv/config'; //loads .env valuyes into process.env (must be first line)
import express from 'express';
import { connectDB } from './config/db.js'; //import the DB connection function

const app = express();  //create the Express application

app.use(express.json()); // middleware to parse JSON request bodies into req.body

await connectDB();

//Health-check route: a trivival endpoint to confirm the server is alive.
//standard practice - hosting platforms (like render) ping this to check the status.
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 5050; //read the port from.env, fallback to 5050

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

