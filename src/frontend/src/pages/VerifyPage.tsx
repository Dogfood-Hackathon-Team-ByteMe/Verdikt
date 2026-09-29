/**
 * VerifyPage — /verify/:serial. Public, no account needed.
 *
 * Renders one certificate and the result of checking its Ed25519 signature
 * against the instance's public key — the check runs on the server, and the
 * raw record, signature and key are all shown so a sceptic can re-run the
 * maths anywhere else. Print-friendly on purpose: this page IS the
 * certificate.
 *
 * The certificate sheet uses fixed light colours rather than theme tokens:
 * it is a document that gets printed and shared as an image, and it must look
 * identical whichever theme the viewer happens to be in.
 */
import { useParams } from "react-router-dom";
import { api } from "../api";
import type { CertificateVerification } from "../api/types";
import { useApi } from "../hooks/useApi";
import { AppShell, PageHeading } from "../sections/AppShell";
import { Alert, Badge, Button, Container } from "../ui";

const KIND_TITLE: Record<string, string> = {
  participation: "Certificate of Participation",
  placement: "Certificate of Achievement",
  judge: "Judge Participation Record",
};

/** The accent each kind carries: participation blue, placement gold, judge green. */
const KIND_ACCENT: Record<string, string> = {
  participation: "#1f3ae0",
  placement: "#f5b70a",
  judge: "#1fa463",
};

const INK = "#16150f";
const CREAM = "#fdfbf4";
const GOLD = "#f5b70a";

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

export default function VerifyPage() {
  const { serial = "" } = useParams();
  const check = useApi(() => api.verifyCertificate(serial), [serial]);

  if (check.loading && !check.data) {
    return (
      <AppShell>
        <Container className="py-20">
          <p className="label-mono text-subtle" role="status">Verifying the certificate</p>
        </Container>
      </AppShell>
    );
  }

  if (check.error || !check.data) {
    return (
      <AppShell>
        <Container className="py-20">
          <PageHeading label="Verification" title="No such certificate" tail="here.">
            Nothing was issued with that serial on this Verdikt. Check the link,
            or ask whoever sent it which instance issued it.
          </PageHeading>
        </Container>
      </AppShell>
    );
  }

  const cert = check.data;

  return (
    <AppShell>
      <Container className="py-12 sm:py-16 print:py-0">
        <div className="print:hidden">
          <PageHeading
            label="Verification"
            title={cert.valid ? "Signature verified." : "Signature INVALID."}
            actions={
              <Badge variant={cert.valid ? "green" : "red"}>
                {cert.valid ? "authentic" : "does not verify"}
              </Badge>
            }
          >
            {cert.valid
              ? "This record was signed by this Verdikt instance and has not been altered since."
              : "This record does not match its signature. Do not trust what it says."}
          </PageHeading>
        </div>

        {!cert.valid && (
          <Alert tone="danger" className="mt-6 print:hidden">
            The signature check failed. The record below is shown for
            inspection only.
          </Alert>
        )}

        <CertificateSheet cert={cert} />

        <div className="mt-8 flex flex-wrap justify-center gap-2 print:hidden">
          <Button size="sm" onClick={() => window.print()}>
            Print or save as PDF
          </Button>
        </div>

        <details className="mx-auto mt-10 max-w-3xl print:hidden">
          <summary className="cursor-pointer label-mono text-subtle">
            Verify it yourself: the signed record, signature and public key
          </summary>
          <pre className="mt-3 overflow-x-auto rounded-card bg-fog p-4 font-mono text-[0.7rem]">
{`record    ${cert.record}

signature ${cert.signature}

${cert.public_key_pem}`}
          </pre>
          <p className="mt-2 font-mono text-[0.75rem] text-subtle">
            Any Ed25519 verifier will do — the signature is over the record&apos;s
            exact bytes. The key is also served at /api/v1/keys/current.
          </p>
        </details>
      </Container>
    </AppShell>
  );
}

// === The certificate itself ==================================================

