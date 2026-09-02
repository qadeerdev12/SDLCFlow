import mongoose from 'mongoose';

const githubAccountSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    githubId: {
      type: String,
      required: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    displayName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    avatarUrl: {
      type: String,
      trim: true,
    },
    profileUrl: {
      type: String,
      trim: true,
    },
    accessToken: {
      type: String,
      required: true,
      select: false,
    },
    tokenType: {
      type: String,
      default: 'bearer',
    },
    scopes: {
      type: [String],
      default: [],
    },
    connectedAt: {
      type: Date,
      default: Date.now,
    },
    lastSyncedAt: Date,
  },
  { timestamps: true }
);

const GitHubAccount = mongoose.model('GitHubAccount', githubAccountSchema);

export default GitHubAccount;
