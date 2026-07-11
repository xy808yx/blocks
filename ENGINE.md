# The BLOCKS training engine - how we got here

This document records **how the training engine's logic was arrived at**: the research campaign behind it, the decisions and why they were made, the evidence base, the figures we caught and threw out, and how the four build stages map to the code. It is the "why" companion to the code in [`index.html`](index.html).

- **Design source of truth (the "what"):** the design-foundation artifact - <https://claude.ai/code/artifact/f01568bf-a6bc-48e6-80db-e0a4a628f029>. That page is the audited spec for the *autopilot* (sections: 06 progression controller, 09 guardrails, 10 constants, 11 decisions, 13 evidence). **Its §06 progression controller no longer ships** - see [The progression controller was retired](#the-progression-controller-was-retired-jul-9-2026). Everything else it says still holds.
- **Raw research on disk:** `~/.claude/plans/blocks-autopilot-engine-research-raw.json` (218 KB, the design pass with all facets + critiques + citations), `~/.claude/plans/blocks-autopilot-engine-design.md` (85 KB, the pre-pivot draft, superseded), the taper synthesis at `~/.claude/plans/blocks-taper-synthesis/` (`FINAL.md`, `VERIFIED.json`, `SYNTH.json`, `FABAUDIT.json`, `COMPLETENESS.json`), and the retirement spec at `~/.claude/plans/blocks-guards-only-engine.md`.
- **Status:** what ships is **three guards**, dormant behind a master off-switch (Settings → "Training guards", default Off). They drive nothing until turned on, and even then they only ever subtract volume. See [The dormant hold](#the-dormant-hold) at the bottom.

---

## 0. The progression controller was retired (Jul 9 2026)

**Read this before anything below.** Sections 3.3, 4, and 7 describe a lift progression controller that **is no longer in the code.** They are kept because the reasoning is still worth having, and because the research that produced them also produced the parts that survived. But the shipped engine is now much smaller.

J reviewed the dormant engine against his re-ranked priorities (§1) and cut it to **guards only**:

- **Lifts and mobility are fully manual.** He builds and adjusts each quarter's blocks himself, by feel. The app shows the template *exactly as written* and logs it. It never sets or suggests a weight. It never increases anything. There is no rung ladder, no advance budget, no green counter, no muscle band, no stall counter, no cold-start on-ramp, no season re-anchor.
- **Three guards survive**, and they auto-populate rather than nudge (J: *"auto populate is fine, I don't deload nearly enough"* - a nudge he would ignore is worse than a default he will follow):
  1. **Auto-deload** - a chronic-flat streak or the trained-week backstop books the next full week easy. Lift sets display halved, sprints run easy, cardio minutes ease.
  2. **Flat-day ease** - a Flat morning pre-tap takes one set off that day's lift, at the bottom of the rep range.
  3. **Race taper** - Speed season plus a race date eases sprint and cardio volume into the race, quality held. Lifts are untouched.
- Every guard can only **subtract, temporarily, on volume, and it says so on the card.** Never a weight, never upward, never a write to the saved template. A guard's output is clamped to the template value, so an eased day can never prescribe *more* than the day you wrote.
- **A Stop post-tap arms the next sprint to run easy.** The old three-way Stop follow-up sheet ("a joint / the muscle / systemic") is gone: two of its three answers only fed the progression ladder, so they would have become promises the code no longer keeps.
- **Swim auto-progression died too**, for consistency. `cardioRx` now eases *the template's own minutes* instead of substituting a stored plan that started at a hardcoded 30. (That substitution was a real bug: with the engine on, a 45-minute cardio day prescribed 30, and a 20-minute day prescribed 30 - the engine silently overriding the athlete in both directions.)
- The **recovery dial** now tunes exactly one thing: how many trained weeks pass before an easy week lands.

**Why this is via negativa, not a compromise.** Deleting the progression controller also, for free, moots the calf-load risk (no progression means no tendon auto-load, so there is nothing to gate), moots the delts-first / mobility-invisible misalignment (no advance budget left to point at the wrong muscle), and removes the most bug-prone subsystem in the app.

**Injury insurance does not live in the engine.** It lives in J's exercise menu - movement variety - which is his job in every version. Never merge those two jobs: keep the engine dumb, keep the selection diverse.

Shipped at `contentRev 15` / `sw blocks-v38`. The migration drops `program.liftPlan` and `program.cardioPlan` and the armed `engine.sprintFb`; `schemaVersion` stays 1 and no logged history is touched.

### 0.1 The correctability pass (Jul 10 2026, sw blocks-v39)

A 42-agent adversarial review of the guards-only commit surfaced one theme and a set of seams: the old engine read taps lazily at next-day fold time, so correcting a mis-tap always worked; the guards act **instantly at tap time**, and nothing handled retraction. A second 31-agent adversarial pass over the fix itself then caught and fixed its own seams (a zombie card after a post-tap, an unbook that could cancel a deload earned by prior days, a single-slot disarm that lost an older Stop, a post-race edit spending the owed easy day). Final behavior:

- **Corrections now undo what they armed — and only what they armed.** A Stop post-tap arms `sprintFb` with the *day* that armed it; correcting or deselecting that tap re-derives the arm from whatever Stop taps still stand in the last two weeks (so an earlier un-consumed Stop is never lost, and a legacy day-less flag upgrades itself). Only sprints *after* the arming day run easy — a backfilled past day is untouched — and a sprint saved on a taper-owned day never spends the flag, even edited after the race (`taperEndedAt` window). A deload is unbooked only when the corrected tap is the very tap that fired it (`viaTap`): a deload earned by prior days' flats, fired on open before any tap, survives an unrelated flat-then-correct detour; the flat-streak snapshot (`fc0`) is restored on unbook, so a still-real streak simply re-fires.
- **The card cache rebuilds when guard inputs change.** The per-day cardio/sprint card (`CV`) is invalidated by a pre-tap, post-tap, taper set/start/clear, fresh block, and the guards switch — before, an already-rendered card silently ignored the tap that should have eased it.
- **The easy-sprint seed is clamped to the template on every axis** (reps, distance, effort), matching the taper branch — an "easy day" can no longer prescribe more than the day J wrote — and the easy card renders the real prescription instead of hardcoded text, with the Stop-armed cause labeled.
- **The ring counts the eased prescription.** `liftCounts` rides `prescSets` like every other surface, so a completed deload/flat day reaches 100%.
- **The scheme parser reads only the rep half.** `repBand` strips warmup/set-count/set-range prefixes (accepting a typed `x` for `×`) before parsing, so a rest/tempo/hold range ("· rest 45-60s") can never masquerade as the rep band, and a plain authored rep ("3 × 12") is its own floor — the eased line and the prefilled reps now always agree.
- **The guards switch preserves the race date.** OFF→ON still resets the easy-week clock but no longer silently wipes `horizonDate` (only the disclosed "Start fresh" does that). `trendCapped` no longer counts deload-week flats (matching `chronicFlat`). The recovery-dial label updates live while stepping.

---

## 1. The goal it was built to serve

**Re-ranked Jul 7 2026 - this supersedes the original "Speed #1" framing below.** Walking the priorities back with J revealed that the original ranking was an *assumption the design started from*, not one he handed it: he talks about speed most and loves it, so "the session I anchor my week on" got encoded as "the outcome I most want to improve." Those are two different axes. His actual priorities, in his words:

1. **Mobility + posture** (one goal, at the top) - trained as a real, progressed thread, not warmup filler.
2. **Speed** - kept as the immovable weekly **anchor for enjoyment and adherence** (he will always show up for a sprint day), NOT because it is the top outcome. It still gets the freshest slot and is protected last on a bad day.
3. **Muscle retention** (the resistance work) - serves body composition and durability; progresses by reps / tempo / range / density, never load.
4. **Durability, to feel great for decades** - the always-on background (guardrails, tendon work, longevity).

**Dropped as workout goals (Jul 7 2026):** *capped 3D delts* (never a real target - it meant "do not overbuild"; rear-delt and upper-back work survives anyway *as posture muscles*) and *lean* (leanness is ~80% diet, the only training lever is holding muscle, which #3 already does - so the engine will not pretend to progress it).

Still true and unchanged: **not** strength, **not** PRs. Legs are already over-built and sprints carry most of their load, so resistance is posture / durability / muscle-retention work, and progression comes from reps, tempo, range, and density - never ever-heavier load, with one exception (tendon work).

**Engine consequence, as first written:** the advance-budget priority "delts + back first" flips to posture / back first, delts dropped, and the mobility layer's loaded end-range holds get promoted to a first-class progressed thread with their own dial. **Superseded by §0 (Jul 9 2026):** re-ranking the goals is what exposed the deeper problem. Muscle retention does not need a progression ratchet, and the ratchet was the most bug-prone code in the app. So rather than re-point the advance budget at the right muscle, the advance budget was deleted. Lifts and mobility are now progressed by J, by feel.

> *Original framing, kept for history:* one priority - Speed (masters 100 m, working toward 200/400) - then a ranked set of qualities (lean, capped 3D delts, great posture, elite mobility, durability). The whole engine below was calibrated against this; the Jul 7 re-rank above corrects it and is the current intent.

The endgame is a **fully automated, goal-driven, by-feel training autopilot**: show up, read one line, execute. Everything below is the research that turned that ambition into a defensible state machine.

---

## 2. The research campaign at a glance

Every row is a multi-agent, web-researched, adversarially fact-checked workflow. Token figures are subagent output tokens.

| Pass | Scale | What it produced |
|---|---|---|
| **Autopilot design** | 14 agents, ~442k tok | The whole-week autoregulated model: one engine that *wraps* (never replaces) the sprint plan; sprint is the immovable spine, everything else fills the gaps around it, ordered by nervous-system cost and shed first when readiness drops. Hybrid periodization (block scaffold + daily undulation + RIR/RPE autoreg). |
| **Direction pivot** | J decision set | **Strip all injury logic.** With full clearance + weekly physio/AT + regular massage expected by build time, the calf/shoulder gates, recurrence lifecycle, return ladders, and dual pain model are retired; only training-hygiene guardrails remain. Erased ~half the later audit's blockers. |
| **Progression controller** | 10 agents, ~411k tok | The #1 build blocker, written: `advanceLiftPlan` / `advanceCardioPlan` / `advanceSprintPlan`. Designed 3 ways → synthesized → 5 adversarial stress lenses (deadlock, tap-coverage, guardrail-conflict, sprint-wrapper-integrity, edge-precedence) → completeness critic. ~15 deadlocks/conflicts resolved inline. |
| **Mobility / agility** | 52 agents, ~2.27M tok | The fragmented daily prehab list collapses to **three anchors**: loaded end-range holds (the evidence anchor), a daily CARs primer (mechanism only), and one ground-based movement flow (agility + adherence). A via-negativa **cut list** (nerve flosses, chin tucks, scattered static stretches - all dropped). |
| **Sprint taper** | 20 agents, ~916k tok | A date-anchored volume curve that wraps the sprint engine: hold quality, cut volume to a 0.50 floor by race eve. All constants shipped as tunable, evidence-informed defaults. |
| **Deload cadence** | folded into taper pass | One uniform backstop `DELOAD_EVERY = max(3, round(5.5·dial))`. No age tightening, no Speed-season split - both priors refuted by primary sources. |
| **PWA reminders** | folded into taper pass | On-open read-time surfacing as the daily loop + one client-side `.ics` Calendar handoff for the race date. No backend, no push (a serverless iOS PWA cannot wake itself). |
| **Tonnage metric** | 5 agents | Verdict: **total weight lifted is a weak, misleading headline metric** (conflates heavy-low-rep vs light-high-rep, gameable, can fall as you get stronger). Led to the post-tap load map + hard-sets-per-muscle instead. |
| **Whole-system coherence audit** | 25 agents, ~2.58M tok | Ran the integrated engine as one year-long state machine against the shipped app code. 58 raw → 29 verified survivors + 6 critic finds, 1 killed. Four seam decisions; one-rule fixes folded throughout. Moved the build up from ~Oct to now. |
| **E2 build review** | 50 agents | Adversarial review of the lift-controller build (10 lenses × find, 2 skeptics × verify). Fixed 9 real bugs before ship. |

---

## 3. The journey, in order

### 3.1 The autopilot design pass (the model)
The first pass established the shape everything else hangs on: a **whole-week autoregulated engine that wraps the existing sprint plan and never replaces it**. Sprint stays priority #1 - the immovable anchor and the *last* quality dropped on a bad day; everything else sits in the gaps around the sprints, ordered by nervous-system cost, shed first when readiness drops. The engine deliberately **under-prescribes** (two hard days most of the year, three in Build) and lets good weeks *earn* extra work rather than prescribing dense and clawing back. It runs on a genuine **two-tap contract**: one readiness tap before, one combined felt/pain tap after. (The workflow was interrupted before writing its result and recovered by resuming from a cached run - the 8 research facets were cached, only the synthesis/critique tail re-ran.)

### 3.2 The pivot: strip the injury logic
The original design (the 85 KB on-disk draft) was built around **active rehab** - calf and shoulder gates, a recurrence lifecycle, return ladders, a dual 0/10-vs-5/10 pain model. J's call (**Q4: "strip it all, no comeback toggle"**): by build time he expects to be fully rehabbed with weekly physio, athletic therapy, and regular massage, so the engine should **design for a healthy athlete** and keep only generic training hygiene. Retired: the calf capability gate, recurrence re-lock, returning-RIR cap, shoulder clearance flag + re-entry ladder + 85% gate, plyo-gated-on-calf. Kept: hard-day cap (3), load ramp cap, flex-down + safe floor, leg-conflict spacing, resistance-before-endurance, sharp-pain stop. This single decision erased about half the later audit's blockers. **The on-disk design doc predates this pivot; the artifact supersedes it.**

### 3.3 The progression controller (the core dial) - RETIRED, see §0
*Built, reviewed, shipped dormant, and deleted on Jul 9 2026 without ever having driven a training day. The design below is preserved as history. The one piece of it still in the code is the tendon exception's underlying claim (heavy-slow calf work needs real load), which now lives in J's own programming rather than in an auto-load path.*

The hardest piece: how one post-session tap becomes an up / hold / down per exercise. Designed from three priors (minimal-state, masters-safety, athlete-UX), synthesized, then stress-tested by five adversarial lenses. The result:

- **Two-up / two-down hysteresis** - an advance needs green ≥ 2 (Springy +2, Normal +1, Flat/Stop → 0); a down needs red ≥ 2; the first flat always holds. Anti-thrash. Red resets on any good day and after a fired shed, so a lone bad day months ago can never pair with today's.
- **Advance budget of 2 exercises/session**, priority delts + back first, then lowest rung, then session order; overflow carries a ready flag.
- **Skip-a-blocked-rung** - a capped muscle spends green on rest/tempo instead of freezing.
- **The load-free ladder:** reps → add a set (clamped at muscle MAV) → tighten rest (−20 s ×2) → tempo → lengthened partials. The set-add step **repeats** to the season band top before density rungs unlock (without this rule the arithmetic makes the top of every volume band unreachable in a 13-week season).
- **Tendon is the exception** - heavy-slow calf work progresses *load* (+2.5–5% gated on two clean top-range sessions), held (not dropped) on a bad day.
- **The sprint wrapper is write-only** into the engine's existing inputs (`quality`, `pain`, the easy-day `fallback` flag). The engine keeps owning every advance decision; the wrapper never fakes a hold/undo with a counter of its own. Only sanctioned direct write: the quarterly season re-anchor.

### 3.4 The mobility / agility layer
J flagged the design under-served his mobility + agility goals and asked "should I be rolling, like wrestler warmups?" The research answer: **yes, and it's the via-negativa move, not an addition.** The whole layer became **three anchors** - loaded end-range holds (the only pillar with strong evidence, ankle first, load-dependent so it must be *hard*), a daily CARs pass (kept on mechanism + zero cost, not a range builder - the branded-system claims are marketing), and one ground-based movement flow (kept for agility + adherence + range coverage, *not* a proven effect size; agility does not transfer to linear sprint). Hard placement rule: pre-sprint stays crisp and dynamic only - never a full flow, never long static holds, never loaded eccentrics for the sprint legs. **Cut list:** nerve flosses (null in healthy), chin tucks (low-yield), scattered static stretches (redundant, not dangerous). *(Process note: the tail two agents died on a monthly spend limit, so the final reconcile was done by hand from the completeness critic's fixes - the draft synthesis was already self-fact-checked.)*

### 3.5 The taper
When Summer is the Speed season and a race matters, set the date; from ~10 days out the engine stops building fitness and lets it surface. The rule every athlete agrees on: **hold the quality, cut the quantity.** A single optional `horizonDate` drives a `TAPER` state that freezes the two-dial and the deload counter (taper wins any overlap, no double-cut), holds the effort ceiling, and exponentially decays volume to a 0.50 floor. Everything else is derived at read-time, so an offline PWA just recomputes on open; losing the blob just means no taper (a safe default). J's calls: **both** a race-date field and a manual start/stop toggle (which just writes/clears the same date), **single A-race** per Summer, and the **sharp-and-short 10-day / 0.50** shape over the gentler endurance optimum. *(This pass held the raised spend cap - all agents completed, no null tail.)*

### 3.6 Deload cadence
One rhythm all year, `DELOAD_EVERY = max(3, round(5.5·dial))` (3 wk at dial 0.6, 6 at 1.0, 8 at 1.4), with Fall the built-in reset. **No** age tightening to 2:1 (matched-fitness masters recover comparably to young). **No** Speed-season split (the every-third-week prior rested on a high-neural-cost claim the primary sources refute - the lingering post-sprint deficit is *peripheral*, not central; and it's structurally redundant since Speed is already light, the taper owns the run-in, and Fall resets). By-feel triggers lead; the calendar only backstops, because a *forced* deload has a measured cost.

### 3.7 The load metric (why not tonnage)
A dedicated pass asked whether total weight lifted is worth tracking. Verdict: it's a **weak, misleading headline** - it conflates heavy-low-rep with light-high-rep, is gameable with junk volume, can *fall* as you get stronger, and is modality-blind. So instead: a one-tap session effort derived from the post-tap (`LOAD_MAP` 7/6/5/4 × session minutes; swims use real minutes; a sprint day counts a nominal 40), feeding a weekly training-load trend, plus **hard sets per muscle** vs an evidence band as the real volume metric. The ramp cap and hard-day count ride this same metric rather than inventing a tonnage calc.

### 3.8 The whole-system coherence audit
Before building, the entire integrated design was run as **one year-long state machine against the shipped app code** by 25 agents across 7 blind lenses (precedence matrix, liveness, acceptance-test, cold-start, code-fidelity, under-spec, year-walk), merged, then attacked by adversarial skeptics + a completeness critic. Verdict: the *philosophy layer held*; every real defect sat where design prose met the shipped engine. Four seam calls were made (the wrapper contract, one engine-fed sprint anchor per week, post-tap replaces the old 0–10 sRPE tap, manual move-reset fully specced), and dozens of one-rule fixes were folded throughout. This audit is what moved the build forward from ~October to now.

---

## 4. The decision ledger

From the artifact's decisions log (section 11), the questions that were actually resolved and why:

| # | Question | Decision |
|---|---|---|
| **Pivot** | How much injury machinery to carry? | **Strip it all**, no comeback toggle. Keep only durability guardrails. |
| **Goals** | What is resistance *for*? | **Re-ranked Jul 7 2026 (see §1):** posture + mobility first, then muscle-retention, then durability. NOT strength. Capped delts and lean **dropped** as workout goals (delts = never a real target; lean = ~80% diet). Speed stays the enjoyment *anchor*, not the top outcome. Four seasons: Build / Speed / Reset / Lean. |
| **Q1** | Return-flag RIR decay threshold? | Answered 4, then **moot** - retired with the injury strip. |
| **Q2** | Throws/slams re-entry? | Manual unlock; a one-time August reminder (snoozeable to September) names every parked move, no auto-arm. |
| **Q3** | Fixed VO2 cadence? | No. Swimming is the primary aerobic/VO2 (home pool); an occasional track session is opportunistic. |
| **Q4** | Promote sRPE-ACWR to binding? | **Advisory only.** The objective ramp cap + hard-day count bind. *(Moot since §0: the ramp cap only ever gated a rung advance, so it died with the ladder. Nothing binds now, because nothing climbs. The weekly-load trend and its spike flag stay, as a metric you read.)* |
| **Q5** | Weekly density? | 2 sprints, 2 resistance, 3–5 easy swims, Sunday off. Two hard days most of the year, three in Build. |
| **Q6** | How to tune the constants? | **One hidden global recovery / training-age dial** [0.6, 1.4] that scales the whole block. No per-constant editor. |
| **Q7** | Shoulder-clearance re-prompt? | **Moot** - retired with the strip. |
| **Taper** | Peak a 100 m with no backend, no extra tap? | One optional race date → a 10-day, 0.50-floor TAPER state. Both a date field and a toggle; single race at a time; early exit = two Stop days. |
| **Deload** | 3:1 vs 2:1 vs Speed-tighter? | One uniform `max(3, round(5.5·dial))` backstop, no age or season split. |
| **Audit** | Does it run a year as one machine? | Yes; philosophy coherent, defects at the prose↔code seam. Four seam calls, one-rule fixes folded. |
| **Reminders** | How does an offline PWA nudge? | On-open read-time surfacing + a one-tap `.ics` Calendar handoff for the race. No push. |

---

## 5. The evidence base

The load-bearing citations (full list + links in artifact section 13). Every claim was fact-checked by a separate adversarial pass; where a number was not solid, the design under-claims.

- **Volume & failure:** weekly volume drives hypertrophy with diminishing returns; frequency has no clear benefit when volume is equated, so 2×/week is enough (Pelland et al. 2025). Sets close to failure grow muscle as well as failure itself, enabling load-free progression (Refalo/Grgic). Low-load/bodyweight near failure ≈ heavy loads (Schoenfeld), validating the minimalist kit.
- **Delts & range:** lateral raises near failure grow the side delt ~3–5%; cable/DB/band equivalent (Frontiers 2025). Loaded/eccentric full-range work gives large ROM gains, biggest at the ankle, and is **load-dependent** - bodyweight-only ≈ null (Kay 2023, g=0.86, dorsiflexion g=1.12; Alizadeh 2023; Favro 2025).
- **Power & tendon:** plyometrics improve sprint (SMD ~−0.50 to −0.61) and tendon stiffness (0.55), targeting the masters force deficit (Ramírez-delaCruz et al.). Tendon adaptation is driven by **load magnitude** (~70%+ MVC), so heavy-slow calf work must actually get heavy (Bohm/Mersmann/Arampatzis).
- **Autoregulation & deload:** autoregulated load ≥ fixed for strength (Zhang 2021 SMD 0.64). Physique athletes deload ~every 5.6 wk for ~6 days (Sports Med Open 2024). A forced mid-cycle deload gave *no* benefit and slightly less lower-body strength than training through (Coleman 2024) - over-firing has a real cost.
- **Taper:** ~2-week taper optimal; cutting volume is the biggest lever (41–60%, ES 0.72) while **holding intensity** (0.33) and frequency (0.35) (Bosquet 2007; Wang 2023). Progressive nonlinear beats step; expect ~3% "unmask, not build" (Mujika & Padilla 2003). Power proxy favors the smaller 30–50% cut, hence the floor sits at the power end (Travis 2020). Masters (mean 43.6 y) recover comparably to young out to 48 h (Frontiers 2022) - so no age recovery clock.
- **Platform (July 2026):** a serverless iOS PWA cannot wake itself - Web Push needs a server, Notification Triggers was abandoned, Periodic Background Sync isn't on iOS; a client-side `.ics` VALARM is the one no-server way to fire a dated alert to a closed app.

---

## 6. The honesty ledger - figures we caught and threw out

A running theme across every pass: adversarial fact-checkers removed fabricated or over-claimed numbers. Recorded so they never creep back:

- **24% / 28% tendon-stiffness** figures from earlier passes - not real.
- **90/90 hip change quoted as 7.9°** - a standard deviation mislabeled as a real threshold (true change ~11–16.5°).
- **0.26-second reactive-agility gain** - a misread of a youth study (real ~0.11 s, n=15).
- **Inflated muscle-lengthening / fascicle numbers** - from a bad measurement method (panoramic ultrasound ~0.47–0.72 cm, not ~1.97 cm).
- **A masters "72-hour / age-keyed recovery clock"** - blog-sourced; refuted by matched-fitness data.
- **"CNS fatigue outlasts muscle after max-velocity work"** - misread; the 24–72 h deficit is *peripheral* (Thomas 2018).
- **A 400 m force-deficit taper figure** - did not match its cited paper.
- **Any sprint-specific taper percentage** the endurance base cannot support - demoted to a labeled extrapolation.
- **The every-third-week Speed-deload prior** and its high-neural-cost rationale - kept out.
- **The type-II-fiber-loss story** for masters speed decline - updated by a 2025 longitudinal finding pointing to reduced *force* capacity instead (lifting is force insurance, not fiber insurance).
- The **Copenhagen adductor prevention meta was retracted**; the **NHE injury-reduction magnitude is genuinely contested** (Impellizzeri 2021). Nordics are durability insurance, not a speed exercise.

---

## 7. The architecture - what actually ships

Everything is behind the master `engineOn()` switch, and everything is a lazy per-program sibling in the one `blocks_v1` blob - no `schemaVersion` bump, mirroring the sprint-plan pattern. With the switch off, the app behaves exactly as it did before the engine existed and creates no engine state at all.

- **The taps, load, and season.** The day-level readiness pre-tap (Springy / Normal / Flat) and the post-session tap (Springy / Normal / Flat·sore / Stop), stored on the day record; the load metric as `LOAD_MAP × minutes`; `program.season` + the four `SEASONS`. The season is now a label plus the taper's eligibility gate: it eases nothing, so it never re-anchors the deload clock.
- **The three guards.** `prescSets(entry, dk)` and `schemeEng(entry, dk)` read the template and return a set count in `[1, entry.sets]` with a `· deload` or `· easy day` tag. `cardioRx(dk, base)` eases the template's own minutes, clamped so it can never exceed them. `trendCapped` (two flat mornings inside four days) and a Stop-armed `sprintFb` run the sprint easy. Deloads fire on a chronic-flat streak or the trained-week backstop.
- **Peaking + resets.** The taper (§3.5), and the fresh-block reset (`resetDate` marker; offered on open after a 14-day gap, never automatic - the Vancouver→Hua Hin move re-arms it). A fresh block now only resets the easy-week clock and clears a pending deload, taper, and race date; there is no longer a lift floor to ease back to.

**Deleted (Jul 9 2026, see §0):** the whole lift progression controller and its muscle-band layer, the tendon auto-load path, the season re-anchor, the stall counter, the ramp cap, the cold-start on-ramp, the swim auto-progression, and the Stop follow-up sheet.

The **recovery dial** [0.6, 1.4] was the one hidden global scalar behind four things. Three of them are gone. It now moves exactly one: deload cadence `max(3, round(5.5·dial))` - how many trained weeks pass before an easy week lands.

---

## The dormant hold

The guards are built but held **dormant** behind a master off-switch (`engineOn()`, default Off). With the switch off, the app behaves exactly as it did before the engine existed - plain template sets/reps/rest, no auto-progression, no engine UI, no engine state created. It drives nothing.

**Why it was held:** the original engine's design assumed a **healthy athlete** - the injury logic was deliberately stripped (§3.2) on the expectation that J would be fully cleared and well-supported by the time it ran. Until then, an injury-logic-free engine must not auto-progress rehab-sensitive lifts or sprint load.

**Why the hold now costs almost nothing.** That risk lived almost entirely in the progression controller, and the progression controller is gone (§0). Nothing auto-progresses. What remains can only take volume away, temporarily, on a day J already told it he feels flat. The question that used to gate the switch - *does the stripped engine need partial guardrails re-added for anything not fully cleared?* - is mostly answered by subtraction: there is no longer an auto-load path to guard.

**Re-enable trigger:** J's own say-so - strict mode, decoupled from any PT appointment. He flips the Settings switch himself, whenever he decides.

---

*Provenance compiled from the design-foundation artifact, the on-disk research raw files, and the project's engineering memory. Revisit alongside the artifact, which stays the source of truth for the design itself.*
