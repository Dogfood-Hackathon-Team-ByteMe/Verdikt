/**
 * The two T4 tabs of the event editor, in their own file because each is a
 * small app: Integrations (webhooks, the embed snippet, bulk export) and
 * Certificates (issue, list, link to the public verification page).
 */
import { useState } from "react";
import { ApiError, api } from "../api";
import type {
  Certificate,
  CertificateKind,
  HackEvent,
  Webhook,
  WebhookDelivery,
} from "../api/types";
import { useApi } from "../hooks/useApi";
import { Alert, Badge, Button, Card, Field, cn } from "../ui";

/** Where the API lives, for links that leave the SPA (embed, verify). */
const apiOrigin = () => {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured && configured !== "/") return configured.replace(/\/$/, "");
  return window.location.origin;
};

/** Copy with a moment of "Copied" feedback. */
function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1600);
    } catch {
      /* clipboard refused; the text is still selectable */
    }
  };
  return { copied, copy };
}

// === Integrations ===========================================================

const WEBHOOK_TYPES = [
  "project.submitted",
  "project.withdrawn",
  "ballot.cast",
  "judge.appointed",
  "judge.removed",
  "assignments.dealt",
  "comment.created",
  "vote.cast",
];

export function IntegrationsTab({ event }: { event: HackEvent }) {
  const hooks = useApi(() => api.listWebhooks(event.id), [event.id]);

  return (
    <div className="flex flex-col gap-6">
      <WebhooksCard event={event} hooks={hooks.data ?? []} loading={hooks.loading} error={hooks.error} onChanged={hooks.reload} />
      <EmbedCard event={event} />
      <ExportCard event={event} />
    </div>
  );
}

