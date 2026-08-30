import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema(
  {
    board: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Board',
      required: true,
      index: true,
    },
    card: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Card',
      required: true,
      index: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    body: {
      type: String,
      required: [true, 'Comment body is required'],
      trim: true,
      maxlength: 5000,
    },
  },
  { timestamps: true }
);

commentSchema.index({ card: 1, createdAt: 1 });

const Comment = mongoose.model('Comment', commentSchema);
export default Comment;
