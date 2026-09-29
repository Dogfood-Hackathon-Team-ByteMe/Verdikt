import mongoose from 'mongoose';

const trackSchema = new mongoose.Schema({
  topic: { type: String, required: true },
  description: { type: String },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
  judges: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

export default mongoose.model('Track', trackSchema);
