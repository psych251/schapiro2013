#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#| label: setup
#| include: false
library(tidyverse)
library(jsonlite)

# Must match EXPERIMENT.id in experiment.js, and the --experiment you passed to the export.
# Phase 2 runs under its own id, so its data never mix with Phase 1's.
experiment_id        <- "schapiro2013-pilot-a"
experiment_id_phase2 <- "framing-demo-phase2"
#
#
#
#| label: original-study
#| include: false
# The original study's numbers, entered once and used by the power analysis, the Key
# statistics table, and the side-by-side figures. Replace these with your original study's
# values, and say in a comment exactly where in the paper each one comes from.
#
# Schapiro et al. (2013), Experiment 2. N = 10: "experiment 2 had ten participants" (Online
# Methods, Participants). Key test: participants "pressed the spacebar on passing into a new
# cluster significantly more often than at other times in the sequence (t9 = 2.30, P < 0.05;
# Fig. 2b)".
# This is a paired t-test (transition vs. other parse probability, within participants). The
# paper gives only the t values and "P < 0.05", not the means or SDs, so the effect size is
# derived from t: Cohen's d_z = t / sqrt(N), with p and the 95% CI on d_z recomputed from t.
# Fig. 2b plots the means (±1 SEM) but they are not stated in the text.

# 95% CI on d_z from a paired t, by inverting the noncentral t distribution.
dz_ci <- function(t, n, level = 0.95) {
  df <- n - 1
  ncp_at <- function(q) uniroot(function(ncp) pt(t, df, ncp) - q, c(-40, 40))$root
  c(ncp_at((1 + level) / 2), ncp_at((1 - level) / 2)) / sqrt(n)
}
original <- tibble(
  paths = c("All trials", "Hamiltonian paths"),
  N     = 10,
  t     = c(2.30, 2.35)
) |>
  mutate(df = N - 1,
         p  = 2 * pt(-abs(t), df),
         estimate = t / sqrt(N),
         ci_low  = map2_dbl(t, N, ~ dz_ci(.x, .y)[1]),
         ci_high = map2_dbl(t, N, ~ dz_ci(.x, .y)[2]))
# The key test is the one on all trials.
original_key <- original |> filter(paths == "All trials")
original_dz  <- original_key$estimate
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#| label: analysis-functions
#| code-summary: "Show the analysis code (shared by Phase 1 and Phase 2)"

# Load one phase's exported data and apply the exclusion rule. Returns NULL if that phase
# has not been exported yet, which is how every section below knows to skip itself.
read_phase <- function(id) {
  dir <- file.path("..", "data", "raw", id)
  if (!all(file.exists(file.path(dir, c("participants.csv", "trials.csv"))))) return(NULL)
  participants <- read_csv(file.path(dir, "participants.csv"), show_col_types = FALSE)
  trials       <- read_csv(file.path(dir, "trials.csv"), show_col_types = FALSE)
  errors_path  <- file.path(dir, "errors.csv")
  errors <- if (file.exists(errors_path)) read_csv(errors_path, show_col_types = FALSE) else tibble()

  complete <- participants |> filter(completed)

  # Exclusion rule: replace with the rule you preregistered. Here: at least 6 of 8
  # lexical-decision trials correct, and at least one speeded response at all (a session in
  # which every speeded trial timed out is what a device without a keyboard produces).
  ld <- trials |>
    filter(task == "lexical_decision") |>
    group_by(participant_id) |>
    summarise(ld_acc           = mean(as.logical(correct), na.rm = TRUE),
              ld_all_timed_out = all(as.logical(timed_out)),
              .groups = "drop")
  checked <- complete |> left_join(ld, by = "participant_id")
  keep <- checked |> filter(!is.na(ld_acc), !ld_all_timed_out, ld_acc >= 0.75)

  list(participants = participants, trials = trials, errors = errors,
       complete = complete, keep = keep,
       n_no_response = sum(checked$ld_all_timed_out %in% TRUE))
}

