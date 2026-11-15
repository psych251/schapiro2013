# Phase 1 analysis review: Schapiro et al. (2013), Experiment 2 replication

Adversarial review of the Phase 1 analysis in `writeup/replication-report.qmd`, following
`SKILL.md` (adversarial protocol review). Reviewed 2026-11-14 by Claude Code (Claude Opus 5.5)
from a session that did not build the analysis. The data are `data/raw/schapiro2013-final/`,
and the paper is `original_paper/` (Results, Experiment 2; Fig. 2 legend; Online Methods).

```
VERDICT: READY (the analysis code is correct). Three statements in the report do not match
the data and need correcting by the author (M2, M3, M4).
```

The code implements the analysis the paper describes. An independent re-derivation reproduces
every reported Phase 1 number exactly. The null result holds under every alternative coding
tried. There are no blockers. The problems are in how the result is reported and interpreted.

## What the paper specifies, and what the code does

| Element | Paper (Exp. 2) | Report code | Match |
|---|---|---|---|
| Test | Parse probability at a community transition vs. "elsewhere in the sequence", paired across participants, t9 | `parse_test()`: two-tailed paired t on per-participant proportions | yes |
| Transition definition | "arrival into any community following at least four consecutive steps in another single community" | `community_change & prev_run >= 4` (labels from `src/graph.js` `annotate()`) | yes; recomputed from raw nodes, 0 disagreements |
| Denominator | "proportions of times participants parsed ... out of all opportunities to do so" (Fig. 2 legend) | `mean(parsed)` over each participant's transition images / other images | yes |
| "Other" | "elsewhere in the sequence" (not defined further) | non-transition images; transitions after a 1-3 step run are left out of both groups | defensible reading; the alternative gives the same result (table below) |
| Hamiltonian analysis | "Restricting the analysis to Hamiltonian paths" | `walk_type == "hamiltonian"` items | yes |
| Hamiltonian cycle | one fixed cycle per participant, entered next to where the walk ended, direction random per block | `drawHamiltonianCycle` / `hamiltonianBlock` | yes; all 20 blocks × 11 participants visit 15 distinct nodes, every step is a graph edge |
| Effect size | (not reported) | d_z = t/√N, CI by inverting the noncentral t | correct |
| Original d_z | t9 = 2.30 → d_z = 0.727 | same | yes |
| Power | — | N = 17 for 80% power at d_z = 0.727 | verified (`power.t.test`) |
| Compliance | A′ mean 0.818 (SD 0.130) | accuracy ≥ 50% (preregistered) | **not equivalent**, see M1 |

## Readouts and manufacture routes (SKILL.md step 2)

| Readout | False-positive route | False-null route | Ruled out by |
|---|---|---|---|
| Key t (all trials): t(10) = 0.17, d_z = 0.05 [−0.54, 0.64] | mislabelled transitions; double-counted trial rows; pilot sessions mixed in | (a) participants not attending to the images (cover task at chance); (b) a press landing on the image after the transition; (c) near-constant pressers diluting the contrast; (d) underpowered N; (e) instrument unable to detect an effect | labels recomputed: 0 mismatches; 0 duplicate rows; dataset provenance checked (M4). (b), (c), (e) ruled out by the checks below. (a) and (d) **not ruled out**: M1, M2 |
| Hamiltonian t: t(10) = −0.12 | same | same | same |
| Exclusion funnel (36 → 18 → 11) | — | the rule removes informative people, or keeps uninformative ones | the 7 excluded people are all below 50% accuracy; the rule keeps 5 people at chance (M1) |
| Exploratory similarity t(10) = −0.22 | — | pixel cosine barely separates the images (all 105 pairs .80–.98, mean .90) | weak instrument; and there is no parsing effect for it to explain (m3) |

## Checks: executed vs read-only

All of these were **executed** with R 4.6.1 on the exported data. The scripts are in the session
scratchpad, and the robustness table is now also in the report (`robustness` chunk).

