// server/src/models/Board.js
import mongoose from 'mongoose';

// A sub-schema for an embedded member. Each member links a user to a role.
// We don't make this its own collection — members live INSIDE the board doc.
const memberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,   // a reference to a User document
      ref: 'User',                             // tells Mongoose which collection it points to
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],      // only these three values allowed
      default: 'member',
    },
  },
  { _id: false }   // members don't need their own _id; they're part of the board
);

const boardSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Board name is required'],
      trim: true,
    },
    // Optional visual identity so personal project boards are distinguishable.
    // The field is still named emoji for API compatibility, but new clients
    // store a board icon key here. Older boards with literal emojis still work.
    emoji: {
      type: String,
      trim: true,
      default: 'code',
      maxlength: 24,
    },
    color: {
      type: String,
      enum: ['slate', 'indigo', 'emerald', 'amber', 'rose', 'sky', 'violet'],
      default: 'indigo',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [memberSchema],   // embedded array of the sub-schema above
  },
  { timestamps: true }
);

// Index: "find all boards where a given user is a member" — our most common query.
boardSchema.index({ 'members.user': 1 });

const Board = mongoose.model('Board', boardSchema);
export default Board;