# The key comparison's raw counts: how many analysed participants chose the risky program
# in each frame.
risky_counts <- function(d) {
  d$trials |>
    filter(task == "framing", participant_id %in% d$keep$participant_id) |>
    group_by(condition) |>
    summarise(risky = sum(choice == "risky"), n = n(), .groups = "drop")
}

# The key statistic: difference in the proportion choosing the risky program (loss minus
# gain) with a 95% CI, and the uncorrected chi-square, which is the same test. NULL until
# both frames have at least one analysed participant.
diff_ci <- function(counts) {
  loss <- counts[counts$condition == "loss", ]
  gain <- counts[counts$condition == "gain", ]
  if (nrow(loss) == 0 || nrow(gain) == 0) return(NULL)
  pt <- prop.test(c(loss$risky, gain$risky), c(loss$n, gain$n), correct = FALSE)
  tibble(N = loss$n + gain$n,
         estimate = unname(pt$estimate[1] - pt$estimate[2]),
         ci_low = pt$conf.int[1], ci_high = pt$conf.int[2],
         statistic = unname(pt$statistic), p = pt$p.value)
}

# Side-by-side figure: any number of studies on the same axes, in the order given.
prop_ci <- function(x, n) {
  ci <- prop.test(x, n, correct = FALSE)$conf.int
  tibble(p = x / n, low = ci[1], high = ci[2])
}
comparison_plot <- function(...) {
  studies <- list(...)
  studies <- studies[!map_lgl(studies, ~ is.null(.x) || nrow(.x) == 0)]
  df <- imap_dfr(studies, ~ mutate(.x, Study = .y)) |>
    rowwise() |> mutate(prop_ci(risky, n)) |> ungroup() |>
    mutate(Study = factor(Study, levels = names(studies)), label = sprintf("n = %d", n))
  fills <- setNames(c("grey55", "#1E6E76", "#B8792A")[seq_along(studies)], names(studies))
  dodge <- position_dodge(width = 0.8)
  ggplot(df, aes(x = condition, y = p, fill = Study)) +
    geom_col(position = dodge, width = 0.75) +
    geom_errorbar(aes(ymin = low, ymax = high), position = dodge, width = 0.2) +
    geom_text(aes(y = 0.02, label = label), position = dodge, vjust = 0, size = 3, colour = "white") +
    scale_y_continuous(labels = scales::percent, limits = c(0, 1)) +
    scale_fill_manual(values = fills) +
    labs(x = "Frame", y = "Chose the risky program", fill = NULL) +
    theme_minimal(base_size = 12) +
    theme(legend.position = "top")
}

phase1 <- read_phase(experiment_id)
phase2 <- read_phase(experiment_id_phase2)
have_data   <- !is.null(phase1)
have_phase2 <- !is.null(phase2)
#
#
#
#| label: key-stats
#| echo: false
# Each row needs N, df, t, p, and d_z as estimate / ci_low / ci_high (the columns of `original`).
# The Phase rows still call the template's framing-demo functions, which find no framing trials
# in this experiment and so show "not yet collected" until the parsing analysis replaces them.
fmt_row <- function(study, r) {
  if (is.null(r)) {
    return(tibble(Study = study, N = "", `Effect (d_z)` = "not yet collected",
                  `95% CI` = "", t = "", p = ""))
  }
  tibble(Study = study, N = as.character(r$N),
         `Effect (d_z)` = sprintf("%.2f", r$estimate),
         `95% CI` = sprintf("[%.2f, %.2f]", r$ci_low, r$ci_high),
         t = sprintf("t(%d) = %.2f", r$df, r$t),
         p = format.pval(r$p, digits = 2, eps = 0.001))
}
bind_rows(
  fmt_row("Original (Exp. 2)", original_key),
  fmt_row("Phase 1: replication", if (have_data) diff_ci(risky_counts(phase1))),
  fmt_row("Phase 2: extension", if (have_phase2) diff_ci(risky_counts(phase2)))
) |>
  knitr::kable(align = "lrllll",
               caption = "Key comparison: parse probability at community transitions vs. elsewhere in the sequence, all trials, paired t-test. Original values are from Schapiro et al. (2013), Experiment 2; its d_z, 95% CI and exact p are recomputed from the reported t9 = 2.30 (reported as P < 0.05).")
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#| label: power
# Paired t-test: with sd = 1, delta is d_z and n is the number of participants.
power_rows <- map_dfr(c(0.80, 0.90, 0.95), function(pw) {
  n <- power.t.test(delta = original_dz, sd = 1, power = pw, sig.level = 0.05,
                    type = "paired")$n
  tibble(power = scales::percent(pw), n_total = ceiling(n))
})

