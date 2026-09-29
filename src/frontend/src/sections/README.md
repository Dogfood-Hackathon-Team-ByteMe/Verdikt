# `src/sections` — landing page sections

One file per section of the landing page. `App.tsx` stacks them in this order,
which follows the real DOGFOOD site (dogfoodhack.com):

1. `Nav` — fixed top bar (exports `navLinks`, reused by the footer)
2. `Hero` — blue hero with the countdown and the rotating card `Ring`
3. `LogoStrip` — marquee of the judges' companies
4. `About` — bento grid introducing Verdikt
5. `Tiers` — the T1–T4 ladder
6. `HowItWorks` — the five lifecycle steps
7. `Scoring` — weighted rubric + the normalization demo
8. `Roles` — per-role visibility explorer
9. `Gallery` — searchable public project list (reads the API)
10. `Timeline` — event schedule
11. `Prizes` — prize breakdown
12. `Faq` — question accordion
13. `Cta` — self-host call to action
14. `Footer`

`HeroCards.tsx` holds the little cards that float inside the hero's `Ring`.
Sections compose `../ui` components and pull event copy from `../content`.