function CertificateSheet({ cert }: { cert: CertificateVerification }) {
  const d = cert.details;
  const accent = KIND_ACCENT[cert.kind] ?? "#1f3ae0";
  const issued = d.issuedAt ? new Date(d.issuedAt) : null;

  return (
    <div
      id="certificate-sheet"
      // Landscape, the proportions a certificate is expected to have: it fits
      // a printed page without spilling, and fits a laptop screen without
      // being scrolled to be read.
      className="relative mx-auto mt-10 max-w-4xl overflow-hidden shadow-[8px_8px_0_rgba(22,21,15,0.12)] print:mt-0 print:max-w-none print:shadow-none"
      style={{ background: CREAM, color: INK, border: `3px solid ${INK}`, borderRadius: 14 }}
    >
      {/* The inner rule, inset from the frame like a plate mark. */}
      <div
        className="pointer-events-none absolute inset-2.5 sm:inset-3.5"
        style={{ border: `1.5px solid ${accent}`, borderRadius: 8 }}
        aria-hidden="true"
      />
      {/* A faint engraving grid, so the sheet reads as paper, not a div. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `linear-gradient(${INK} 1px, transparent 1px), linear-gradient(90deg, ${INK} 1px, transparent 1px)`,
          backgroundSize: "26px 26px",
        }}
        aria-hidden="true"
      />
      <CornerFlourish className="left-5 top-5 sm:left-7 sm:top-7" accent={accent} />
      <CornerFlourish className="right-5 top-5 -scale-x-100 sm:right-7 sm:top-7" accent={accent} />
      <CornerFlourish className="bottom-5 left-5 -scale-y-100 sm:bottom-7 sm:left-7" accent={accent} />
      <CornerFlourish className="bottom-5 right-5 -scale-100 sm:bottom-7 sm:right-7" accent={accent} />

      {/* INVALID gets stamped across the sheet, not hidden in a banner. */}
      {!cert.valid && (
        <div
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center"
          aria-hidden="true"
        >
          <span
            className="rotate-[-18deg] border-4 px-6 py-2 font-mono text-[2.2rem] font-bold tracking-[0.2em] opacity-80"
            style={{ color: "#c0271b", borderColor: "#c0271b" }}
          >
            INVALID
          </span>
        </div>
      )}

      <div className="cert-body relative px-6 py-7 text-center sm:px-12 sm:py-9">
        {/* Masthead */}
        <CertificateMast accent={accent} />
        <div className="mt-2 font-mono text-[0.68rem] font-bold uppercase tracking-[0.35em]" style={{ color: INK }}>
          Verdikt
        </div>
        <div className="mt-1 font-mono text-[0.66rem] uppercase tracking-[0.18em] opacity-60">
          {d.event?.name ?? "A Verdikt event"}
        </div>

        {/* Title between hairline rules */}
        <div className="mt-5 flex items-center gap-4">
          <span className="h-px flex-1" style={{ background: INK, opacity: 0.25 }} />
          <h1 className="font-display text-[1.5rem] font-bold tracking-[-0.03em] sm:text-[1.95rem]">
            {KIND_TITLE[cert.kind] ?? "Certificate"}
          </h1>
          <span className="h-px flex-1" style={{ background: INK, opacity: 0.25 }} />
        </div>

        <p className="mt-5 font-mono text-[0.72rem] uppercase tracking-[0.22em] opacity-60">
          {cert.kind === "judge" ? "presented to" : "awarded to"}
        </p>
        <p className="font-display mt-1.5 text-[1.8rem] font-bold leading-tight tracking-[-0.02em] sm:text-[2.35rem]">
          {d.recipient?.name ?? "—"}
        </p>
        <NameFlourish accent={accent} />

        {/* The citation */}
        <div className="mx-auto mt-4 max-w-lg font-mono text-[0.82rem] leading-relaxed opacity-80">
          {cert.kind === "participation" && (
            <p>
              for building{d.project && <> <strong>{d.project}</strong></>}
              {d.team && <> with team <strong>{d.team}</strong></>} and seeing
              it through to submission
            </p>
          )}
          {cert.kind === "placement" && typeof d.place === "number" && (
            <p>
              for placing{" "}
              <strong style={{ color: accent }}>{ordinal(d.place)}</strong>
              {d.project && <> with <strong>{d.project}</strong></>}
              {d.team && <> (team {d.team})</>}
            </p>
          )}
          {cert.kind === "judge" && (
            <p>
              for serving on the judging panel
              {d.tracks && d.tracks.length > 0 && (
                <> of the <strong>{d.tracks.join(", ")}</strong> track{d.tracks.length > 1 ? "s" : ""}</>
              )}
              , casting <strong>{d.ballotsCast ?? 0}</strong>{" "}
              independent ballot{(d.ballotsCast ?? 0) === 1 ? "" : "s"}
            </p>
          )}
        </div>

        {/* Footer: date and serial on the left, the seal on the right. */}
        <div className="mt-7 flex items-end justify-between gap-6 text-left">
          <div className="font-mono text-[0.7rem] leading-relaxed opacity-70">
            {issued && (
              <>
                <div className="font-bold uppercase tracking-[0.14em]">Issued</div>
                <div>{issued.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</div>
              </>
            )}
            <div className="mt-2 font-bold uppercase tracking-[0.14em]">Serial</div>
            <div className="break-all">{cert.serial}</div>
          </div>
          <Seal accent={accent} valid={cert.valid} />
        </div>

        <p className="mt-5 font-mono text-[0.62rem] uppercase tracking-[0.14em] opacity-50">
          Ed25519-signed &middot;{" "}
          {cert.valid
            ? "verifies against this instance’s public key"
            : "FAILS verification"}
        </p>
      </div>
    </div>
  );
}

/** The gavel mark redrawn for the sheet: fixed light-palette colours. */
function CertificateMast({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 28 28" className="mx-auto h-10 w-10" aria-hidden="true">
      <rect x="2.5" y="2.5" width="23" height="23" rx="6" fill={accent} stroke={INK} strokeWidth="2" />
      <g transform="rotate(-34 14 12.5)">
        <rect x="13" y="10.6" width="2.4" height="7.4" rx="1.2" fill={CREAM} stroke={INK} strokeWidth="1.3" />
        <circle cx="14.2" cy="18.7" r="1.7" fill={CREAM} stroke={INK} strokeWidth="1.3" />
        <rect x="9" y="6.7" width="10.4" height="4.6" fill={CREAM} stroke={INK} strokeWidth="1.3" />
        <rect x="6.4" y="5.8" width="3" height="6.4" rx="1.2" fill={CREAM} stroke={INK} strokeWidth="1.3" />
        <rect x="19" y="5.8" width="3" height="6.4" rx="1.2" fill={CREAM} stroke={INK} strokeWidth="1.3" />
      </g>
      <g stroke="#ff4b3e" strokeWidth="1.5" strokeLinecap="round">
        <path d="M6.6 16.6l-1.4-1.1" />
        <path d="M4.9 18.6h1.8" />
      </g>
      <rect x="6.4" y="19.4" width="7" height="2" rx="1" fill="#ffd23f" stroke={INK} strokeWidth="1.3" />
      <rect x="5" y="21.4" width="11.2" height="2.4" rx="1.2" fill="#ffd23f" stroke={INK} strokeWidth="1.3" />
    </svg>
  );
}

/** One corner ornament; the other three are mirrored copies. */
function CornerFlourish({ className, accent }: { className?: string; accent: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={`pointer-events-none absolute h-8 w-8 sm:h-10 sm:w-10 ${className ?? ""}`}
      aria-hidden="true"
    >
      <path d="M2 26V8a6 6 0 0 1 6-6h18" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M9 20V13a4 4 0 0 1 4-4h7" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="2.5" cy="33" r="2" fill={accent} />
      <circle cx="33" cy="2.5" r="2" fill={accent} />
    </svg>
  );
}

/** The swash under the recipient's name. */
function NameFlourish({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 260 14" className="mx-auto mt-3 h-3.5 w-56" aria-hidden="true">
      <path
        d="M4 8c40-7 90 7 126 0s86-7 126 0"
        fill="none"
        stroke={accent}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="130" cy="8" r="2.6" fill={INK} />
    </svg>
  );
}

/** The scalloped seal, with ribbon tails and the verdict at its centre. */
function Seal({ accent, valid }: { accent: string; valid: boolean }) {
  const scallops = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    return { cx: 50 + Math.cos(angle) * 36, cy: 50 + Math.sin(angle) * 36 };
  });
  const face = valid ? accent : "#c0271b";

  return (
    <svg viewBox="0 0 100 132" className="h-24 w-20 shrink-0 sm:h-28 sm:w-24" aria-hidden="true">
      {/* ribbon tails */}
      <path d="M34 74L26 122l14-9 8 12 6-46" fill={face} stroke={INK} strokeWidth="2" strokeLinejoin="round" opacity="0.9" />
      <path d="M66 74l8 48-14-9-8 12-6-46" fill={GOLD} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      {/* scalloped edge */}
      {scallops.map((s, i) => (
        <circle key={i} cx={s.cx} cy={s.cy} r="9" fill={face} stroke={INK} strokeWidth="1.6" />
      ))}
      <circle cx="50" cy="50" r="36" fill={face} stroke={INK} strokeWidth="2" />
      <circle cx="50" cy="50" r="27" fill="none" stroke={CREAM} strokeWidth="1.6" strokeDasharray="3 3" />
      {valid ? (
        <path d="M36 51l10 10 19-21" fill="none" stroke={CREAM} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <g stroke={CREAM} strokeWidth="5.5" strokeLinecap="round">
          <path d="M40 40l20 20" />
          <path d="M60 40L40 60" />
        </g>
      )}
    </svg>
  );
}
