import mongoose from 'mongoose';

const resultSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  trackId: { type: mongoose.Schema.Types.ObjectId, ref: 'Track' },
  overallPosition: { type: Number },
  trackPosition: { type: Number },
  details: { type: String }
}, { timestamps: true });

export default mongoose.model('Result', resultSchema);
