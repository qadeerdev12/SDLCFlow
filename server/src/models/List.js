// server/src/models/List.js
import mongoose from 'mongoose';

const listSchema = new mongoose.Schema(
  {
    board: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Board',
      required: true,
      index: true,            // we always query lists by their board
    },
    workflow: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workflow',
      default: null,
      index: true,            // optional during migration; required in a later slice
    },
    title: {
      type: String,
      required: [true, 'List title is required'],
      trim: true,
    },
    position: {
      type: Number,           // fractional ordering — explained below
      required: true,
    },
  },
  { timestamps: true }
);

const List = mongoose.model('List', listSchema);
export default List;
