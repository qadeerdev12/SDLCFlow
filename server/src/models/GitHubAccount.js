import mongoose from 'mongoose';
import crypto from 'crypto';

const TOKEN_PREFIX = 'enc:v1:';

function tokenEncryptionKey() {
  const secret = process.env.GITHUB_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error('GitHub token encryption key is not configured.');
  return crypto.createHash('sha256').update(secret).digest();
}

export function isEncryptedGitHubToken(token) {
  return typeof token === 'string' && token.startsWith(TOKEN_PREFIX);
}

export function encryptGitHubToken(token) {
  if (!token || isEncryptedGitHubToken(token)) return token;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    TOKEN_PREFIX.slice(0, -1),
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptGitHubToken(token) {
  if (!token || !isEncryptedGitHubToken(token)) return token;

  const [, , ivValue, tagValue, ciphertextValue] = token.split(':');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    tokenEncryptionKey(),
    Buffer.from(ivValue, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

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

githubAccountSchema.methods.getAccessToken = function getAccessToken() {
  return decryptGitHubToken(this.accessToken);
};

githubAccountSchema.pre('validate', function encryptTokenBeforeSave() {
  if (this.isModified('accessToken') && this.accessToken) {
    this.accessToken = encryptGitHubToken(this.accessToken);
  }
});

githubAccountSchema.pre('findOneAndUpdate', function encryptTokenBeforeUpdate() {
  const update = this.getUpdate();
  const accessToken = update?.$set?.accessToken || update?.accessToken;
  if (!accessToken) return;

  const encryptedToken = encryptGitHubToken(accessToken);
  if (update.$set?.accessToken) update.$set.accessToken = encryptedToken;
  else update.accessToken = encryptedToken;
});

const GitHubAccount = mongoose.model('GitHubAccount', githubAccountSchema);

export default GitHubAccount;
