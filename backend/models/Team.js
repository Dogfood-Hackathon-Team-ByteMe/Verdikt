import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // First member is considered leader
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  hasMinimumMembers: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('Team', teamSchema);