1. **Independent re-derivation (base R, not using the report's functions).** I got the same 11
   included participants as `read_phase()` (identical set). Key test: t(10) = 0.174, p = .865,
   d_z = 0.053, 95% CI [−0.540, 0.643]. Hamiltonian: t(10) = −0.122, p = .906, d_z = −0.037.
   Both match the report.
2. **Label integrity.** I recomputed `community_change` and `prev_run` from the node sequence for
   all 18 completed sessions: 0 disagreements. Every step is a graph edge, and all Hamiltonian blocks are complete.
   There are no duplicated (participant_id, trial_index) rows. Each participant has 600 parsing trials and 1,400 exposure trials.
3. **Known-positive / known-negative through the report's own `parse_probs()` / `parse_test()`**,
   using the real sequences with synthetic presses:
   - parse 60% at transitions vs. 10% elsewhere: t(10) = 19.7, p < 10⁻⁸ (detected);
   - parse 10% everywhere, 200 simulations: false-positive rate 0.045 (nominal .05);
   - parse 32% vs. 17% (the original Fig. 2b means), 200 simulations at N = 11: detected in
     200/200. The pipeline can detect an effect of the original's size if every participant has
     it. This simulation has no between-participant variability, so it overstates real power.
4. **Robustness of the key test (all trials, N = 11 unless stated).**

   | Coding | t | p | d_z |
   |---|---|---|---|
   | Preregistered (≥ 4 steps) | 0.17 | .87 | 0.05 |
   | ≥ 1 / ≥ 2 / ≥ 3 steps (paper Supp. Table 2) | 0.32 / 0.35 / 0.35 | .75 / .74 / .74 | 0.10 / 0.10 / 0.10 |
   | ≥ 5 steps | 0.04 | .97 | 0.01 |
   | Short-run transitions counted as "other" | 0.15 | .88 | 0.05 |
   | Press on the image after the transition (lag 1) | −1.19 | .26 | −0.36 |
   | Analysed and A′ ≥ .6 (N = 6) | −0.02 | .98 | −0.01 |
   | Without the 2 participants pressing on > 90% of images (N = 9) | 0.54 | .60 | 0.18 |
   | All 18 completed sessions, no exclusions | −0.40 | .70 | −0.09 |
   | 5 key-swapped participants added back (N = 16) | −0.27 | .79 | −0.07 |

   Drop-top-k: the per-participant differences (transition − other) run from −0.072 to +0.095.
   Dropping the top 1 or 2 gives t = −0.50 / −1.84. Dropping the bottom 1 or 2 gives t = 0.69 / 0.99. No single
   participant carries or hides the result. The null survives every coding.
5. **Parse timing.** The median press is 494 ms into the 1.5 s image (5th–95th percentile 43–1388 ms),
   so presses are not systematically spilling onto the next image. Check (lag 1) above agrees.
6. **Data provenance.** `data/raw/schapiro2013-final/participants.csv` has `experiment_id =
   schapiro2013-pilot-b` on 35 of 36 sessions and `schapiro2013-final` on 1. All 36 started on
   2026-10-31. In git, `EXPERIMENT.id` changed from `pilot-b` to `final` at 16:08 PDT that day, during
   collection. The real pilot-B session (2026-10-26) is not in this folder. So this is a labelling
   issue, not pilot contamination. Repeat participants: 33 distinct Prolific IDs across 36
   sessions. No one has more than one completed session. One person completed and later opened a
   second, incomplete session (excluded as incomplete). Prolific IDs were counted, not printed.
7. **Browser errors.** There are 2 errors in `errors.csv` ("Cannot read properties of undefined (reading
   'toLowerCase')", both at trial_index 1, the instructions). Their uid matches no participant
   document, and they do not touch trial data.

## Blockers

None. Nothing in the analysis code manufactures the null or would manufacture a positive.

## Majors (weaken the conclusion or are wrong in the report)

**M1. The compliance rule cannot detect non-compliance, and 5 of the 11 analysed participants are at chance on the cover task.**
- Mechanism: 20% of exposure images are rotated, so pressing the "upright" key on every image
  scores 80% and passes the preregistered ≥ 50% rule. The paper's compliance measure is A′
  (Exp. 2 mean 0.818). In the analysed sample: mean A′ = 0.647 (SD 0.142), mean hit rate 0.288, mean
  false-alarm rate 0.139. Five of the 11 have A′ < .6 (0.47–0.55). Most analysed participants detected
  fewer than a third of rotations. Detection is worst for the 3- and 6-fold symmetric images
  (hit rate .24–.25 vs. .39 for 2-fold). By pixel cosine, an image's own 90° rotation is more
  similar to it (mean .94) than other images are to each other (mean .90).
- Direction: false null. If participants were not encoding image identity during exposure,
  there was no community structure for them to learn, whatever the analysis does.
- Evidence: executed, `robustness` chunk (A′ table). Restricting to A′ ≥ .6 (N = 6) still gives
  t = −0.02, so this does not *hide* an effect in the current data. But it leaves open that the
  exposure manipulation did not take, which is a different claim from "the effect does not exist".
- Fix: keep the preregistered rule as the confirmatory analysis. Report A′ (now in the
  report as an exploratory table) and discuss it. Treat it as a candidate reason for the failure
  alongside attention and key confusion. Consider an A′-based rule for Phase 2, but it must be
  preregistered before Phase 2 data.
- Verify: the A′ table renders, and the Discussion addresses it.

**M2. "Deviations from the preregistered plan: None" is wrong. The plan was 17 analysed participants; the analysis has 11.**
- Mechanism: the Planned sample says "I plan to recruit 17 valid samples that pass the exclusion
  criteria". 36 started, 18 completed, 11 passed. At N = 11, power to detect the original
  d_z = 0.73 is 0.59 (not 0.80). The minimum effect detectable with 80% power is d_z = 0.94.
- Direction: false null (underpowered). The CI [−0.54, 0.64] does exclude the original 0.73, which
  is the informative part. Say so, rather than relying on "not significant".
- Fix: the author lists the shortfall as a deviation, with the reason, and the achieved power.
- Verify: the Deviations section is no longer "None".

**M3. The Discussion's count of "key-swapped" participants does not match the data.**
- The text says "six people who scored 15–23%". The data show **five** completed sessions at
  15.0–22.5% accuracy (hit rate .59–.76, false-alarm rate .90–.96, A′ .18–.29). All five are in the
  `rotated-j` condition. The sixth-lowest scored 24.4%, is in `rotated-f`, had a 66% response rate,
  and an A′ of .49. That pattern is chance responding, not swapped keys. Pressing the "rotated" key
  on about 90% of upright images is confirmed for the five. All five being `rotated-j` supports the
  Phase 2 rationale (change #1). The funnel shows it too: rotated-j 11 completed → 5 kept; rotated-f 7 → 6.
- Direction: interpretation (supports the Phase 2 rationale once corrected).
- Fix: the author corrects the count and range, and can cite the condition split.

**M4. The dataset label is undocumented.** The folder is `schapiro2013-final`, but 35 of 36 sessions
are tagged `schapiro2013-pilot-b` (see check 6). Anyone checking the public data will see this.
- Fix: the author adds one sentence to the Methods addendum explaining that collection ran
  under the pilot-B id and that the id was changed mid-collection. Pilot-B pilot data are not included.

## Minors / notes

- m1. **Analysis plan formula.** "Cohen's d_z computed as (p_{community transition} − p_{other})"
  leaves out the division by the SD of the paired differences. The code is right
  (d_z = mean diff / SD diff = t/√N). The text needs fixing by the author.
- m2. **Methods/Procedure says participants first view "50 abstract images"**. There are 15.
- m3. **Exploratory conclusion.** "Visual similarity of the images does not account for the
  parsing effect" presumes an effect, but Phase 1 found none. Also, images are assigned to
  nodes at random per participant, so pixel similarity cannot produce a community effect
  systematically. Pixel cosine also barely separates the images (all 105 pairs .80–.98, mean .90; parsed vs.
  not parsed .9010 vs. .9014). Reword as "parse placement was not related to pixel similarity".
  The value t(10) = −0.22, p = .83 was re-derived and is correct.
- m4. **Funnel caption** said "by frame", left over from the template. Fixed to "by condition
  (response-key assignment)".
- m5. Two analysed participants pressed the spacebar on 550 and 581 of 600 images. They fit the
  preregistered rules and their inclusion does not change the result (table above). Report it if a
  reader would ask.
- m6. The Commentary attributes the failure to "differences in the sample, setting, procedure,
  materials, response keys, or analyses". The data point most to materials/cover task (M1) and
  key confusion (M3). The analyses are ruled out by this review.

## Changes made to the report (code only; all prose is the author's)

1. New exploratory chunk `robustness` (after the similarity analysis). It has an A′ table for
   analysed vs. excluded participants, and the key test under the alternative codings above.
   It has no prose; the author should add a sentence introducing it, or delete it.
2. Funnel table caption corrected (m4).
3. Re-rendered `replication-report.html`; it renders without errors.

Remember to add a row to the AI use statement for this review and the robustness chunk.

## Not a certificate

- This review checks the analysis mechanically. It cannot establish whether the *stimuli* support the
  construct: whether these generated images are as distinguishable and memorable as the ArtMatic
  originals. That is the most plausible reason for a false null, and it needs a human judgement
  (or a recognition test) rather than code.
- The original's Fig. 2b values were read from the vector drawing. I only checked that they reproduce
  t9 ≈ 2.30 under a plausible correlation, not the extraction itself.
- The claim "my replication attempt failed to reproduce the original finding" is supported (CI
  excludes 0.73). Statements about *why* (attention, setting, keys) are not tested by this data.
