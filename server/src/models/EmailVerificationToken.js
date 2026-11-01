import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    tokenDigest: { type: String, required: true, unique: true },
    // Bind proof to the address and account generations that received the mail.
    email: { type: String, required: true },
    emailVerificationVersion: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    sessionVersion: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    expiresAt: { type: Date, required: true },
});

// TTL only cleans storage. The consuming query checks expiry independently.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('EmailVerificationToken', schema);
