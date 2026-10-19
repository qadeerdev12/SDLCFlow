import mongoose from 'mongoose';

export const REFRESH_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_REFRESH_ROTATIONS = 2048;

const refreshSessionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionVersion: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    currentDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/, select: false },
    // Retain every consumed digest until expiry; truncation would miss old replays.
    consumedDigests: { type: [String], default: [], select: false,
        validate: (values) => values.length <= MAX_REFRESH_ROTATIONS
            && values.every((value) => /^[a-f0-9]{64}$/.test(value)) },
    rotationCount: { type: Number, default: 0, min: 0, max: MAX_REFRESH_ROTATIONS, validate: Number.isSafeInteger },
    expiresAt: { type: Date, required: true },
    lastRefreshedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revocationReason: { type: String, enum: ['replay', 'rotation_limit'], default: null },
}, { timestamps: true });

// TTL is housekeeping only. Authorization must check expiresAt explicitly.
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('RefreshSession', refreshSessionSchema);
