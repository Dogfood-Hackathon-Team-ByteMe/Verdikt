import mongoose from 'mongoose';

/**
 * A team's submission.
 *
 * The field set follows the T1 submission data model: name, tagline, long
 * description, thumbnail, image gallery, hosted demo video URL, repository
 * URL, live link, tech tags, track selection, plus the organizer's custom
 * questions.
 *
 * Lifecycle: a project is created as a `draft`, can be edited freely while the
 * event's submissionsClose is in the future, and becomes `submitted` via
 * POST /api/projects/:id/submit. ProjectService refuses every write once the
 * deadline has passed -- the enforcement is server-side, not a disabled button.
 */
const projectSchema = new mongoose.Schema({
    // "name" in the spec.
    title: { type: String, required: true },
    // One-line pitch, shown on gallery cards.
    tagline: { type: String },
    // Short blurb under the card title.
    summary: { type: String },
    // The full write-up, shown on the project page.
    description: { type: String },

    // Media. thumbnailUrl is the card image; galleryUrls are the detail-page shots.
    thumbnailUrl: { type: String },
    galleryUrls: [{ type: String }],
    demoVideoUrl: { type: String },

    // Links. repoUrl is canonical; codeRepoLink is the original field name,
    // kept so older records still resolve, and mirrored on write.
    repoUrl: { type: String },
    codeRepoLink: { type: String },
    liveUrl: { type: String },
    ppts: { type: String },

    techTags: [{ type: String }],

    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    trackId: { type: mongoose.Schema.Types.ObjectId, ref: 'Track' },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },

    // Answers to Event.customQuestions, keyed by that question's `key`.
    customAnswers: { type: Map, of: String, default: () => new Map() },

    status: { type: String, enum: ['draft', 'submitted'], default: 'draft' },
    submittedAt: { type: Date },
}, { timestamps: true });

// The public gallery filters on status and track, and sorts by recency.
projectSchema.index({ eventId: 1, status: 1 });
projectSchema.index({ trackId: 1, status: 1 });

export default mongoose.model('Project', projectSchema);
