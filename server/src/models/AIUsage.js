import mongoose from 'mongoose';

// One shared UTC-day counter, not one allowance per user or feature. No prompts,
// credentials or user identifiers are needed for this admission limit.
const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('AIUsage', schema);
