//server/src/config/db.js
import mongoose from "mongoose";   

//connects to MongoDB. Exported to index.js can call it on startup
export async function connectDB() {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI,);
        console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ MongoDB connection error: ${error.message}`);
        process.exit(1); //  // if the DB won't connect, stop the app — it can't function without it
    }
}