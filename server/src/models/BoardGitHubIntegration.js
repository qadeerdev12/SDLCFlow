import mongoose from 'mongoose';

const boardGitHubIntegrationSchema = new mongoose.Schema(
  {
    board: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Board',
      required: true,
      unique: true,
      index: true,
    },
    connectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    githubAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GitHubAccount',
      required: true,
    },
    repoId: {
      type: String,
      required: true,
      trim: true,
    },
    repoOwner: {
      type: String,
      required: true,
      trim: true,
    },
    repoName: {
      type: String,
      required: true,
      trim: true,
    },
    repoFullName: {
      type: String,
      required: true,
      trim: true,
    },
    repoUrl: {
      type: String,
      required: true,
      trim: true,
    },
    defaultBranch: {
      type: String,
      trim: true,
    },
    private: {
      type: Boolean,
      default: false,
    },
    language: {
      type: String,
      trim: true,
    },
    lastSyncedAt: Date,
  },
  { timestamps: true }
);

const BoardGitHubIntegration = mongoose.model('BoardGitHubIntegration', boardGitHubIntegrationSchema);

export default BoardGitHubIntegration;
