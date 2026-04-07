const mongoose = require('mongoose');

const checklistItemSchema = new mongoose.Schema(
  {
    id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    title: { type: String, required: true },
    completed: { type: Boolean, default: false }
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    dueDate: { type: Date },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: { type: String, enum: ['upcoming', 'in-progress', 'overdue', 'completed'], default: 'upcoming' },
    color: { type: String, default: '#3B82F6' }, // hex color code
    workOrderId: { type: String, default: '' },
    workOrderTitle: { type: String, default: '' },
    collaborators: [
      {
        userId: { type: String },
        name: { type: String },
        email: { type: String },
        avatar: { type: String }
      }
    ],
    chat: { type: [mongoose.Schema.Types.Mixed], default: [] },
    checklist: [checklistItemSchema],
    userId: { type: String, required: true }, // Creator's ID
    companyName: { type: String, required: true }, // Company isolation
    createdBy: {
      id: { type: String },
      name: { type: String },
      email: { type: String }
    }
  },
  { timestamps: true }
);

// Index for faster queries
taskSchema.index({ companyName: 1, userId: 1 });
taskSchema.index({ dueDate: 1, status: 1 });

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
