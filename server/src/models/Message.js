import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    board: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Board',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    body: {
      type: String,
      required: [true, 'Message body is required'],
      trim: true,
      maxlength: 2000,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    clearedAt: {
      type: Date,
      default: null,
    },
    clearedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

messageSchema.index({ board: 1, createdAt: -1 });
messageSchema.index({ board: 1, clearedAt: 1, createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;
