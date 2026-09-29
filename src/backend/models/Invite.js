import mongoose from 'mongoose';

const inviteSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  token: { type: String, required: true, unique: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  expiresAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('Invite', inviteSchema);
