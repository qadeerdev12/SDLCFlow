// server/src/models/Workflow.js
import mongoose from 'mongoose';

const workflowSchema = new mongoose.Schema(
  {
    board: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Board',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Workflow name is required'],
      trim: true,
      maxlength: 80,
    },
    // Optional template key lets a workflow remember which starter pattern
    // created it while still allowing fully custom project areas.
    templateKey: {
      type: String,
      trim: true,
      default: 'custom',
      maxlength: 80,
    },
    icon: {
      type: String,
      trim: true,
      default: 'workflow',
      maxlength: 24,
    },
    color: {
      type: String,
      enum: ['slate', 'indigo', 'emerald', 'amber', 'rose', 'sky', 'violet'],
      default: 'slate',
    },
    position: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

workflowSchema.index({ board: 1, position: 1 });

const Workflow = mongoose.model('Workflow', workflowSchema);
export default Workflow;