original_effect <- original_dz
two_and_half <- ceiling(2.5 * original_key$N)

knitr::kable(power_rows, col.names = c("Power", "N participants"),
             caption = sprintf(
               "Sample needed to detect the original effect (Experiment 2, d_z = %.2f, from t9 = %.2f with N = %d), paired t-test, two-sided alpha = .05.",
               original_dz, original_key$t, original_key$N))
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#| label: no-data-notice
#| echo: false
#| results: asis
if (!have_data) {
  cat(
    "::: {.callout-warning icon=false}\n",
    "## No Phase 1 data yet\n\n",
    "There are no exported data for `", experiment_id, "` yet, so the sample and results ",
    "sections are skipped. This is expected before data collection. Export with ",
    "`npm run export -- --experiment ", experiment_id, " --key <path to your key>` and render again. ",
    "If you have exported, check that `experiment_id` at the top of this file matches ",
    "`EXPERIMENT.id` in `experiment.js`.\n",
    ":::\n", sep = "")
}
#
#
#
#| label: phase1-data
#| eval: !expr have_data
# Loaded and excluded by read_phase(), under Key statistics, so Phase 1 and Phase 2 share one
# exclusion rule.
participants  <- phase1$participants
trials        <- phase1$trials
errors        <- phase1$errors
complete      <- phase1$complete
keep          <- phase1$keep
n_no_response <- phase1$n_no_response
#
#
#
#| label: funnel
#| eval: !expr have_data
funnel_levels <- c("Started", "Completed", "Passed exclusion criteria")
bind_rows(
  participants |> mutate(step = "Started"),
  complete     |> mutate(step = "Completed"),
  keep         |> mutate(step = "Passed exclusion criteria")
) |>
  mutate(step = factor(step, levels = funnel_levels)) |>
  count(step, condition, .drop = FALSE) |>
  pivot_wider(names_from = condition, values_from = n, values_fill = 0) |>
  mutate(Total = rowSums(across(-step))) |>
  rename(Step = step) |>
  knitr::kable(caption = "Participants at each step, by frame. Differences between frames in attrition or exclusion are a threat to validity and should be discussed.")
#
#
#
#| label: sample-text
#| eval: !expr have_data
#| echo: false
#| results: asis
cat(sprintf("Of %d participants who started, %d completed the study and %d met the exclusion criteria.",
            nrow(participants), nrow(complete), nrow(keep)))
if (n_no_response > 0) {
  cat(sprintf(" %d completed session(s) contained no response to any speeded trial and were excluded on that basis.",
              n_no_response))
}
if (nrow(keep) == 0) cat(" No participants remain for analysis yet, so the results below are empty.")
cat("\n")
#
#
#
#| label: demographics
#| eval: !expr have_data
demo <- trials |>
  filter(task == "demographics", participant_id %in% keep$participant_id) |>
  mutate(resp = map(response, ~ fromJSON(.x))) |>
  transmute(
    participant_id,
    age    = map_dbl(resp, ~ as.numeric(.x$age %||% NA)),
    gender = map_chr(resp, ~ as.character(.x$gender %||% NA))
  )

