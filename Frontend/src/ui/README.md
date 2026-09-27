# `src/ui` — the component kit

Reusable, presentation-only building blocks. Every page in the app should be
assembled from these plus the design tokens in `../index.css`, so the whole
project stays visually consistent. Nothing here fetches data.

Import from the folder barrel:

```ts
import { Button, Card, Section } from '../ui'
```

| File | What it is |
|------|------------|
| `cn.ts` | Joins class names, dropping falsy ones. |
| `Icon.tsx` | Stroke icon set on a 24px grid. |
| `Logo.tsx` | The Verdikt wordmark and tick. |
| `Button.tsx` | Pill button/link: variants, sizes, arrow badge, magnetic hover. |
| `Badge.tsx` | Small mono status pill. |
| `Container.tsx` | Centres content and caps the page width. |
| `Section.tsx` | `Section`, `SectionHeading`, `SectionLabel` — section scaffolding. |
| `Card.tsx` | Rounded surface in six tones, with optional hover-lift and 3D tilt. |
| `Reveal.tsx` | Fade-up on scroll into view. |
| `CountUp.tsx` | Numbers that count up on scroll into view. |
| `IconBubble.tsx` | Round icon sized to sit inline inside a headline. |
| `AvatarStack.tsx` | Overlapping initials for a team. |
| `Marquee.tsx` | Seamless infinite horizontal scroller. |
| `Chip.tsx` | Toggle pill for filters. |
| `SearchField.tsx` | Search input with a leading icon. |
| `Segmented.tsx` | Tab switcher with a sliding lime indicator. |
| `Accordion.tsx` | One-open-at-a-time expander (used by the FAQ). |
| `Dialog.tsx` | Modal built on the native `<dialog>` element. |
| `Sky.tsx` | `SkyPanel` + `Clouds` — the blue hero surface. |
| `Ring.tsx` | Rotating 3D drum of cards (hero). |
| `ThemeToggle.tsx` | Light/dark switch. Writes `data-theme` on `<html>` and remembers the choice. |
| `index.ts` | Barrel that re-exports everything above. |

See every component live at `#ui-kit` (`src/pages/UiKit.tsx`).

## Colours

Only ever use tokens (`bg-paper`, `text-ink`, `ring-line`, …) — they flip
automatically in dark mode, and a hard-coded hex or a `dark:` variant does not.
Three tokens exist for surfaces that must keep their colour in both themes:

- `on-bright` — text on yellow, red or green. Always dark.
- `slab` / `slab-fg` — the always-dark card (`<Card tone="ink">`).
- `band` / `band-fg` — the full-bleed coloured section band.

Inside SVG, write `fill="var(--color-ink)"` rather than a hex value.
