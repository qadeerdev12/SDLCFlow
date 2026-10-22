import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    stateDigest: { type: String, required: true, unique: true },
    browserDigest: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // One pending connection per login family bounds storage and supersedes
    // earlier attempts from that session. Other devices remain independent.
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'RefreshSession', required: true, unique: true },
    sessionVersion: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
});

// Cleanup is asynchronous; consumption also checks expiry in its query.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('GitHubOAuthState', schema);