if (nrow(demo) > 0) {
  demo |>
    summarise(N = n(), `Mean age` = round(mean(age, na.rm = TRUE), 1),
              `SD age` = round(sd(age, na.rm = TRUE), 1),
              `Age not given` = sum(is.na(age))) |>
    knitr::kable(caption = "Age of the analysed sample.")
}
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#| label: confirmatory
#| eval: !expr have_data
framing <- trials |>
  filter(task == "framing", participant_id %in% keep$participant_id) |>
  select(participant_id, condition, choice)
risky <- risky_counts(phase1)
tab <- table(Frame = framing$condition, Choice = framing$choice)

if (all(dim(tab) == c(2, 2))) {
  # No continuity correction, so this test and the effect-size interval below agree: the
  # uncorrected 2 x 2 chi-square is the same test as the two-proportion comparison.
  print(tab)
  print(chisq.test(tab, correct = FALSE))
} else {
  message("Chi-square not run: the frame-by-choice table is ", paste(dim(tab), collapse = " x "),
          ". It needs both frames and both choices; with ", nrow(framing),
          " participant(s) in the analysis set this is expected.")
}
#
#
#
#
#
#
#
#
#
#
#
#| label: comparison
#| eval: !expr have_data
orig <- diff_ci(original)
rep  <- diff_ci(risky)

if (!is.null(rep)) {
  bind_rows(orig |> mutate(Study = "Original"), rep |> mutate(Study = "Phase 1: replication")) |>
    transmute(Study, N,
              `Difference (loss − gain)` = sprintf("%.0f points", 100 * estimate),
              `95% CI` = sprintf("[%.0f, %.0f]", 100 * ci_low, 100 * ci_high),
              p = format.pval(p, digits = 2, eps = 0.001)) |>
    knitr::kable(caption = "Effect size: difference in the percentage choosing the risky program.")
} else {
  message("Replication effect size not computed yet: need at least one analysed participant in each frame.")
}
#
#
#
#| label: comparison-verdict
#| eval: !expr have_data
#| echo: false
#| results: asis
if (!is.null(rep)) {
  excludes_zero <- rep$ci_low > 0 | rep$ci_high < 0
  includes_orig <- orig$estimate >= rep$ci_low & orig$estimate <= rep$ci_high
  cat(sprintf(
    "The replication's 95%% interval %s zero and %s the original estimate of %.0f points. ",
    if (excludes_zero) "excludes" else "includes",
    if (includes_orig) "includes" else "does not include",
    100 * orig$estimate))
  cat("These two facts are the starting point for the summary in the Discussion, not the conclusion.\n")
}
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#| label: fig-comparison
#| eval: !expr have_data
#| fig-cap: "Percentage choosing the risky program in each frame, original study and Phase 1 replication. Error bars are 95% confidence intervals."
#| fig-width: 7
#| fig-height: 4
comparison_plot(Original = original, `Phase 1: replication` = risky)
#
#
#
#
#
#
#
#
#
#
#
#| label: exploratory-rt
#| eval: !expr have_data
ld <- trials |>
  filter(task == "lexical_decision", participant_id %in% keep$participant_id) |>
  mutate(correct = as.logical(correct), is_word = as.logical(is_word), rt = as.numeric(rt)) |>
  filter(correct, !is.na(rt))

if (nrow(ld) > 0) {
  ld |>
    group_by(`Real word` = is_word) |>
    summarise(`Mean RT (ms)` = round(mean(rt)), `SD (ms)` = round(sd(rt)), Trials = n(), .groups = "drop") |>
    knitr::kable(caption = "Exploratory: lexical-decision response times, correct trials only.")
} else {
  message("No correct lexical-decision trials with a response time yet.")
}
#
#
#
#| label: data-quality
#| eval: !expr have_data
if (nrow(errors) > 0) {
  errors |> select(any_of(c("at", "trial_index", "message"))) |> head(20) |>
    knitr::kable(caption = "JavaScript errors reported from participants' browsers.")
} else {
  message("No errors were reported from participants' browsers.")
}
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#| label: phase2-power
# Within-subject design: every participant contributes both parse probabilities, so this is the
# number of analysed participants in Phase 2, not a per-condition count.
phase2_n_per_group <- 150

