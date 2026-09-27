# How Verdikt judges

This is how a Verdikt event turns judges' ballots into a ranking, written down
so that anyone — an organizer, a team that lost, a judge — can check the result
rather than take it on trust. Every rule here is enforced by the API, not by
the page, and every one has a test behind it (`backend/tests/stageF`–`stageH`).

## 1. Who judges what

**Judges are appointed per track.** An organizer adds a judge to a track by the
email on their account, or sends an invite link to someone without one.
Appointment is refused if the person is competing in the event or organises it,
and that check runs again at the moment an invite or application is accepted —
so someone who joins a team after being invited is still refused.

Judge invites are stricter than team invites: each is bound to one email
address, works once, expires after 14 days, and can be withdrawn. A forwarded
link is useless to anyone else.

**A judge scores only what they were given.** Scope narrows in this order:

| Situation | A judge may score |
|---|---|
| The organizer has dealt assignments | exactly their assigned entries |
| No assignments yet | entries in the tracks they judge (an entry with no track belongs to no track, so any judge of the event may score it) |
| Listed on the event with no track | every entry |

Admin status grants nothing here. Admins are staff, not panel members, and a
ballot from someone nobody appointed would become part of the result.

Taking a judge off a track removes them from the event too if it was their last
track there, and drops their unscored assignments. (Earlier, a removed judge
stayed on the event with no track — which the rules above read as an
event-wide judge, so removal *widened* their access. Fixed and tested.)

**A judge sees only their own ballots**, never a peer's, and cannot read the
standings either: the aggregate plus your own ballots is enough to solve for
everyone else's.

## 2. Batch assignment

"3 independent reviews per entry" is something the server deals and enforces,
not a hope. The organizer picks a number of reviews per entry and the assigner:

1. **Respects tracks.** An entry only goes to judges of its track.
2. **Adopts existing ballots.** A judge who already scored an entry they may
   still judge has it added to their batch, so switching assignments on never
   locks anyone out of a ballot they can stand behind. A ballot on a track the
   judge has since been taken off still counts, but is not handed back — the
   assigner cannot be used to undo a removal.
3. **Balances load.** Entries with the fewest eligible judges are dealt first;
   each goes to the eligible judges carrying the least so far. Ties break on
   judge id, so the same inputs deal the same way.
4. **Reports shortfall instead of cheating.** If a track has two judges and you
   ask for three reviews, its entries get two, and the gap is reported with the
   reason. It never borrows a judge from another track to make the number up.

Re-running tops up. Clearing assignments returns judges to scoring by track;
ballots are never touched by either.

## 3. From a ballot to a score

The organizer sets the rubric: criteria, each with a **weight** and a **scale**
(“out of”). Weights are relative, not percentages — 3/1/1 ranks exactly like
60/20/20.

A ballot must score every criterion, within that criterion's own range, and
nothing the rubric does not define. Its **weighted score** is

```
weighted = Σ (score_i / max_i × weight_i) / Σ weight_i
```

which lands in 0..1 whatever scales are mixed — a 1–10 criterion does not
quietly count for more than a 1–5 one of the same weight.

An entry's **raw score** is the mean of its ballots' weighted scores.

## 4. Cross-judge normalization

Judges differ. Some score everything high, some low, some use the whole scale
and some put everything between 6 and 7. With three reviews per entry, which
judges an entry happened to draw can matter more than the entry. So before
ballots are combined, each one is re-expressed relative to its judge's habits.

### The method

For each judge: their mean and spread (population standard deviation) across
every ballot they cast in the event. Then each ballot becomes

```
normalized = groupMean + (weighted − judgeMean) / judgeSd × groupSd
```

That removes the judge's offset (harsh vs generous) and their spread (decisive
vs flat), and puts the result back on the same 0..1 scale as a raw score, so it
still reads as a percentage. An entry's **normalized score** is the mean of its
ballots' normalized scores. It is not clamped: a strong entry reviewed by a
harsh judge can land slightly past 100%.

### Why "group", not "panel"

