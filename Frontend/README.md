# Verdikt — Frontend

Landing page for **Verdikt**, our DOGFOOD 2026 submission/judging portal.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build -> dist/
npm run build:preview  # single self-contained HTML -> dist-preview/
```

## Stack

React 18 · Vite 6 · TypeScript · Tailwind CSS v4 (via `@tailwindcss/vite`).
Fonts: **Space Grotesk** (bold headlines) + **Space Mono** (body, labels, data).

## Design system (use it for every new page)

A "developer graph-paper" look: cream paper with a faint grid and two red rule
lines, monospace text, bold Space Grotesk headlines, primary-colour blocks and a
yellow action colour.

- **Tokens** live in `src/index.css` under `@theme`. Use the class names, never raw hex:
  `ink` `ink-2` `paper` `cream` `fog` `line` `muted` `subtle` ·
  `blue` `blue-deep` `blue-soft` `blue-mist` `blue-ink` · `yellow` `yellow-deep` · `red` · `green` ·
  `success` `danger`, plus `rounded-btn` / `rounded-card` / `rounded-panel`,
  and the text roles `headline`, `label-mono`, `tnum`.
  Four tokens exist so that things which must *not* flip with the theme don't:
  `on-bright` (text on yellow/red/green, always dark), `slab` / `slab-fg` (the
  always-dark card), `band` / `band-fg` (the full-bleed tier band),
  `panel-1` / `panel-2` (the CTA gradient), `rule` and `shadow`.
- **Components** live in `src/ui/`. Import them from `src/ui` (the folder's index file):

| Component | What it is |
|---|---|
| `Button` | Action button. `variant` primary/blue/dark/outline/ghost, `size` sm/md/lg, `icon` adds a sliding arrow, `magnetic` follows the pointer. Hard offset shadow on hover, presses in on click. Pass `href` to render a link. |
| `Badge` | Mono pill, optional pulsing `dot`. |
| `Card` | Ink-ringed surface. `tone` paper/cream/fog/ink/blue/yellow/red/green/outline, `interactive` lifts, `tilt` tilts toward the pointer with glare. |
| `Panel` (`SkyPanel`) | Solid blue band with an inner grid, used for the closing call to action. |
| `Section`, `SectionHeading`, `SectionLabel` | Section wrapper, "// LABEL" eyebrow, heading with a blue tail. `onColor` keeps contrast on a coloured band. |
| `Reveal`, `CountUp` | Fade-up on scroll, numbers counting up on scroll. |
| `Chip`, `SearchField`, `Segmented` | Filters, search input, tab switcher with a sliding yellow pill. |
| `Accordion`, `Dialog` | FAQ-style expanders, modal. |
| `ThemeToggle` | Light/dark switch (sun ⇄ moon). Sits in the nav. |
| `AvatarStack`, `IconBubble`, `Marquee`, `Ring`, `Logo`, `Icon`, `Container` | Supporting pieces. |

Open **`#ui-kit`** (e.g. `http://localhost:5173/#ui-kit`) to see every component live.

Page sections are in `src/sections/`, one file each:
Hero (+ `Isometric` illustration and `Stats` row) → Logo strip → About → Tier ladder
→ How it works → Scoring → Roles → Gallery → Timeline → Prizes → FAQ → Self-host CTA → Footer.
Event copy that the backend doesn't serve yet (tiers, rubric, timeline, FAQ) is in `src/content/dogfood.ts`.

## Hooking up the backend

All data goes through one interface: `src/api/client.ts` (`VerdiktApi`).

- No `VITE_API_URL` set → `src/api/mock.ts` (sample data shaped like the DOGFOOD fixtures).
- `VITE_API_URL=http://localhost:8080` in `.env` → `src/api/http.ts` calls the real API.
- Route paths are in `routes` at the top of `src/api/http.ts`. Change them to match the backend's `.dogfood.toml [routes]`.
- Types in `src/api/types.ts` use the spec's snake_case field names (`submissions_close`, `repo_url`, `submitted_at`…).

Endpoints the page expects (all public GET):

| Method | Used for |
|---|---|
| `getFeaturedEvent()` | Hero countdown, tracks, prizes, live step in "How it works" |
| `listProjects({ q, track })` | Public gallery search + filter, hero scoresheet |
| `getProject(id)` | Project detail (future page) |
| `getStats()` | Judge count in the About section |
| `getActivity()` | Not shown right now; kept for a future activity feed |

Components never import mock data directly, so switching needs no component changes.

> DOGFOOD disqualifies "hardcoded frontends". Before submitting, set `VITE_API_URL` so the gallery reads real data.

## Structure

```
src/
  api/        types, VerdiktApi interface, mock + http implementations
  hooks/      useApi, useCountdown
  ui/         the reusable component kit
  sections/   landing page sections
  pages/      UiKit (#ui-kit)
  content/    static DOGFOOD copy
  index.css   design tokens and keyframes
```

Every section is built from `src/ui`, so restyling the whole site means editing
the tokens, not the pages. Animations respect `prefers-reduced-motion`.

### Light and dark

The site ships with both themes and follows the operating system until the
viewer picks one with the `ThemeToggle` in the nav.

- Light values are the `@theme` block in `src/index.css`. Dark values are the
  same custom properties re-declared twice underneath: once under
  `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) }` (the
  OS default) and once under `:root[data-theme='dark']` (an explicit choice).
- The choice is stored in `localStorage` under `verdikt-theme` and re-applied by
  a tiny inline script in `index.html` before first paint, so there is no flash
  of the wrong theme.
- **Adding a colour to a component: use a token, never a hex value or a
  `dark:` variant.** The tokens already flip; hard-coded colours don't. Where a
  surface must keep its colour in both themes (a yellow button, the dark slab
  card), use `on-bright` / `slab` / `slab-fg` instead of `ink` / `paper`.
- SVGs follow the same rule: `fill="var(--color-ink)"`, not `fill="#16150f"`.
  The only deliberate exception is the isometric tier illustration, whose blocks
  are literal tier colours in both themes.
