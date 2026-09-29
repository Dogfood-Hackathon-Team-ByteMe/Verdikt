/**
 * EventEditor — /organizer/events/:id.
 *
 * This is T1 requirement #3, "event creation with configurable dates, tracks
 * and prizes", plus the organizer-defined submission questions from the T1
 * data model. Four tabs, because they write to two different endpoints:
 *
 *   Details / Prizes / Questions / Rubric -> PUT /api/events/:id
 *   Tracks                       -> POST|PUT|DELETE /api/tracks
 *
 * Prizes and questions are whole-array replacements (the backend stores them
 * as subdocuments and overwrites the array), so the form always sends the
 * complete list. Tracks are separate documents and are edited one at a time.
 */
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../api";
import type {
  Assignment,
  AssignmentRun,
  AuditEntry,
  Criterion,
  CustomQuestion,
  HackEvent,
  JudgeApplication,
  JudgeInvite,
  Prize,
  RankingMethod,
  StandingRow,
  Track,
} from "../api/types";
import { useApi } from "../hooks/useApi";
import { CertificatesTab, IntegrationsTab } from "./EventEditorT4";
import { AppShell, PageHeading } from "../sections/AppShell";
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Field,
  Icon,
  ImagePicker,
  Segmented,
  cn,
} from "../ui";

type Tab =
  | "details"
  | "tracks"
  | "prizes"
  | "questions"
  | "rubric"
  | "judges"
  | "submissions"
  | "results"
  | "certificates"
  | "integrations"
  | "activity";

const TABS: Tab[] = [
  "details",
  "tracks",
  "prizes",
  "questions",
  "rubric",
  "judges",
  "submissions",
  "results",
  "certificates",
  "integrations",
  "activity",
];

const isTab = (value: string | null): value is Tab =>
  TABS.includes(value as Tab);

/** An ISO instant -> the "YYYY-MM-DDTHH:mm" a datetime-local input wants. */
const toLocalInput = (iso: string | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

export default function EventEditor() {
  const { id = "" } = useParams();
  const event = useApi(() => api.getEvent(id), [id]);
  // The open tab lives in the URL, so a reload does not throw you back to
  // Details half way through setting up a rubric, and so "look at my judges
  // tab" is a link someone can actually send. `replace` keeps Back going to
  // the previous page rather than walking back through eight tabs.
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = isTab(raw) ? raw : "details";
  const setTab = (next: Tab) => {
    const copy = new URLSearchParams(params);
    copy.set("tab", next);
    setParams(copy, { replace: true });
  };

  if (event.loading && !event.data) {
    return (
      <AppShell>
        <Container className="py-20">
          <p className="label-mono text-subtle" role="status">
            Loading the event
          </p>
        </Container>
      </AppShell>
    );
  }

  if (!event.data) {
    return (
      <AppShell>
        <Container className="py-20">
          <PageHeading label="Not found" title="No event" tail="here.">
            It may have been deleted, or you may not organise it.
          </PageHeading>
          <Button className="mt-8" href="/organizer" icon="arrowRight">
            Back to your events
          </Button>
        </Container>
      </AppShell>
    );
  }

  const e = event.data;
  const closed = new Date(e.submissions_close) < new Date();

  return (
    <AppShell>
      <Container className="py-12 sm:py-16">
        <PageHeading
          label="Manage event"
          title={e.name}
          actions={
            <Badge variant={closed ? "outline" : "green"}>
              {closed ? "submissions closed" : "open"}
            </Badge>
          }
        >
          {e.tagline || e.description}
        </PageHeading>

        <div className="mt-8">
          <Segmented<Tab>
            label="Event settings"
            value={tab}
            onChange={setTab}
            options={[
              { id: "details", label: "Details" },
              { id: "tracks", label: `Tracks (${e.tracks.length})` },
              { id: "prizes", label: `Prizes (${e.prizes.length})` },
              {
                id: "questions",
                label: `Questions (${e.custom_questions.length})`,
              },
              { id: "rubric", label: `Rubric (${e.criteria.length})` },
              { id: "judges", label: `Judges (${e.judge_ids.length})` },
              { id: "submissions", label: "Submissions" },
              { id: "results", label: "Results" },
              { id: "certificates", label: "Certificates" },
              { id: "integrations", label: "Integrations" },
              { id: "activity", label: "Activity" },
            ]}
          />
        </div>

        <div className="mt-8">
          {tab === "details" && <DetailsTab event={e} onSaved={event.reload} />}
          {tab === "tracks" && <TracksTab event={e} onChanged={event.reload} />}
          {tab === "prizes" && <PrizesTab event={e} onSaved={event.reload} />}
          {tab === "questions" && (
            <QuestionsTab event={e} onSaved={event.reload} />
          )}
          {tab === "rubric" && <RubricTab event={e} onSaved={event.reload} />}
          {tab === "judges" && <JudgesTab event={e} onChanged={event.reload} />}
          {tab === "submissions" && <SubmissionsTab event={e} />}
          {tab === "results" && <ResultsTab event={e} />}
          {tab === "certificates" && <CertificatesTab event={e} />}
          {tab === "integrations" && <IntegrationsTab event={e} />}
          {tab === "activity" && <ActivityTab event={e} />}
        </div>

        <Button href="/organizer" variant="outline" className="mt-12">
          Back to your events
        </Button>
      </Container>
    </AppShell>
  );
}

/** Shared save-state plumbing for the tabs that PUT the event. */
function useSaver(save: () => Promise<unknown>, onSaved: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await save();
      onSaved();
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, saved, run };
}

// --- Details ---------------------------------------------------------------

