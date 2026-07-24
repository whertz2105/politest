## How the Analyzer scores

The Analyzer reads a published article and estimates the **stance of the piece** —
its framing, not its subject — on Politeion's 22 axes, using a large language model
against a fixed internal rubric. The exact scoring prompt is proprietary; this page
summarizes the methodology so results can be read and challenged.

- **Stance, not subject.** An article *about* immigration is not scored as
  restrictionist. An axis is scored only where the piece itself takes, favors, or
  frames toward a side.
- **Quoted voices are not the author.** A source's position counts only through how
  the piece frames it (endorsement, sympathetic selection, unrebutted prominence).
- **Evidence required.** Every scored axis carries one verbatim quote (≤ 25 words)
  copied from the article; quotes are checked against the text, and an unverified
  quote flags the analysis.
- **Sparing by design.** A typical article implicates 1–5 axes. A straight report
  with no detectable stance is a valid, common result (no axes scored).
- **Neutral summary too.** Alongside the bias scan, every analysis includes a short
  neutral summary of the article's substance — what it reports or argues — written
  to be fair to readers of any politics and independent of the lean.

## Genre

Each piece is classified before scoring, because the stance bar differs by genre:

| Genre | Meaning |
|---|---|
| Report | News writing; stance possible but needs clear evidence |
| Analysis | Explanatory / interpretive; moderate stance common |
| Opinion | Editorial / op-ed / column; stance expected |
| Mixed | A substantial combination |

## Magnitude bands

Scores run −100 to +100 on each axis. The band conveys how strong the framing is:

| Range | Reading |
|---|---|
| ±15–35 | Subtle framing |
| ±40–65 | Clear lean |
| ±70–90 | Open advocacy |
| ±91–99 | Explicit, maximal advocacy |

Each score also carries a **confidence** (0–100%) — how certain the stance reading
is, independent of how extreme the score is.

## What gets flagged

A flagged analysis still displays, with a caution badge, but is **excluded from
writer and source aggregates**.

| Flag | What it means | Effect |
|---|---|---|
| Injection attempt | The submitted text tried to instruct the analyzer | Visible notice; excluded from aggregates |
| Unverified quote | An evidence quote was not found verbatim in the text | Caution; excluded from aggregates |
| Extreme score | A score hit the ±100 extreme the rubric forbids | Caution; excluded from aggregates |
| Too many axes | More than 8 axes scored (almost always over-reading) | Caution; excluded from aggregates |
| Paywalled fragment | Only a partial (paywalled) article was available | Reading may be partial |
| Non-political | The model judged the piece non-political | Noted |
| Satire suspected | Stance may be ironic | Noted |

## Left–right placement

Every analysis also shows a single **left ↔ right** position on the traditional
American scale, derived from the axes that carry a clear US partisan valence
(economics, welfare, culture, religion, immigration, nationalism, crime, the
environment, speech regulation, and federal vs. local power), weighted by score and
confidence. Axes with no clean partisan coding do not move the needle. When no
partisan lean is detected, the marker sits at center — that is a result, not a gap.
