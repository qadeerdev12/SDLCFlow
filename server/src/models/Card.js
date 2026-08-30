// server/src/models/Card.js
import mongoose from 'mongoose';

const cardSchema = new mongoose.Schema(
  {
    board: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Board',
      required: true,
      index: true,            // scope all card queries by board
    },
    list: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'List',
      required: true,
      index: true,            // fetch a single list's cards
    },
    title: {
      type: String,
      required: [true, 'Card title is required'],
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    tag: {
      type: String,
      enum: ['Task', 'Feature', 'Bug', 'Design', 'Research', 'Docs', 'Chore'],
      default: 'Task',
    },
    status: {
      type: String,
      enum: ['Todo', 'In Progress', 'Review', 'Blocked', 'Done'],
      default: 'Todo',
    },
    assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    position: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

const Card = mongoose.model('Card', cardSchema);
export default Card;