function DetailsTab({
  event,
  onSaved,
}: {
  event: HackEvent;
  onSaved: () => void;
}) {
  const [name, setName] = useState(event.name);
  const [tagline, setTagline] = useState(event.tagline ?? "");
  const [banner, setBanner] = useState(event.banner_url ?? "");
  const [description, setDescription] = useState(event.description ?? "");
  const [startsAt, setStartsAt] = useState(toLocalInput(event.starts_at));
  const [closesAt, setClosesAt] = useState(
    toLocalInput(event.submissions_close),
  );
  const [minSize, setMinSize] = useState(String(event.min_team_size));
  const [maxSize, setMaxSize] = useState(String(event.max_team_size));

  const { busy, error, saved, run } = useSaver(
    () =>
      api.updateEvent(event.id, {
        name: name.trim(),
        tagline: tagline.trim(),
        banner_url: banner,
        description: description.trim(),
        starts_at: startsAt ? new Date(startsAt).toISOString() : undefined,
        submissions_close: closesAt
          ? new Date(closesAt).toISOString()
          : undefined,
        min_team_size: Number(minSize) || 1,
        max_team_size: Number(maxSize) || 4,
      }),
    onSaved,
  );

  // Mirrors the server's rule (EventService.assertTeamSizes). An event whose
  // minimum is above its maximum can never be completed: joining stops at the
  // maximum, so no team ever reaches the minimum. Caught here so the organiser
  // sees it as they type; the server refuses it regardless.
  const min = Number(minSize);
  const max = Number(maxSize);
  const sizesValid =
    Number.isInteger(min) && Number.isInteger(max) && min >= 1 && max >= 1;
  const sizeError = !sizesValid
    ? "Team sizes must be whole numbers of at least 1."
    : min > max
      ? `A minimum of ${min} cannot be larger than the maximum of ${max}.`
      : null;

  return (
    <Card tone="paper" className="p-6 sm:p-7">
      <h2 className="headline text-[1.25rem]">Details and dates</h2>
      {error && <Alert className="mt-5">{error}</Alert>}

      <div className="mt-6 flex flex-col gap-5">
        <Field
          label="Event name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Tagline"
          placeholder="One line for the hero"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
        />
        <Field
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <ImagePicker
          label="Event banner"
          shape="banner"
          hint="Shown across the event card. PNG, JPEG, WEBP or GIF, up to 2 MB."
          value={banner}
          onChange={setBanner}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <DateField
            label="Starts at"
            value={startsAt}
            onChange={setStartsAt}
            hint="Drives the before / during / after state."
          />
          <DateField
            label="Submissions close"
            value={closesAt}
            onChange={setClosesAt}
            hint="The hard deadline. The server refuses writes after it."
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Min team size"
            type="number"
            min={1}
            max={max >= 1 ? max : undefined}
            value={minSize}
            error={sizeError ?? undefined}
            onChange={(e) => setMinSize(e.target.value)}
          />
          <Field
            label="Max team size"
            type="number"
            min={min >= 1 ? min : 1}
            value={maxSize}
            hint="A team can hold this many people, including the leader."
            onChange={(e) => setMaxSize(e.target.value)}
          />
        </div>

        <div>
          <Button
            disabled={busy || Boolean(sizeError)}
            onClick={() => void run()}
          >
            {busy ? "Saving..." : saved ? "Saved" : "Save details"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function DateField({
  label,
  value,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  hint?: string;
  onChange: (v: string) => void;
}) {
  const id = `date-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="label-mono text-ink">
        {label}
      </label>
      <input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-btn bg-paper px-3.5 font-mono text-[0.9rem] text-ink outline-none ring-1 ring-line transition-[box-shadow] duration-200 hover:ring-subtle focus:ring-2 focus:ring-ink"
      />
      {hint && <p className="font-mono text-[0.72rem] text-subtle">{hint}</p>}
    </div>
  );
}

// --- Tracks ----------------------------------------------------------------

function TracksTab({
  event,
  onChanged,
}: {
  event: HackEvent;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update tracks.");
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    act(async () => {
      await api.createTrack({
        event_id: event.id,
        name: name.trim(),
        description: description.trim(),
      });
      setName("");
      setDescription("");
    });

  return (
    <div className="flex flex-col gap-5">
      <Card tone="paper" className="p-6 sm:p-7">
        <h2 className="headline text-[1.25rem]">Tracks</h2>
        <p className="mt-2 font-mono text-[0.8rem] text-muted">
          Teams pick one track per project. A project cannot be submitted
          without one.
        </p>
        {error && <Alert className="mt-5">{error}</Alert>}

        {event.tracks.length === 0 ? (
          <p className="mt-6 rounded-card bg-fog p-5 text-center font-mono text-[0.85rem] text-muted">
            No tracks yet. Add at least one, or nobody can submit.
          </p>
        ) : (
          <ul className="mt-6 flex flex-col divide-y divide-line">
            {event.tracks.map((t) => (
              <TrackRow
                key={t.id}
                track={t}
                busy={busy}
                onChanged={onChanged}
                onError={setError}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card tone="paper" className="p-6 sm:p-7">
        <h3 className="headline text-[1.05rem]">Add a track</h3>
        <div className="mt-5 flex flex-col gap-4">
          <Field
            label="Name"
            placeholder="Judging Engines"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Field
            label="Description"
            placeholder="Ranking, normalization and audit trails."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div>
            <Button
              disabled={busy || !name.trim()}
              onClick={() => void add()}
              icon="plus"
            >
              {busy ? "Working..." : "Add track"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function TrackRow({
  track,
  busy,
  onChanged,
  onError,
}: {
  track: Track;
  busy: boolean;
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(track.name);
  const [confirming, setConfirming] = useState(false);

  const save = async () => {
    try {
      await api.updateTrack(track.id, { name: name.trim() });
      setEditing(false);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not rename the track.");
    }
  };

  const remove = async () => {
    try {
      await api.deleteTrack(track.id);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not delete the track.");
    }
  };

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      {editing ? (
        <>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-btn bg-paper px-3 font-mono text-[0.85rem] outline-none ring-1 ring-ink"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setName(track.name);
              }}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="min-w-0">
            <div className="truncate font-mono text-[0.88rem] font-bold">
              {track.name}
            </div>
            {track.description && (
              <div className="truncate font-mono text-[0.75rem] text-subtle">
                {track.description}
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Rename
            </Button>
            {confirming ? (
              <>
                {/* Deleting a track orphans any project pointing at it, so it
                    asks twice rather than once. */}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  Really delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirming(false)}
                >
                  No
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirming(true)}
              >
                Delete
              </Button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

// --- Prizes ----------------------------------------------------------------

function PrizesTab({
  event,
  onSaved,
}: {
  event: HackEvent;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<Prize[]>(event.prizes);
  const { busy, error, saved, run } = useSaver(
    () =>
      api.updateEvent(event.id, {
        prizes: rows.map((p) => ({
          name: p.name.trim(),
          amount_usd: Number(p.amount_usd) || 0,
          description: p.description,
          track: p.track || null,
        })),
      }),
    onSaved,
  );

  const set = (i: number, patch: Partial<Prize>) =>
    setRows((r) =>
      r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    );

  const total = rows.reduce((sum, p) => sum + (Number(p.amount_usd) || 0), 0);

  return (
    <Card tone="paper" className="p-6 sm:p-7">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="headline text-[1.25rem]">Prizes</h2>
        <span className="font-mono text-[0.8rem] text-muted tnum">
          ${total.toLocaleString()} total
        </span>
      </div>
      {error && <Alert className="mt-5">{error}</Alert>}

      <ul className="mt-6 flex flex-col gap-4">
        {rows.map((p, i) => (
          <li key={i} className="rounded-card bg-fog p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_140px_180px_auto] sm:items-end">
              <Field
                label="Name"
                value={p.name}
                onChange={(e) => set(i, { name: e.target.value })}
              />
              <Field
                label="Amount (USD)"
                type="number"
                min={0}
                value={String(p.amount_usd)}
                onChange={(e) => set(i, { amount_usd: Number(e.target.value) })}
              />
              <div className="flex flex-col gap-1.5">
                <label className="label-mono text-ink">Track</label>
                <select
                  value={p.track ?? ""}
                  onChange={(e) => set(i, { track: e.target.value || null })}
                  className="h-12 w-full rounded-btn bg-paper px-3 font-mono text-[0.85rem] outline-none ring-1 ring-line focus:ring-2 focus:ring-ink"
                >
                  <option value="">Overall</option>
                  {event.tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
              >
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {rows.length === 0 && (
        <p className="mt-6 rounded-card bg-fog p-5 text-center font-mono text-[0.85rem] text-muted">
          No prizes yet.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          variant="outline"
          icon="plus"
          onClick={() =>
            setRows((r) => [
              ...r,
              { id: `new-${r.length}`, name: "", amount_usd: 0, track: null },
            ])
          }
        >
          Add prize
        </Button>
        <Button disabled={busy} onClick={() => void run()}>
          {busy ? "Saving..." : saved ? "Saved" : "Save prizes"}
        </Button>
      </div>
    </Card>
  );
}

// --- Custom questions ------------------------------------------------------

function QuestionsTab({
  event,
  onSaved,
}: {
  event: HackEvent;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<CustomQuestion[]>(event.custom_questions);
  const { busy, error, saved, run } = useSaver(
    () =>
      api.updateEvent(event.id, {
        custom_questions: rows.filter((q) => q.key.trim() && q.label.trim()),
      }),
    onSaved,
  );

  const set = (i: number, patch: Partial<CustomQuestion>) =>
    setRows((r) =>
      r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    );

  return (
    <Card tone="paper" className="p-6 sm:p-7">
      <h2 className="headline text-[1.25rem]">Submission questions</h2>
      <p className="mt-2 font-mono text-[0.8rem] text-muted">
        Added to every team&apos;s submission form. A required question blocks
        submission until it is answered, and the server enforces that.
      </p>
      {error && <Alert className="mt-5">{error}</Alert>}

      <ul className="mt-6 flex flex-col gap-4">
        {rows.map((q, i) => (
          <li key={i} className="rounded-card bg-fog p-4">
            {/* items-START, not items-end. Only the Key field carries a hint,
                and bottom-aligning made its extra line push every other input
                down out of step with it. Tops align, so the inputs line up. */}
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_150px] sm:items-start">
              <Field
                label="Question"
                placeholder="What was the hardest part?"
                value={q.label}
                onChange={(e) => set(i, { label: e.target.value })}
              />
              <Field
                label="Key"
                hint="Stable id. Changing it orphans existing answers."
                placeholder="whatsHard"
                value={q.key}
                onChange={(e) =>
                  set(i, { key: e.target.value.replace(/\s+/g, "") })
                }
              />
              <div className="flex flex-col gap-1.5">
                <label className="label-mono text-ink">Type</label>
                <select
                  value={q.type}
                  onChange={(e) =>
                    set(i, { type: e.target.value as CustomQuestion["type"] })
                  }
                  className="h-12 w-full rounded-btn bg-paper px-3 font-mono text-[0.85rem] outline-none ring-1 ring-line focus:ring-2 focus:ring-ink"
                >
                  <option value="text">Short text</option>
                  <option value="longtext">Long text</option>
                  <option value="url">URL</option>
                </select>
              </div>
            </div>
            {/* Row-level actions share one line under the fields, so Remove no
                longer floats against a field whose height it cannot match. */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <label className="flex items-center gap-2 font-mono text-[0.78rem]">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) => set(i, { required: e.target.checked })}
                  className="h-4 w-4 accent-[var(--color-blue)]"
                />
                Required before a team can submit
              </label>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
              >
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {rows.length === 0 && (
        <p className="mt-6 rounded-card bg-fog p-5 text-center font-mono text-[0.85rem] text-muted">
          No custom questions. Teams will only fill in the standard fields.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          variant="outline"
          icon="plus"
          onClick={() =>
            setRows((r) => [
              ...r,
              { key: "", label: "", type: "text", required: false },
            ])
          }
        >
          Add question
        </Button>
        <Button disabled={busy} onClick={() => void run()}>
          {busy ? "Saving..." : saved ? "Saved" : "Save questions"}
        </Button>
      </div>
    </Card>
  );
}

// --- Rubric ----------------------------------------------------------------

/**
 * The scoring rubric judges fill in.
 *
 * Weights are relative rather than percentages, so the form never has to nag
 * about summing to 100 -- it just shows each line's share of the running total,
 * which is the number that actually decides the ranking. Changing a key after
 * judging opens orphans every ballot cast against the old one, so the key field
 * says so and locks itself once the rubric has been saved with scores against
 * it... which the editor cannot know, so it warns rather than locks.
 */
function RubricTab({
  event,
  onSaved,
}: {
  event: HackEvent;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<Criterion[]>(event.criteria);
  const clean = rows.filter((c) => c.key.trim() && c.label.trim());
  const { busy, error, saved, run } = useSaver(
    () => api.updateEvent(event.id, { criteria: clean }),
    onSaved,
  );

  const set = (i: number, patch: Partial<Criterion>) =>
    setRows((r) =>
      r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    );

  const totalWeight = clean.reduce((sum, c) => sum + (c.weight || 0), 0);
  const duplicate = clean.find(
    (c, i) => clean.findIndex((o) => o.key === c.key) !== i,
  );

  return (
    <Card tone="paper" className="p-6 sm:p-7">
      <h2 className="headline text-[1.25rem]">Scoring rubric</h2>
      <p className="mt-2 font-mono text-[0.8rem] text-muted">
        What judges score each entry on. Weights are relative, not percentages
        &mdash; 3/1/1 ranks exactly the same as 60/20/20, so use whichever reads
        better. Each line is scaled to its own maximum before it is weighted.
      </p>

      {error && <Alert className="mt-5">{error}</Alert>}
      {duplicate && (
        <Alert className="mt-5">
          Two lines share the key &ldquo;{duplicate.key}&rdquo;. Keys are what
          ballots are stored under, so they have to be unique.
        </Alert>
      )}

      <ul className="mt-6 flex flex-col gap-4">
        {rows.map((c, i) => {
          const share =
            totalWeight > 0
              ? Math.round(((c.weight || 0) / totalWeight) * 100)
              : 0;
          return (
            <li key={i} className="rounded-card bg-fog p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr] sm:items-start">
                <Field
                  label="Criterion"
                  placeholder="Impact"
                  value={c.label}
                  onChange={(e) => set(i, { label: e.target.value })}
                />
                <Field
                  label="Key"
                  hint="Stable id. Changing it orphans ballots already cast."
                  placeholder="impact"
                  value={c.key}
                  onChange={(e) =>
                    set(i, { key: e.target.value.replace(/\s+/g, "") })
                  }
                />
              </div>

              <div className="mt-3">
                <Field
                  label="Note for judges"
                  hint="Optional. Shown under the criterion on the ballot."
                  placeholder="Does it matter to anyone outside the room?"
                  value={c.description ?? ""}
                  onChange={(e) => set(i, { description: e.target.value })}
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-[140px_140px_1fr] sm:items-end">
                <Field
                  label="Weight"
                  type="number"
                  min={0}
                  step={1}
                  value={String(c.weight)}
                  onChange={(e) =>
                    set(i, { weight: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
                <Field
                  label="Out of"
                  type="number"
                  min={1}
                  step={1}
                  value={String(c.max_score)}
                  onChange={(e) =>
                    set(i, {
                      max_score: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                />
                <div className="flex items-center justify-between gap-3 pb-1">
                  <span className="font-mono text-[0.78rem] text-subtle">
                    {share}% of the final score
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setRows((r) => r.filter((_, idx) => idx !== i))
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {rows.length === 0 && (
        <p className="mt-6 rounded-card bg-fog p-5 text-center font-mono text-[0.85rem] text-muted">
          No rubric yet. Judges cannot score this event until there is one.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          icon="plus"
          onClick={() =>
            setRows((r) => [
              ...r,
              { key: "", label: "", weight: 1, max_score: 5 },
            ])
          }
        >
          Add criterion
        </Button>
        <Button
          disabled={busy || Boolean(duplicate)}
          onClick={() => void run()}
        >
          {busy ? "Saving..." : saved ? "Saved" : "Save rubric"}
        </Button>
        {clean.length > 0 && (
          <span className="font-mono text-[0.75rem] text-subtle">
            {clean.length} criteri{clean.length === 1 ? "on" : "a"} &middot;
            total weight {totalWeight}
          </span>
        )}
      </div>
    </Card>
  );
}

// --- Judges ----------------------------------------------------------------

/**
 * Who judges what, and which entries each judge reviews.
 *
 * Judges are appointed per TRACK, because that is the shape a real panel has --
 * someone judges the security entries, not all ninety -- and the server keeps
 * a track judge out of other tracks. Below the tracks, batch assignment deals
 * the entries out so every one gets the same number of independent reviews.
 *
 * Tracks come from /api/tracks rather than off the event: GET /api/events
 * populates `tracks` but not the judges nested inside each one, so reading
 * event.tracks here would list every judge as a blank row.
 */
function JudgesTab({
  event,
  onChanged,
}: {
  event: HackEvent;
  onChanged: () => void;
}) {
  const tracks = useApi(() => api.listTracks(event.id), [event.id]);
  const rows = tracks.data ?? [];
  // Bumped whenever the panel changes, so the assignments panel refetches.
  const [panelVersion, setPanelVersion] = useState(0);

  const reload = () => {
    tracks.reload();
    setPanelVersion((v) => v + 1);
    onChanged();
  };

  if (tracks.loading && !tracks.data) {
    return (
      <Card tone="paper" className="p-6">
        <p className="label-mono text-subtle" role="status">
          Loading the panel
        </p>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card tone="paper" className="p-6 sm:p-7">
        <h2 className="headline text-[1.25rem]">Judges</h2>
        <p className="mt-2 font-mono text-[0.85rem] text-muted">
          Judges are appointed on a track, so add a track first and they can be
          assigned to it.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card tone="paper" className="p-6 sm:p-7">
        <h2 className="headline text-[1.25rem]">Judges</h2>
        <p className="mt-2 font-mono text-[0.8rem] text-muted">
          Appointed per track. Add someone who already has an account by their
          email, or send an invite link to anyone &mdash; it only works for the
          address you send it to. A judge scores only their own tracks, and
          nobody on a team here can be appointed.
        </p>
      </Card>

      <ApplicationsPanel event={event} onChanged={reload} />

      {rows.map((track) => (
        <TrackJudges key={track.id} track={track} onChanged={reload} />
      ))}

      <AssignmentsPanel event={event} panelVersion={panelVersion} />
    </div>
  );
}

/**
 * Judge applications: the other way onto a panel.
 *
 * An invite is the organizer choosing someone. An application is someone
 * choosing the event, which only works while the organizer has opened the
 * door -- so the switch that opens it lives here, next to the queue it fills,
 * rather than being buried among the event's dates and team sizes.
 *
 * Accepting appoints the applicant to the track they asked for, which is the
 * same appointment path an invite takes: the backend re-checks at this moment
 * that they have not joined a team in the meantime, so a stale row cannot
 * smuggle a participant onto the panel.
 */
function ApplicationsPanel({
  event,
  onChanged,
}: {
  event: HackEvent;
  onChanged: () => void;
}) {
  const apps = useApi(() => api.listJudgeApplications(event.id), [event.id]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(event.judge_apply_open);
  const [toggling, setToggling] = useState(false);

  // The event is refetched by the parent after a save, so mirror the server's
  // answer rather than leaving the switch on whatever was clicked.
  useEffect(() => setOpen(event.judge_apply_open), [event.judge_apply_open]);

  const rows = apps.data ?? [];
  const pending = rows.filter((a) => a.status === "pending");
  const decided = rows.filter((a) => a.status !== "pending");

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    setToggling(true);
    setError(null);
    try {
      await api.updateEvent(event.id, { is_judge_apply_open: next });
      onChanged();
    } catch (e) {
      setOpen(!next);
      setError(e instanceof ApiError ? e.message : "Could not change that.");
    } finally {
      setToggling(false);
    }
  };

  const decide = async (id: string, accept: boolean) => {
    setBusyId(id);
    setError(null);
    try {
      if (accept) await api.acceptJudgeApplication(id);
      else await api.rejectJudgeApplication(id);
      apps.reload();
      // Accepting adds a judge to a track, so the panel and its assignments
      // are now stale.
      if (accept) onChanged();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Could not record that decision.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card tone="paper" className="p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-80">
          <h3 className="headline text-[1.05rem]">
            Applications
            {pending.length > 0 && (
              <Badge variant="yellow" className="ml-2 align-middle">
                {pending.length} waiting
              </Badge>
            )}
          </h3>
          <p className="mt-2 font-mono text-[0.8rem] text-muted">
            {open
              ? "Anyone signed in can ask to judge a track. Nobody on a team here, and not you."
              : "Applications are closed. Judges can still be added by email or invite link."}
          </p>
        </div>
        <Button
          size="sm"
          variant={open ? "outline" : "primary"}
          className="shrink-0"
          disabled={toggling}
          onClick={() => void toggle()}
        >
          {open ? "Close applications" : "Open applications"}
        </Button>
      </div>

      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}

      {apps.loading && !apps.data ? (
        <p className="mt-4 label-mono text-subtle" role="status">
          Loading applications
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-4 font-mono text-[0.8rem] text-subtle">
          {open ? "Nobody has applied yet." : "No applications were received."}
        </p>
      ) : (
        <>
          {pending.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {pending.map((app) => (
                <ApplicationRow
                  key={app.id}
                  app={app}
                  busy={busyId === app.id}
                  onAccept={() => void decide(app.id, true)}
                  onReject={() => void decide(app.id, false)}
                />
              ))}
            </ul>
          )}
          {decided.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
              {decided.map((app) => (
                <ApplicationRow key={app.id} app={app} busy={false} />
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

function ApplicationRow({
  app,
  busy,
  onAccept,
  onReject,
}: {
  app: JudgeApplication;
  busy: boolean;
  onAccept?: () => void;
  onReject?: () => void;
}) {
  const decided = app.status !== "pending";

  return (
    <li className={cn("rounded-card bg-fog p-3", decided && "opacity-70")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 font-mono text-[0.78rem]">
          <span className="font-bold">
            {app.applicant.name || app.applicant.email || "Someone"}
          </span>
          {app.applicant.email && app.applicant.name && (
            <span className="text-subtle"> &middot; {app.applicant.email}</span>
          )}
          {app.track_name && (
            <span className="text-subtle"> &middot; {app.track_name}</span>
          )}
        </div>
        {decided ? (
          <Badge variant={app.status === "accepted" ? "green" : "outline"}>
            {app.status}
          </Badge>
        ) : (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={onAccept}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={onReject}
            >
              Reject
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

function TrackJudges({
  track,
  onChanged,
}: {
  track: Track;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);
  // Local copy so a row disappears the moment it is removed, rather than after
  // the parent has refetched every track.
  const [judges, setJudges] = useState(track.judges);
  const invites = useApi(() => api.listJudgeInvites(track.id), [track.id]);
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => setJudges(track.judges), [track.judges]);

  const run = async (work: () => Promise<Track>) => {
    setBusy(true);
    setError(null);
    setNoAccount(false);
    try {
      setJudges((await work()).judges);
      onChanged();
      return true;
    } catch (e) {
      // Verbatim: "they are competing in this event" is the server's call and
      // the organizer needs the actual reason, not a generic failure.
      setError(e instanceof Error ? e.message : "Could not update the judges.");
      setNoAccount(e instanceof ApiError && e.status === 404);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const value = email.trim();
    if (!value) return;
    if (await run(() => api.addTrackJudge(track.id, value))) setEmail("");
  };

  const invite = async () => {
    const value = email.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    setNoAccount(false);
    try {
      const made = await api.createJudgeInvite(track.id, value);
      setFresh(made.id);
      setEmail("");
      invites.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the invite.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.revokeJudgeInvite(id);
      invites.reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not withdraw the invite.",
      );
    } finally {
      setBusy(false);
    }
  };

  const list = invites.data ?? [];
  const open = list.filter((i) => i.status === "pending");
  const closed = list.filter((i) => i.status !== "pending");

  return (
    <Card tone="paper" className="p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="headline text-[1.1rem]">{track.name}</h3>
        <span className="label-mono text-subtle">
          {judges.length} judge{judges.length === 1 ? "" : "s"}
          {open.length > 0 && ` · ${open.length} invited`}
        </span>
      </div>

      {error && (
        <Alert className="mt-4">
          {error}
          {noAccount &&
            " Send them an invite link instead — it works before they sign up."}
        </Alert>
      )}

      {judges.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-line">
          {judges.map((j) => (
            <li
              key={j.id}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0 font-mono text-[0.82rem]">
                <span className="font-bold">{j.name || j.email}</span>
                {j.name && j.email && (
                  <span className="text-subtle"> &middot; {j.email}</span>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(() => api.removeTrackJudge(track.id, j.id))
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        {/* No hint on the Field itself: the row is bottom-aligned, and a hint
            line under the input pushed the buttons below the box they act on.
            The explanation sits under the whole row instead. */}
        <Field
          label="Add a judge"
          type="email"
          placeholder="judge@example.com"
          value={email}
          disabled={busy}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-[240px] flex-1"
        />
        <div className="flex gap-2">
          <Button
            type="submit"
            variant="outline"
            icon="plus"
            disabled={busy || !email.trim()}
          >
            {busy ? "Working..." : "Add"}
          </Button>
          <Button
            variant="ghost"
            disabled={busy || !email.trim()}
            onClick={() => void invite()}
          >
            Invite by link
          </Button>
        </div>
        <p className="w-full font-mono text-[0.72rem] text-subtle">
          Add appoints an existing account now. Invite by link works for anyone,
          even before they sign up.
        </p>
      </form>

      {open.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {open.map((inv) => (
            <InviteRow
              key={inv.id}
              invite={inv}
              highlight={inv.id === fresh}
              busy={busy}
              onRevoke={() => void revoke(inv.id)}
            />
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer font-mono text-[0.72rem] text-subtle">
            {closed.length} past invite{closed.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {closed.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 py-2 font-mono text-[0.76rem]"
              >
                <span className="truncate text-muted">{inv.email}</span>
                <Badge
                  variant={inv.status === "accepted" ? "green" : "outline"}
                >
                  {inv.status}
                </Badge>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

/** One open invite: who it is for, the link to send them, and a way to withdraw it. */
function InviteRow({
  invite,
  highlight,
  busy,
  onRevoke,
}: {
  invite: JudgeInvite;
  highlight: boolean;
  busy: boolean;
  onRevoke: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/judge-invite/${invite.token}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be refused (insecure origin, permissions). The link is on
      // screen and selectable either way.
      setCopied(false);
    }
  };

  return (
    <li
      className={cn(
        "rounded-card bg-fog p-3",
        highlight && "ring-2 ring-yellow",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 font-mono text-[0.78rem]">
          <span className="font-bold">{invite.email}</span>
          {invite.expires_at && (
            <span className="text-subtle">
              {" "}
              &middot; expires{" "}
              {new Date(invite.expires_at).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onRevoke}>
            Withdraw
          </Button>
        </div>
      </div>
      <input
        readOnly
        value={url}
        aria-label={`Invite link for ${invite.email}`}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-2 w-full rounded-btn bg-paper px-3 py-2 font-mono text-[0.72rem] text-muted outline-none ring-1 ring-line"
      />
    </li>
  );
}

/**
 * Batch assignment: deal N independent reviews of every submitted entry across
 * the panel. Re-running tops up rather than starting over, so it is safe to run
 * again after late entries or new judges.
 */
function AssignmentsPanel({
  event,
  panelVersion,
}: {
  event: HackEvent;
  panelVersion: number;
}) {
  const assignments = useApi(
    () => api.listAssignments(event.id),
    [event.id, panelVersion],
  );
  const [reviews, setReviews] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<AssignmentRun | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const list = assignments.data ?? [];
  const scored = list.filter((a) => a.scored).length;

  const byJudge = new Map<string, { name: string; items: Assignment[] }>();
  for (const a of list) {
    const key = a.judge_id;
    if (!byJudge.has(key))
      byJudge.set(key, {
        name: a.judge_name || a.judge_email || "Judge",
        items: [],
      });
    byJudge.get(key)!.items.push(a);
  }

  const work = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      assignments.reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update the assignments.",
      );
    } finally {
      setBusy(false);
    }
  };

  const deal = () =>
    work(async () => {
      setRunResult(await api.autoAssign(event.id, reviews));
    });

  const clear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    setConfirmClear(false);
    void work(async () => {
      await api.clearAssignments(event.id);
      setRunResult(null);
    });
  };

  return (
    <Card tone="paper" className="p-6 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="headline text-[1.25rem]">Assignments</h2>
        {list.length > 0 && (
          <span className="label-mono text-subtle">
            {scored}/{list.length} reviews in
          </span>
        )}
      </div>
      <p className="mt-2 font-mono text-[0.8rem] text-muted">
        Deal every submitted entry to a number of judges from its own track,
        spreading the load evenly. Once assignments exist, each judge sees and
        scores only their batch. Entries a judge already scored are kept in
        their batch, and if a track has too few judges the gap is reported
        rather than filled from another track.
      </p>

      {error && <Alert className="mt-4">{error}</Alert>}

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <Field
          label="Reviews per entry"
          type="number"
          min={1}
          max={10}
          step={1}
          value={String(reviews)}
          disabled={busy}
          onChange={(e) =>
            setReviews(
              Math.max(
                1,
                Math.min(10, Math.round(Number(e.target.value) || 1)),
              ),
            )
          }
          className="w-44"
        />
        <Button disabled={busy} onClick={() => void deal()}>
          {busy
            ? "Working..."
            : list.length > 0
              ? "Top up assignments"
              : "Deal assignments"}
        </Button>
        {list.length > 0 && (
          <Button variant="ghost" disabled={busy} onClick={clear}>
            {confirmClear ? "Click again to clear all" : "Clear all"}
          </Button>
        )}
      </div>

      {runResult && (
        <div className="mt-5 rounded-card bg-fog p-4 font-mono text-[0.78rem]">
          <div>
            Dealt {runResult.dealt} new review{runResult.dealt === 1 ? "" : "s"}
            {runResult.adopted > 0 &&
              `, kept ${runResult.adopted} already scored`}{" "}
            &middot; {runResult.total} in total at{" "}
            {runResult.reviews_per_project} per entry.
          </div>
          {runResult.shortfall.length > 0 && (
            <div className="mt-3">
              <div className="font-bold text-red">
                {runResult.shortfall.length}{" "}
                {runResult.shortfall.length === 1 ? "entry is" : "entries are"}{" "}
                short
              </div>
              <ul className="mt-1 flex flex-col gap-0.5 text-muted">
                {runResult.shortfall.slice(0, 8).map((s) => (
                  <li key={s.project_id}>
                    {s.title} ({s.track_name ?? "no track"}): {s.assigned}/
                    {s.wanted} &mdash; the track has {s.eligible_judges} judge
                    {s.eligible_judges === 1 ? "" : "s"}
                  </li>
                ))}
                {runResult.shortfall.length > 8 && (
                  <li>and {runResult.shortfall.length - 8} more</li>
                )}
              </ul>
              <div className="mt-1 text-subtle">
                Appoint more judges to those tracks, then top up.
              </div>
            </div>
          )}
        </div>
      )}

      {assignments.loading && !assignments.data ? (
        <p className="mt-5 label-mono text-subtle" role="status">
          Loading assignments
        </p>
      ) : list.length === 0 ? (
        <p className="mt-5 rounded-card bg-fog p-4 text-center font-mono text-[0.82rem] text-muted">
          No assignments yet. Until there are, judges score every entry in their
          own tracks.
        </p>
      ) : (
        <ul className="mt-5 flex flex-col divide-y divide-line">
          {[...byJudge.entries()].map(([judgeId, group]) => {
            const done = group.items.filter((a) => a.scored).length;
            return (
              <li key={judgeId} className="py-3">
                <details>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <span className="font-mono text-[0.84rem] font-bold">
                      {group.name}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-fog">
                        <span
                          className="block h-full rounded-full bg-yellow"
                          style={{
                            width: `${(done / group.items.length) * 100}%`,
                          }}
                        />
                      </span>
                      <span className="tnum font-mono text-[0.76rem] text-subtle">
                        {done}/{group.items.length}
                      </span>
                    </span>
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1 pl-2">
                    {group.items.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-3 font-mono text-[0.76rem]"
                      >
                        <span className="min-w-0 truncate">
                          {a.project_title}
                          <span className="text-subtle">
                            {" "}
                            &middot; {a.track_name ?? "no track"}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {a.scored ? (
                            <Badge variant="green">scored</Badge>
                          ) : (
                            <Badge variant="outline">to do</Badge>
                          )}
                          {!a.scored && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                void work(() => api.removeAssignment(a.id))
                              }
                            >
                              Unassign
                            </Button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      {list.length > 0 && (
        <Button
          href={`/api/events/${event.id}/assignments.csv`}
          size="sm"
          variant="outline"
          icon="arrowUpRight"
          className="mt-5"
        >
          Download assignments CSV
        </Button>
      )}
    </Card>
  );
}

// --- Results ---------------------------------------------------------------

/** How often the dashboard refetches while it is open and visible. */
const LIVE_EVERY_MS = 10_000;

/** A 0..1 score as a percentage to one decimal, or a dash. */
const pctText = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(1)}%`;

/**
 * The live leaderboard, plus how far judging has actually got.
 *
 * Computed server-side on every read and refetched every few seconds while the
 * tab is open, so it tracks ballots as they land. Two scores are always shown:
 * raw, and after cross-judge normalization. The organizer picks which one ranks,
 * but never loses sight of the other -- the correction is there to be checked,
 * not taken on trust.
 */
function ResultsTab({ event }: { event: HackEvent }) {
  const [method, setMethod] = useState<RankingMethod>("normalized");
  const [groupByTrack, setGroupByTrack] = useState(false);
  const [live, setLive] = useState(true);
  const standings = useApi(
    () => api.getStandings(event.id, method),
    [event.id, method],
  );
  const { reload } = standings;

  // Live: refetch on a timer, but only while someone can see it. A background
  // tab polling forever is load for nobody.
  useEffect(() => {
    if (!live) return;
    const tick = () => {
      if (document.visibilityState === "visible") reload();
    };
    const id = window.setInterval(tick, LIVE_EVERY_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [live, reload]);

  // A one-second clock for the "updated Ns ago" line.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (standings.loading && !standings.data) {
    return (
      <Card tone="paper" className="p-6">
        <p className="label-mono text-subtle" role="status">
          Computing the standings
        </p>
      </Card>
    );
  }

  if (standings.error && !standings.data) {
    return (
      <Card tone="paper" className="p-6">
        <Alert>{standings.error.message}</Alert>
      </Card>
    );
  }

  const data = standings.data;
  if (!data) return null;

  const { criteria, progress, normalization } = data;
  const rows = data.standings;

  if (criteria.length === 0) {
    // No rubric means no judged ranking -- but the community poll does not
    // need one, so it still shows. A crowd can applaud before a jury exists.
    return (
      <div className="flex flex-col gap-5">
        <Card tone="paper" className="p-6 sm:p-7">
          <h2 className="headline text-[1.25rem]">No rubric yet</h2>
          <p className="mt-2 font-mono text-[0.85rem] text-muted">
            There is nothing to rank by until the rubric is set. Add criteria on
            the Rubric tab and judges can start scoring.
          </p>
        </Card>
        <CommunityPanel event={event} />
      </div>
    );
  }

  const age = Math.max(
    0,
    Math.round((now - new Date(data.computed_at).getTime()) / 1000),
  );
  const batched = progress.assignment_count > 0;
  const reviewsDone = progress.judges.reduce((n, j) => n + j.assigned_done, 0);

  // The panel's average habit, so each judge can be described relative to it.
  const means = progress.judges
    .map((j) => j.mean_score)
    .filter((m): m is number => m !== null);
  const panelMean = means.length
    ? means.reduce((a, b) => a + b, 0) / means.length
    : null;

  const groups = groupByTrack
    ? [
        ...event.tracks.map((t) => ({
          id: t.id,
          name: t.name,
          rows: rows.filter((r) => r.track_id === t.id),
        })),
        { id: "none", name: "No track", rows: rows.filter((r) => !r.track_id) },
      ].filter((g) => g.rows.length > 0)
    : [{ id: "all", name: "", rows }];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Entries" value={progress.project_count} />
        <Stat label="Scored" value={progress.scored_project_count} />
        <Stat label="Not scored" value={progress.unscored_project_count} />
        <Stat
          label={batched ? "Reviews done" : "Ballots"}
          value={batched ? reviewsDone : progress.ballot_count}
        />
      </div>

      {batched && (
        <p className="-mt-2 font-mono text-[0.75rem] text-subtle">
          {reviewsDone} of {progress.assignment_count} assigned reviews are in.
        </p>
      )}

      {progress.unscored_project_count > 0 && (
        <Alert tone="info">
          {progress.unscored_project_count}{" "}
          {progress.unscored_project_count === 1 ? "entry has" : "entries have"}{" "}
          no ballots yet. They are listed at the bottom, unranked &mdash; an
          unjudged entry is not a last-placed one.
        </Alert>
      )}

      {method === "normalized" && normalization.groups > 1 && (
        <Alert tone="info">
          Your judges fall into {normalization.groups} groups that never scored
          a common entry, so each group&apos;s habits are corrected against its
          own members only. Differences <em>between</em> those groups cannot be
          measured from the ballots and are left as they are. See JUDGING.md.
        </Alert>
      )}

      <Card tone="paper" className="p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="headline text-[1.25rem]">Standings</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented<RankingMethod>
              label="Rank by"
              value={method}
              onChange={setMethod}
              options={[
                { id: "normalized", label: "Normalized" },
                { id: "raw", label: "Raw" },
              ]}
            />
            <Segmented<"overall" | "track">
              label="Group standings"
              value={groupByTrack ? "track" : "overall"}
              onChange={(v) => setGroupByTrack(v === "track")}
              options={[
                { id: "overall", label: "Overall" },
                { id: "track", label: "By track" },
              ]}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-3xl font-mono text-[0.78rem] text-muted">
            {method === "normalized"
              ? "Ranked after correcting for each judge’s habits, so a harsh judge and a generous one count the same. The raw score is shown alongside."
              : "Ranked by the plain mean of each entry’s ballots, uncorrected. Normalized is shown alongside."}{" "}
            Each criterion is scaled to its own maximum before weighting. Tied
            entries share a rank.
          </p>
          <div className="flex items-center gap-3">
            <span
              className="font-mono text-[0.72rem] text-subtle"
              aria-live="polite"
            >
              {live ? (
                <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-green align-middle" />
              ) : null}
              Updated {age < 2 ? "just now" : `${age}s ago`}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLive((v) => !v)}
            >
              {live ? "Pause live" : "Go live"}
            </Button>
            <Button size="sm" variant="outline" onClick={reload}>
              Refresh
            </Button>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="mt-6 rounded-card bg-fog p-5 text-center font-mono text-[0.85rem] text-muted">
            Nothing has been submitted yet.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="mt-6">
              {group.name && (
                <div className="label-mono mb-2 text-red">{group.name}</div>
              )}
              <StandingsTable
                rows={group.rows}
                criteria={criteria}
                rankField={groupByTrack ? "track_rank" : "rank"}
                method={method}
                batched={batched}
              />
            </div>
          ))
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            href={`/api/events/${event.id}/standings.csv?method=${method}`}
            size="sm"
            variant="outline"
            icon="arrowUpRight"
          >
            Download standings CSV
          </Button>
          <Button
            href={`/api/export.csv?eventId=${event.id}`}
            size="sm"
            variant="ghost"
            icon="arrowUpRight"
          >
            Every ballot (CSV)
          </Button>
        </div>
        <p className="mt-3 font-mono text-[0.72rem] text-subtle">
          Standings: one row per entry, ranked as shown, with both scores and
          each criterion average. Every ballot: one row per ballot per
          criterion, each with its raw and normalized score.
        </p>
      </Card>

      <Card tone="paper" className="p-6 sm:p-7">
        <h2 className="headline text-[1.25rem]">The panel</h2>
        <p className="mt-2 font-mono text-[0.8rem] text-muted">
          Each judge&apos;s average score is what normalization corrects for: a
          judge who scores everything high counts the same as one who scores
          everything low. A judge with only one ballot, or who shares no entry
          with any other judge, cannot be compared and is left as scored.
        </p>

        {progress.judges.length === 0 ? (
          <p className="mt-5 rounded-card bg-fog p-4 text-center font-mono text-[0.82rem] text-muted">
            No judges appointed yet.
          </p>
        ) : (
          <ul className="mt-5 flex flex-col divide-y divide-line">
            {progress.judges.map((judge) => {
              const total = batched
                ? judge.assigned_count
                : progress.project_count;
              const done = batched ? judge.assigned_done : judge.ballot_count;
              const lean =
                judge.mean_score === null || panelMean === null
                  ? null
                  : judge.mean_score - panelMean > 0.05
                    ? "scores high"
                    : panelMean - judge.mean_score > 0.05
                      ? "scores low"
                      : "middle of the panel";
              return (
                <li
                  key={judge.judge_id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0 font-mono text-[0.82rem]">
                    <span className="font-bold">
                      {judge.name || judge.email || "Judge"}
                    </span>
                    {judge.name && judge.email && (
                      <span className="text-subtle">
                        {" "}
                        &middot; {judge.email}
                      </span>
                    )}
                    <div className="mt-0.5 text-[0.72rem] text-subtle">
                      {judge.mean_score === null ? (
                        "No ballots yet"
                      ) : (
                        <>
                          Averages {pctText(judge.mean_score)}
                          {lean && <> &middot; {lean}</>}
                          {" · "}
                          {judge.corrected
                            ? "corrected"
                            : judge.uncorrected_reason === "too-few-ballots"
                              ? "not corrected: one ballot is not enough to tell"
                              : "not corrected: shares no entry with another judge"}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-fog">
                      <div
                        className="h-full rounded-full bg-yellow"
                        style={{
                          width: total
                            ? `${Math.min(100, (done / total) * 100)}%`
                            : "0%",
                        }}
                      />
                    </div>
                    <span className="tnum font-mono text-[0.78rem] text-subtle">
                      {done}/{total}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <CommunityPanel event={event} />
    </div>
  );
}

/**
 * The crowd's pick, beside the judged table and pointedly not inside it.
 * Votes come from the public poll endpoint; nothing here reads ballots, and
 * nothing in the standings reads votes.
 */
function CommunityPanel({ event }: { event: HackEvent }) {
  const poll = useApi(() => api.getCommunityPoll(event.id), [event.id]);
  const rows = (poll.data?.standings ?? []).filter((r) => r.vote_count > 0).slice(0, 8);

  return (
    <Card tone="paper" className="p-6 sm:p-7">
      <h3 className="headline text-[1.05rem]">Community favourites</h3>
      <p className="mt-2 font-mono text-[0.8rem] text-muted">
        The public&apos;s applause, one vote per person. It never feeds the judged ranking above &mdash; publish
        both and let them disagree in the open.
      </p>
      {poll.loading && !poll.data ? (
        <p className="mt-4 label-mono text-subtle" role="status">
          Counting votes
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-4 font-mono text-[0.8rem] text-subtle">No votes yet.</p>
      ) : (
        <ol className="mt-4 flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.project_id} className="flex items-center justify-between gap-3 rounded-card bg-fog p-3">
              <div className="min-w-0 font-mono text-[0.8rem]">
                <span className="tnum mr-2 font-bold">#{row.rank}</span>
                {/* -my-1 keeps the row height while the padding lifts the
                    hit area over the 24px minimum. */}
                <Link
                  to={`/projects/${row.project_id}`}
                  className="-my-1 inline-block py-1 font-bold hover:text-blue"
                >
                  {row.title}
                </Link>
                {row.team_name && <span className="text-subtle"> &middot; {row.team_name}</span>}
              </div>
              <span className="tnum shrink-0 font-mono text-[0.8rem] font-bold">
                {row.vote_count}
                <span className="ml-1 font-normal text-subtle">{row.vote_count === 1 ? "vote" : "votes"}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/** The table itself. Scrolls sideways rather than squeezing the criteria out. */
function StandingsTable({
  rows,
  criteria,
  rankField,
  method,
  batched,
}: {
  rows: StandingRow[];
  criteria: Criterion[];
  rankField: "rank" | "track_rank";
  method: RankingMethod;
  batched: boolean;
}) {
  const DASH = "—";
  const ranked = (col: RankingMethod) =>
    col === method ? "font-bold text-ink" : "font-normal text-muted";
  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="border-b-2 border-ink text-left">
            <th className="label-mono w-12 pb-2 text-subtle">#</th>
            <th className="label-mono pb-2 text-subtle">Entry</th>
            <th className="label-mono pb-2 text-subtle">Track</th>
            <th className="label-mono whitespace-nowrap px-3 pb-2 text-right text-subtle">
              {batched ? "Reviews" : "Ballots"}
            </th>
            {/* nowrap + padding, not a fixed width: a long criterion name in a
                narrow cell wrapped onto itself and ran into the next heading. */}
            {criteria.map((c) => (
              <th
                key={c.key}
                className="label-mono whitespace-nowrap px-3 pb-2 text-right text-subtle"
                title={`${c.label}, out of ${c.max_score}, weight ${c.weight}`}
              >
                {c.label}
              </th>
            ))}
            <th className="label-mono whitespace-nowrap px-3 pb-2 text-right text-subtle">
              Raw
            </th>
            <th
              className="label-mono whitespace-nowrap pb-2 pl-3 text-right text-subtle"
              title="After cross-judge normalization. Not clamped: a strong entry seen by a harsh judge can land a little past 100%."
            >
              Normalized
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const score =
              method === "raw" ? row.weighted_score : row.normalized_score;
            const unjudged = score === null;
            const rank = row[rankField];
            return (
              <tr
                key={row.project_id}
                className={cn("border-b border-line", unjudged && "opacity-55")}
              >
                <td className="tnum py-3 font-mono text-[0.9rem] font-bold">
                  {rank ?? DASH}
                </td>
                <td className="py-3 pr-3">
                  <Link
                    to={`/projects/${row.project_id}`}
                    className="font-mono text-[0.86rem] font-bold hover:text-blue"
                  >
                    {row.title}
                  </Link>
                  {row.team_name && (
                    <div className="truncate font-mono text-[0.72rem] text-subtle">
                      {row.team_name}
                    </div>
                  )}
                </td>
                <td className="py-3 pr-3 font-mono text-[0.76rem] text-subtle">
                  {row.track_name ?? DASH}
                </td>
                <td className="tnum whitespace-nowrap px-3 py-3 text-right font-mono text-[0.8rem] text-subtle">
                  {batched
                    ? `${row.ballot_count}/${row.assigned_count}`
                    : row.ballot_count}
                </td>
                {criteria.map((c) => {
                  const value = row.per_criterion[c.key];
                  return (
                    <td
                      key={c.key}
                      className="tnum px-3 py-3 text-right font-mono text-[0.8rem] text-muted"
                    >
                      {typeof value === "number" ? value.toFixed(1) : DASH}
                    </td>
                  );
                })}
                <td
                  className={cn(
                    "tnum whitespace-nowrap px-3 py-3 text-right font-mono text-[0.86rem]",
                    ranked("raw"),
                  )}
                >
                  {row.weighted_score === null ? (
                    <span className="font-normal text-subtle">not scored</span>
                  ) : (
                    pctText(row.weighted_score)
                  )}
                </td>
                <td
                  className={cn(
                    "tnum whitespace-nowrap py-3 pl-3 text-right font-mono text-[0.86rem]",
                    ranked("normalized"),
                  )}
                >
                  {row.normalized_score === null ? (
                    <span className="font-normal text-subtle">not scored</span>
                  ) : (
                    pctText(row.normalized_score)
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Submissions overview --------------------------------------------------

function SubmissionsTab({ event }: { event: HackEvent }) {
  // An organizer sees drafts for their own event, which is exactly what makes
  // this view useful before the deadline.
  const projects = useApi(
    () => api.listProjects({ event_id: event.id }),
    [event.id],
  );
  const teams = useApi(() => api.listTeams(event.id), [event.id]);

  const rows = projects.data ?? [];
  const submitted = rows.filter((p) => p.status === "submitted");

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Teams" value={teams.data?.length ?? 0} />
        <Stat label="Submitted" value={submitted.length} />
        <Stat label="Still draft" value={rows.length - submitted.length} />
      </div>

      <Card tone="paper" className="p-6 sm:p-7">
        <h2 className="headline text-[1.25rem]">Entries</h2>
        {projects.loading && !projects.data ? (
          <p className="mt-5 label-mono text-subtle" role="status">
            Loading
          </p>
        ) : rows.length === 0 ? (
          <p className="mt-6 rounded-card bg-fog p-5 text-center font-mono text-[0.85rem] text-muted">
            Nothing submitted yet.
          </p>
        ) : (
          <ul className="mt-5 flex flex-col divide-y divide-line">
            {rows.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-[0.88rem] font-bold">
                    {p.title}
                  </div>
                  <div className="truncate font-mono text-[0.75rem] text-subtle">
                    {p.team} &middot; {p.track_name ?? "no track"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge
                    variant={p.status === "submitted" ? "green" : "outline"}
                  >
                    {p.status}
                  </Badge>
                  <Button href={`/projects/${p.id}`} size="sm" variant="ghost">
                    View
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card tone="ink" className="p-6">
        <div className="label-mono flex items-center gap-2 text-yellow">
          <Icon name="chart" size={13} strokeWidth={2.2} />
          Export
        </div>
        <p className="mt-3 font-mono text-[0.78rem] leading-relaxed text-slab-fg/70">
          A CSV for each stage. Entries: every submission, drafts included, with
          its answers. Ballots: one row per ballot per criterion, the long shape
          for analysis. Standings and assignments are on the Results and Judges
          tabs. Organizers only.
        </p>
        <Button
          href={`/api/events/${event.id}/entries.csv`}
          size="sm"
          variant="dark"
          className="mt-4 mr-3"
          icon="arrowUpRight"
        >
          Download entries (CSV)
        </Button>
        <Button
          href={`/api/export.csv?eventId=${event.id}`}
          size="sm"
          variant="dark"
          className="mt-4"
          icon="arrowUpRight"
        >
          Download every ballot (CSV)
        </Button>
      </Card>
    </div>
  );
}

/**
 * The audit trail: every change to who can do what on this event.
 *
 * Standings explain the numbers; this explains the panel that produced them.
 * If a team disputes a result, the question is usually not "what did the judge
 * score" but "why was that person judging at all" -- so the rows name the
 * actor, the action and the moment, and nothing here can edit them.
 *
 * Read by the organiser of this event and by an admin. A judge is refused,
 * because the trail names every other judge and the order they arrived in.
 */
function ActivityTab({ event }: { event: HackEvent }) {
  const trail = useApi(() => api.listAuditTrail(event.id), [event.id]);
  const rows = trail.data ?? [];

  return (
    <Card tone="paper" className="p-6 sm:p-7">
      {/* min-w-0/basis lets the prose shrink instead of pushing the button
          onto its own line, and shrink-0 stops the button being squeezed. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-80">
          <h2 className="headline text-[1.25rem]">Activity</h2>
          <p className="mt-2 font-mono text-[0.8rem] text-muted">
            Every change to this event&apos;s panel and settings, newest first.
            Append-only &mdash; there is no way to edit or delete a line, here
            or over the API.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => trail.reload()}
          disabled={trail.loading}
        >
          Refresh
        </Button>
      </div>

      {trail.error && (
        <Alert tone="danger" className="mt-4">
          {trail.error.message}
        </Alert>
      )}

      {trail.loading && !trail.data ? (
        <p className="mt-4 label-mono text-subtle" role="status">
          Loading the trail
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-4 font-mono text-[0.8rem] text-subtle">
          Nothing recorded yet. Appointing a judge, dealing assignments or
          changing the rubric will show up here.
        </p>
      ) : (
        <ol className="mt-5 flex flex-col gap-2">
          {rows.map((row) => (
            <AuditRow key={row.id} row={row} />
          ))}
        </ol>
      )}
    </Card>
  );
}

/**
 * How each action reads in plain English. An action with no entry here falls
 * back to its dotted name rather than being dropped, so a row added to the
 * backend shows up the moment it exists.
 */
const AUDIT_LABELS: Record<string, string> = {
  "judge.appointed": "appointed a judge",
  "judge.removed": "removed a judge",
  "application.accepted": "accepted a judge application",
  "application.rejected": "rejected a judge application",
  "judge_invite.created": "sent a judge invite",
  "judge_invite.revoked": "withdrew a judge invite",
  "assignments.dealt": "dealt review assignments",
  "assignments.cleared": "cleared review assignments",
  "event.updated": "changed the event",
};

const AUDIT_TONE: Record<string, "green" | "red" | "yellow" | "outline"> = {
  "judge.appointed": "green",
  "application.accepted": "green",
  "judge.removed": "red",
  "application.rejected": "red",
  "judge_invite.revoked": "red",
  "assignments.dealt": "yellow",
  "assignments.cleared": "yellow",
};

/** The one detail worth showing beside each action, if there is one. */
function auditDetail(row: AuditEntry): string | null {
  const meta = row.meta ?? {};
  if (row.action === "event.updated") {
    const fields = Array.isArray(meta.fields) ? (meta.fields as string[]) : [];
    return fields.length ? fields.join(", ") : null;
  }
  if (row.action === "assignments.dealt") {
    return `${meta.created ?? 0} added at ${meta.reviewsPerProject ?? "?"} per entry`;
  }
  if (typeof meta.email === "string") return meta.email;
  return null;
}

function AuditRow({ row }: { row: AuditEntry }) {
  const label = AUDIT_LABELS[row.action] ?? row.action;
  const detail = auditDetail(row);
  const when = row.created_at ? new Date(row.created_at) : null;

  return (
    <li className="rounded-card bg-fog p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 font-mono text-[0.78rem]">
          <Badge
            variant={AUDIT_TONE[row.action] ?? "outline"}
            className="mr-2 align-middle"
          >
            {label}
          </Badge>
          <span className="font-bold">
            {row.actor?.name || row.actor?.email || "Someone not signed in"}
          </span>
          {detail && <span className="text-subtle"> &middot; {detail}</span>}
        </div>
        {when && (
          <time
            dateTime={when.toISOString()}
            className="font-mono text-[0.72rem] text-subtle"
          >
            {when.toLocaleString()}
          </time>
        )}
      </div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card tone="paper" className="p-5">
      <div className="label-mono text-subtle">{label}</div>
      <div className="headline mt-2 text-[2rem] tnum">{value}</div>
    </Card>
  );
}
