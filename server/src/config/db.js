import mongoose from 'mongoose';

// Startup owns failure handling; never log a connection URI or driver error.
export async function connectDB() {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.info('Database connected');
}
