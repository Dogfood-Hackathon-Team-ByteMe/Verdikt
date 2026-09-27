import mongoose from 'mongoose';

const judgeApplicationSchema = new mongoose.Schema({
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    trackId: { type: mongoose.Schema.Types.ObjectId, ref: 'Track', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' }
}, { timestamps: true });

judgeApplicationSchema.index({ eventId: 1, userId: 1, status: 1 });

export default mongoose.model('JudgeApplication', judgeApplicationSchema);