A judge's bias can only be measured against judges who saw overlapping work.
Verdikt links judges who scored a common entry — directly, or through a chain
of other judges — into **groups**, and rescales each judge onto their own
group's mean and spread.

With entries dealt at random, the whole panel is one group and this is the
textbook z-score. But when judges are kept to their own tracks, each track can
be a separate group — and rescaling everyone onto the *whole* panel would pull a
genuinely stronger track down to the average. Measured below, that naive
version badly damages the ranking in exactly the configuration Verdikt
encourages. Bias *between* groups that never overlap cannot be measured from
the ballots at all, so it is left alone, and the dashboard says so when it
happens.

### When a ballot is left as cast

| Case | Treatment | Why |
|---|---|---|
| The judge cast fewer than 2 ballots | unchanged | one ballot cannot tell a harsh judge from a weak entry |
| The judge shares no entry with any other judge | unchanged | there is nobody to compare them with |
| Every ballot the judge cast is identical | set to the group mean | they expressed no preference between entries |

The Results tab shows each judge's average, whether they scored high or low
relative to the panel, and whether normalization could correct them — and every
entry shows its raw and normalized score side by side. The organizer chooses
which one ranks; the other is always visible.

## 5. Does normalization actually help?

Measured, not asserted. `npm run normalization-proof` (in `backend/`) simulates
events where every entry's true quality is known and every judge's bias is
known, runs them through the same code the leaderboard uses, and compares each
method's ranking with the truth. 200 seeded events per scenario, 40 entries,
8 judges, 3 reviews per entry:

| Scenario | Raw | Naive z-score | **Shipped** | Shipped beats raw | True top 5 found (raw / naive / shipped) |
|---|---|---|---|---|---|
| Biased judges, entries dealt at random | 0.935 | 0.975 | **0.975** | 97% of events | 3.41 / 3.98 / **3.98** |
| Fair judges, entries dealt at random | 0.986 | 0.977 | **0.977** | 8% of events | 4.30 / 4.03 / **4.03** |
| Biased judges kept to tracks of different strength | 0.903 | 0.796 | **0.906** | 59% of events | 3.13 / 1.86 / **3.23** |

Columns 2–4 are the Spearman correlation between each method's ranking and the
true one (1.0 is perfect).

What it shows, including the parts that are not flattering:

- **Where judges are biased, normalization clearly helps.** It beats raw in 97%
  of simulated events and finds, on average, more than half an extra entry of
  the true top five.
- **Where judges are not biased, it costs a little.** Estimating each judge's
  habits from a handful of ballots adds noise that a fair panel did not need.
  That is the price of the correction; raw is one click away for an organizer
  who trusts their panel.
- **The naive method fails badly with track-isolated judges** — the top-five
  hit rate drops from 3.13 to 1.86. Grouping fixes that: the shipped method
  holds level with raw, and gains a little from correcting bias within each
  track. It cannot correct bias between tracks that share no judges, because
  nothing in the ballots measures it; overlapping judges across tracks is the
  way to get that back.

The test suite re-runs a smaller version of this simulation and fails if any of
those three properties stops holding, so the table above cannot quietly go out
of date.

## 6. Ties, gaps and exports

- **Ties share a rank** (1, 2, 2, 4). Scores within 10⁻⁹ of each other are the
  same score, so floating-point noise cannot invent a winner.
- **An entry nobody has scored is unranked**, listed last, with no score — not
  a zero. Unjudged is not the same as last.
- **Drafts are not ranked.** A ballot on an entry later withdrawn to draft is
  kept for the audit record but takes no part in the standings or in
  estimating any judge's habits.
- **Every stage exports as CSV:** entries (drafts included, with answers),
  assignments (who owes what), every ballot (with its raw and normalized score)
  and the standings. All are organizer-only, and every text cell is quoted and
  defused so an entry titled `=HYPERLINK(...)` is text, not a formula, when the
  organizer opens it.

Standings are computed from the ballots on every read and never stored, so the
leaderboard is never a stale snapshot. What Verdikt does not do is decide the
winner: it ranks, and the organizer awards.