function WebhooksCard({
  event,
  hooks,
  loading,
  error,
  onChanged,
}: {
  event: HackEvent;
  hooks: Webhook[];
  loading: boolean;
  error: Error | undefined;
  onChanged: () => void;
}) {
  const [url, setUrl] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const toggle = (type: string) =>
    setTypes((t) => (t.includes(type) ? t.filter((x) => x !== type) : [...t, type]));

  const create = async () => {
    setBusy(true);
    setFormError(null);
    try {
      await api.createWebhook(event.id, { url, events: types });
      setUrl("");
      setTypes([]);
      onChanged();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not register the webhook.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card tone="paper" className="p-6 sm:p-7">
      <h2 className="headline text-[1.25rem]">Webhooks</h2>
      <p className="mt-2 font-mono text-[0.8rem] text-muted">
        POST the event&apos;s life to your own endpoints as it happens. Every
        delivery is signed &mdash; HMAC-SHA256 with the secret below over the
        exact body, in the <code>X-Verdikt-Signature</code> header &mdash; so
        your receiver can prove who is calling. A dead receiver never breaks
        the action it describes; failed deliveries wait here to be resent.
      </p>

      {error && <Alert tone="danger" className="mt-4">{error.message}</Alert>}
      {formError && <Alert tone="danger" className="mt-4">{formError}</Alert>}

      <div className="mt-5 flex flex-col gap-3">
        <Field
          label="Endpoint URL"
          placeholder="https://example.com/hooks/verdikt"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div>
          <div className="label-mono text-subtle">Deliveries wanted (none picked = all)</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEBHOOK_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => toggle(type)}
                className={cn(
                  "rounded-btn px-2.5 py-1 font-mono text-[0.72rem] ring-1 transition-colors",
                  types.includes(type)
                    ? "bg-ink text-paper ring-ink"
                    : "bg-fog text-muted ring-line hover:text-ink",
                )}
                aria-pressed={types.includes(type)}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Button size="sm" onClick={create} disabled={busy || !url.trim()} icon="plus">
            {busy ? "Registering" : "Register webhook"}
          </Button>
        </div>
      </div>

      {loading && hooks.length === 0 ? (
        <p className="mt-5 label-mono text-subtle" role="status">Loading webhooks</p>
      ) : hooks.length === 0 ? (
        <p className="mt-5 font-mono text-[0.8rem] text-subtle">No webhooks yet.</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {hooks.map((hook) => (
            <WebhookRow key={hook.id} hook={hook} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function WebhookRow({ hook, onChanged }: { hook: Webhook; onChanged: () => void }) {
  const { copied, copy } = useCopy();
  const [showSecret, setShowSecret] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteWebhook(hook.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-card bg-fog p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 font-mono text-[0.8rem]">
          <span className="font-bold break-all">{hook.url}</span>
          <span className="text-subtle">
            {" "}&middot; {hook.events.length === 0 ? "all deliveries" : hook.events.join(", ")}
          </span>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowLog((s) => !s)}>
            {showLog ? "Hide log" : "Delivery log"}
          </Button>
          <Button size="sm" variant="outline" onClick={remove} disabled={busy}>
            Remove
          </Button>
        </div>
      </div>

      <div className="mt-2 font-mono text-[0.72rem] text-subtle">
        Secret:{" "}
        <button type="button" className="underline decoration-dotted" onClick={() => setShowSecret((s) => !s)}>
          {showSecret ? hook.secret : "••••••••••••"}
        </button>{" "}
        <button type="button" className="underline decoration-dotted" onClick={() => copy(hook.id, hook.secret)}>
          {copied === hook.id ? "Copied" : "copy"}
        </button>
      </div>

      {showLog && <DeliveryLog webhookId={hook.id} />}
    </li>
  );
}

const DELIVERY_TONE: Record<WebhookDelivery["status"], "green" | "red" | "outline"> = {
  delivered: "green",
  failed: "red",
  pending: "outline",
};

function DeliveryLog({ webhookId }: { webhookId: string }) {
  const log = useApi(() => api.listWebhookDeliveries(webhookId), [webhookId]);
  const [redelivering, setRedelivering] = useState<string | null>(null);

  const redeliver = async (deliveryId: string) => {
    setRedelivering(deliveryId);
    try {
      await api.redeliverWebhook(webhookId, deliveryId);
      log.reload();
    } finally {
      setRedelivering(null);
    }
  };

  const rows = log.data ?? [];
  return (
    <div className="mt-3 border-t border-line pt-3">
      {log.loading && rows.length === 0 ? (
        <p className="label-mono text-subtle" role="status">Loading deliveries</p>
      ) : rows.length === 0 ? (
        <p className="font-mono text-[0.75rem] text-subtle">Nothing delivered yet.</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 font-mono text-[0.72rem]">
              <span className="min-w-0">
                <Badge variant={DELIVERY_TONE[d.status]} className="mr-2 align-middle">{d.status}</Badge>
                {d.type}
                <span className="text-subtle">
                  {" "}&middot; {d.attempts} {d.attempts === 1 ? "attempt" : "attempts"}
                  {d.response_status != null && ` · HTTP ${d.response_status}`}
                  {d.error && ` · ${d.error}`}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {d.created_at && <span className="text-subtle">{new Date(d.created_at).toLocaleString()}</span>}
                {d.status === "failed" && (
                  <Button size="sm" variant="outline" onClick={() => redeliver(d.id)} disabled={redelivering === d.id}>
                    {redelivering === d.id ? "Sending" : "Redeliver"}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function EmbedCard({ event }: { event: HackEvent }) {
  const { copied, copy } = useCopy();
  const src = `${apiOrigin()}/api/v1/events/${event.id}/embed`;
  const snippet = `<iframe src="${src}" width="100%" height="420" style="border:0" title="${event.name} gallery"></iframe>`;

  return (
    <Card tone="paper" className="p-6 sm:p-7">
      <h2 className="headline text-[1.25rem]">Embed the gallery</h2>
      <p className="mt-2 font-mono text-[0.8rem] text-muted">
        A self-contained page of this event&apos;s submitted entries, made to be
        iframed into any site. No script, no cookies, drafts never appear, and
        it updates as entries land.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-card bg-fog p-3 font-mono text-[0.72rem]">{snippet}</pre>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => copy("embed", snippet)}>
          {copied === "embed" ? "Copied" : "Copy snippet"}
        </Button>
        <Button size="sm" variant="outline" href={src}>
          Preview
        </Button>
      </div>
    </Card>
  );
}

function ExportCard({ event }: { event: HackEvent }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const bundle = await api.exportEvent(event.id);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `verdikt-${event.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card tone="paper" className="p-6 sm:p-7">
      <h2 className="headline text-[1.25rem]">Export everything</h2>
      <p className="mt-2 font-mono text-[0.8rem] text-muted">
        One JSON file carrying the whole event: settings, rubric, tracks, panel,
        teams, entries and every ballot. No password ever travels with it.
        Import it on any Verdikt &mdash; this one or someone else&apos;s &mdash;
        from the organizer home page, and the ranking comes out identical.
      </p>
      {error && <Alert tone="danger" className="mt-4">{error}</Alert>}
      <div className="mt-4">
        <Button size="sm" onClick={download} disabled={busy}>
          {busy ? "Building the bundle" : "Download bundle"}
        </Button>
      </div>
    </Card>
  );
}

// === Certificates ===========================================================

const KIND_LABELS: Record<CertificateKind, string> = {
  participation: "participation",
  placement: "placement",
  judge: "judge record",
};

export function CertificatesTab({ event }: { event: HackEvent }) {
  const certs = useApi(() => api.listCertificates(event.id), [event.id]);
  const projects = useApi(
    () => api.listProjects({ event_id: event.id }),
    [event.id],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [placeProject, setPlaceProject] = useState("");
  const [place, setPlace] = useState("1");

  const issue = async (kind: CertificateKind, extra?: { project_id: string; place: number }) => {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const issued = await api.issueCertificates(event.id, { kind, ...extra });
      setNotice(`${issued.length} ${KIND_LABELS[kind]} certificate${issued.length === 1 ? "" : "s"} issued.`);
      certs.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not issue.");
    } finally {
      setBusy(null);
    }
  };

  const submitted = (projects.data ?? []).filter((p) => p.status === "submitted");
  const rows = certs.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card tone="paper" className="p-6 sm:p-7">
        <h2 className="headline text-[1.25rem]">Issue certificates</h2>
        <p className="mt-2 font-mono text-[0.8rem] text-muted">
          Each is a JSON record signed with this instance&apos;s Ed25519 key.
          Recipients find theirs on their dashboard; anyone at all can check one
          at its public verification link, or offline with the public key.
          Issuing twice is safe &mdash; nobody gets two.
        </p>

        {error && <Alert tone="danger" className="mt-4">{error}</Alert>}
        {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => issue("participation")} disabled={busy !== null}>
            {busy === "participation" ? "Issuing" : "Participation — every submitted team"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => issue("judge")} disabled={busy !== null}>
            {busy === "judge" ? "Issuing" : "Judge records — everyone who scored"}
          </Button>
        </div>

        <div className="mt-5 border-t border-line pt-5">
          <div className="label-mono text-subtle">Place an entry</div>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="flex min-w-56 flex-col gap-1">
              <span className="label-mono text-subtle">Entry</span>
              <select
                className="rounded-btn bg-paper px-3 py-2 font-mono text-[0.8rem] ring-1 ring-line"
                value={placeProject}
                onChange={(e) => setPlaceProject(e.target.value)}
              >
                <option value="">Pick a submitted entry</option>
                {submitted.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </label>
            <label className="flex w-24 flex-col gap-1">
              <span className="label-mono text-subtle">Place</span>
              <input
                type="number"
                min={1}
                className="rounded-btn bg-paper px-3 py-2 font-mono text-[0.8rem] ring-1 ring-line"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
              />
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null || !placeProject}
              onClick={() => issue("placement", { project_id: placeProject, place: Number(place) })}
            >
              {busy === "placement" ? "Issuing" : "Issue placement"}
            </Button>
          </div>
        </div>
      </Card>

      <Card tone="paper" className="p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="headline text-[1.25rem]">Issued ({rows.length})</h2>
          <Button size="sm" variant="outline" onClick={() => certs.reload()} disabled={certs.loading}>
            Refresh
          </Button>
        </div>
        {certs.error && <Alert tone="danger" className="mt-4">{certs.error.message}</Alert>}
        {certs.loading && rows.length === 0 ? (
          <p className="mt-4 label-mono text-subtle" role="status">Loading certificates</p>
        ) : rows.length === 0 ? (
          <p className="mt-4 font-mono text-[0.8rem] text-subtle">
            Nothing issued yet. Certificates usually come after judging closes.
          </p>
        ) : (
          <ol className="mt-5 flex flex-col gap-2">
            {rows.map((cert) => (
              <CertRow key={cert.id} cert={cert} />
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

const KIND_TONE: Record<CertificateKind, "green" | "yellow" | "outline"> = {
  participation: "outline",
  placement: "yellow",
  judge: "green",
};

function CertRow({ cert }: { cert: Certificate }) {
  const { copied, copy } = useCopy();
  const link = `${window.location.origin}/verify/${cert.serial}`;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-fog p-3 font-mono text-[0.78rem]">
      <span className="min-w-0">
        <Badge variant={KIND_TONE[cert.kind]} className="mr-2 align-middle">{KIND_LABELS[cert.kind]}</Badge>
        <span className="font-bold">{cert.recipient_name}</span>
        <span className="text-subtle"> &middot; {cert.serial.slice(0, 8)}&hellip;</span>
      </span>
      <span className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" href={`/verify/${cert.serial}`}>
          View
        </Button>
        <Button size="sm" variant="outline" onClick={() => copy(cert.id, link)}>
          {copied === cert.id ? "Copied" : "Copy link"}
        </Button>
      </span>
    </li>
  );
}
