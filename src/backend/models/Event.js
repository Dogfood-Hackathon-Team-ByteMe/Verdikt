import mongoose from 'mongoose';

/**
 * A prize an organizer can configure on an event.
 * Subdocument rather than its own collection: prizes are never queried
 * independently of their event, and this keeps "configurable prizes" (a T1
 * requirement) to one write.
 */
const prizeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    amountUsd: { type: Number, default: 0, min: 0 },
    description: { type: String },
    // Null/absent means an overall prize rather than a per-track one.
    trackId: { type: mongoose.Schema.Types.ObjectId, ref: 'Track', default: null },
}, { _id: true });

/**
 * An organizer-defined question that every submission must answer.
 * T1 requires "organizer-defined custom questions" on the submission form;
 * the answers live in Project.customAnswers, keyed by `key`.
 */
const customQuestionSchema = new mongoose.Schema({
    // Stable machine key used as the Project.customAnswers map key.
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: ['text', 'longtext', 'url', 'select'], default: 'text' },
    // Only meaningful for type 'select'.
    options: [{ type: String }],
    required: { type: Boolean, default: false },
}, { _id: false });

/**
 * One line of the organizer's scoring rubric.
 *
 * Weights are relative, not percentages: a rubric of 3/1/1 and one of 60/20/20
 * rank identically, so the organizer can think in whichever they prefer and the
 * form never has to nag about summing to 100. The weighted score of a ballot is
 * `sum(score_i / maxScore_i * weight_i) / sum(weight_i)`, which lands in 0..1
 * whatever scale each line uses.
 *
 * Subdocument rather than its own collection, for the same reason as prizes and
 * custom questions: a rubric is never read apart from its event.
 */
const criterionSchema = new mongoose.Schema({
    // Stable machine key. It is the Score.scores map key, so renaming one
    // orphans every ballot already cast against it.
    key: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String },
    weight: { type: Number, default: 1, min: 0 },
    // Top of the scale for this line. 5 gives the familiar 1-5 ballot.
    maxScore: { type: Number, default: 5, min: 1 },
}, { _id: false });

const eventSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    tagline: { type: String },
    organiserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    judgeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    tracks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Track' }],

    // Configurable dates (T1). startsAt drives the "before / during / after"
    // state the landing page shows; submissionsClose is the hard deadline the
    // ProjectService enforces on every write.
    startsAt: { type: Date },
    submissionsClose: { type: Date },

    prizes: [prizeSchema],
    customQuestions: [customQuestionSchema],

    // The scoring rubric judges fill in. Empty means no rubric is configured
    // yet, and JudgeService refuses to open judging until it is not.
    criteria: [criterionSchema],

    eventTags: [{ type: String }],
    minTeamSize: { type: Number, default: 1, min: 1 },
    maxTeamSize: { type: Number, default: 4, min: 1 },
    // Banner across the top of the event. `/api/images/<id>`, or any URL.
    bannerUrl: { type: String, trim: true, default: '' },

    isJudgeApplyOpen: { type: Boolean, default: false },

    // Marks the event the public landing page features. Only one should be
    // true at a time; EventService clears the others when one is set.
    isFeatured: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('Event', eventSchema);
