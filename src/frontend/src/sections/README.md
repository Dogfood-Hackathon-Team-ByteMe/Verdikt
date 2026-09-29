# `src/sections` — landing page sections

One file per section of the landing page. `pages/Landing.tsx` stacks them in
this order:

1. `Nav` — fixed top bar (exports `navLinks`, reused by the footer)
2. `Hero` — headline, CTAs and the interactive 3D `Cube`, with `Stats` underneath
3. `About` — bento grid introducing Verdikt
4. `HowItWorks` — the five lifecycle steps
5. `Scoring` — the cross-judge normalization demo
6. `Roles` — per-role visibility explorer
7. `Faq` — question accordion
8. `Footer`

`Cube.tsx` is the hero illustration; `Stats.tsx` is the figures row beneath it.
`Gallery.tsx` is not on the landing page — it backs the `/projects` route.
`AppShell.tsx` and `AccountMenu.tsx` are chrome for the signed-in app.

Sections compose `../ui` components and pull static copy from `../content`.
