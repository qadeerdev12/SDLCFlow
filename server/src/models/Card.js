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
    position: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

const Card = mongoose.model('Card', cardSchema);
export default Card;