# Phase 1 estimate, in the same columns as `original` (N, df, t, p, estimate = d_z, ci_low, ci_high).
# Still the template's framing-demo call, so NULL until the parsing analysis replaces it.
p1_stats <- if (have_data) diff_ci(risky_counts(phase1))
basis <- if (!is.null(p1_stats)) list(dz = p1_stats$estimate, source = "Phase 1") else
  list(dz = original_dz, source = "the original study")

# Expected 95% CI half-width on d_z at n participants (large-sample approximation).
half_width <- function(n, dz) qt(0.975, n - 1) * sqrt(1 / n + dz^2 / (2 * n))
power_at <- function(n, dz) {
  tryCatch(power.t.test(n = n, delta = dz, sd = 1, sig.level = 0.05, type = "paired")$power,
           error = function(e) NA)
}

rows <- tibble(
  Study = c(if (!is.null(p1_stats)) "Phase 1 (actual)", "Phase 2 (planned)"),
  `N analysed` = c(if (!is.null(p1_stats)) p1_stats$N, phase2_n_per_group),
  `95% CI half-width` = c(if (!is.null(p1_stats)) sprintf("±%.2f", (p1_stats$ci_high - p1_stats$ci_low) / 2),
                          sprintf("±%.2f (expected)", half_width(phase2_n_per_group, basis$dz)))
)
knitr::kable(rows, caption = sprintf("Precision of the key estimate (d_z), Phase 2 expected values based on %s.", basis$source))

tibble(
  `Effect to detect` = c(sprintf("Original: d_z = %.2f", original_dz),
                         if (!is.null(p1_stats)) sprintf("Phase 1: d_z = %.2f", p1_stats$estimate),
                         sprintf("Half the original: d_z = %.2f", original_dz / 2)),
  `Power at planned N` = scales::percent(c(
    power_at(phase2_n_per_group, original_dz),
    if (!is.null(p1_stats)) power_at(phase2_n_per_group, p1_stats$estimate),
    power_at(phase2_n_per_group, original_dz / 2)
  ), accuracy = 1)
) |>
  knitr::kable(caption = sprintf("Power of the Phase 2 key test (paired t) at %d participants, two-sided alpha = .05.", phase2_n_per_group))
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#| label: phase2-notice
#| echo: false
#| results: asis
if (!have_phase2) {
  cat(
    "::: {.callout-warning icon=false}\n",
    "## No Phase 2 data yet\n\n",
    "There are no exported data for `", experiment_id_phase2, "` yet, so the Phase 2 results are ",
    "skipped. Export with `npm run export -- --experiment ", experiment_id_phase2,
    " --key <path to your key>` once Phase 2 has run.\n",
    ":::\n", sep = "")
}
#
#
#
#| label: phase2-results
#| eval: !expr have_phase2
p2_counts <- risky_counts(phase2)
p2_stats  <- diff_ci(p2_counts)
cat(sprintf("Phase 2: %d started, %d completed, %d analysed.\n",
            nrow(phase2$participants), nrow(phase2$complete), nrow(phase2$keep)))
if (!is.null(p2_stats)) {
  p_text <- if (p2_stats$p < 0.001) "p < .001" else sprintf("p = %.3f", p2_stats$p)
  cat(sprintf("Key comparison: %.0f points [%.0f, %.0f], chi-square(1) = %.2f, %s.\n",
              100 * p2_stats$estimate, 100 * p2_stats$ci_low, 100 * p2_stats$ci_high,
              p2_stats$statistic, p_text))
}
#
#
#
#| label: fig-phase2
#| eval: !expr have_phase2
#| fig-cap: "Percentage choosing the risky program in each frame: original study, Phase 1 replication, and Phase 2 extension. Error bars are 95% confidence intervals."
#| fig-width: 8
#| fig-height: 4
comparison_plot(Original = original,
                `Phase 1: replication` = if (have_data) risky_counts(phase1),
                `Phase 2: extension` = risky_counts(phase2))
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
#
