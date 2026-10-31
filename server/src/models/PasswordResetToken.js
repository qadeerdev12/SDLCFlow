import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    // One pending reset per account: issuing another replaces the old digest.
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    tokenDigest: { type: String, required: true, unique: true },
    sessionVersion: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    expiresAt: { type: Date, required: true },
});

// TTL is cleanup, not authorization. MongoDB may retain expired rows briefly;
// consumption must still reject them using an explicit expiry predicate.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('PasswordResetToken', schema);
