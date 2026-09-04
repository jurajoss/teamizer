# Teamizer — Team Balancing V1

## Goal
Generate two balanced teams while reducing recent repetition of complete teams, teammates and similar compositions. Balance has priority over history.

## Input rules
- 0 or 1 GOING player: generation/start is rejected.
- 2+ GOING players: valid.
- Both teams must be non-empty.
- Every GOING player is assigned exactly once.
- Target team sizes differ by at most one.
- There is no product-level participant maximum.

## AlgorithmConfigV1

```ts
const AlgorithmConfigV1 = {
  playerRating: {
    performanceWeight: 0.60,
    attributesWeight: 0.30,
    recentFormWeight: 0.10,
  },
  performance: {
    winRateWeight: 0.75,
    goalsPerMatchWeight: 0.25,
    winRatePriorWins: 3,
    winRatePriorMatches: 6,
    goalsPerMatchPriorMatches: 5,
  },
  attributes: {
    speed: 0.20,
    endurance: 0.15,
    defense: 0.25,
    attack: 0.25,
    technique: 0.15,
  },
  recentForm: {
    matchWeights: [0.40, 0.25, 0.15, 0.12, 0.08],
  },
  balance: {
    overallStrengthWeight: 0.70,
    attributeDifferenceWeight: 0.30,
    relativeTolerance: 0.05,
    absoluteTolerance: 0.001,
  },
  history: {
    repeatedTeamWeight: 0.50,
    repeatedTeammateWeight: 0.35,
    compositionSimilarityWeight: 0.15,
    recencyDecay: [1.00, 0.60, 0.35, 0.20, 0.10],
  },
  search: {
    exhaustiveThreshold: 14,
    heuristicMaxIterations: 100,
  },
}
```

All weight groups sum to 1.0. Configuration is validated at startup/test time.

## Player rating

### Reference population

The reference population is the set of ACTIVE players in the same group.

For goals-per-match calculations, include only reference-population players with at least one FINISHED match.

```text
groupGoalsPerMatch =
  total goals scored by the reference population
  /
  total FINISHED matches played by the reference population
```

If the denominator is zero:
```text
groupGoalsPerMatch = 0
```

For each player:
```text
smoothedGoalsPerMatch =
  (playerGoals + groupGoalsPerMatch * 5)
  /
  (playerMatches + 5)
```

For percentile normalization, use the smoothedGoalsPerMatch value for every reference-population player, including players with zero matches.

If fewer than 2 reference-population players exist:
```text
normalizedGoalsPerMatch = 0.5
```
for every player.

Otherwise sort the values ascending and calculate empirical percentiles using linear interpolation:

```text
position = (N - 1) * p
lower = floor(position)
upper = ceil(position)
fraction = position - lower

percentile(p) =
  values[lower] * (1 - fraction)
  +
  values[upper] * fraction
```

Set `p10 = percentile(0.10)` and `p90 = percentile(0.90)`.

If `p10 == p90`:
```text
normalizedGoalsPerMatch = 0.5
```

Otherwise:
```text
normalizedGoalsPerMatch =
  clamp(
    (smoothedGoalsPerMatch - p10) / (p90 - p10),
    0,
    1
  )
```

### Performance

```text
adjustedWinRate =
  (wins + 3)
  /
  (matches + 6)
```

This shrinks small samples toward 0.5.

```text
performance =
  0.75 * adjustedWinRate
  +
  0.25 * normalizedGoalsPerMatch
```

### Attributes

Each raw attribute is 1–10.

```text
normalizedAttribute = (value - 1) / 9
```

Then:
```text
attributeRating =
  0.20 * speed
  +
  0.15 * endurance
  +
  0.25 * defense
  +
  0.25 * attack
  +
  0.15 * technique
```

All inputs are normalized 0..1.

### Recent form

Use up to the five most recent FINISHED matches:
```text
win = 1
draw = 0
loss = -1
```

Weights:
```text
[0.40, 0.25, 0.15, 0.12, 0.08]
```

Use available weights and renormalize:
```text
weightedOutcome =
  sum(outcome_i * weight_i)
  /
  sum(weight_i)

recentForm = (weightedOutcome + 1) / 2
```

No finished matches:
```text
recentForm = 0.5
```

### Total player rating

```text
playerRating =
  0.60 * performance
  +
  0.30 * attributeRating
  +
  0.10 * recentForm
```

Player ratings are 0..1.

## Team profile

For every complete candidate team:

```text
teamRating = average(playerRating)
```

and each team attribute is the average of the players' normalized attribute.

## Candidate generation

### 2–14 players: exhaustive

Enumerate every unique partition into two non-empty teams whose sizes differ by at most one.

Mirrored partitions are identical:
```text
(A, B) == (B, A)
```

Canonicalize by sorting player IDs within each team and lexicographically ordering the two team ID lists.

### >14 players: deterministic heuristic fallback

The fallback has:
1. deterministic greedy construction,
2. deterministic pairwise local improvement.

#### Greedy construction

Sort players by:
1. playerRating descending,
2. player ID ascending.

Target sizes:
```text
targetA = ceil(N / 2)
targetB = floor(N / 2)
```

At each step, consider each team that still has capacity.

For each partial assignment calculate:

```text
partialTeamRating =
  average(playerRating of assigned players)
```

If a partial team is empty, its partial balance score is `+infinity`. Thus the first player is assigned to Team A and the second to Team B.

For non-empty partial teams:
```text
partialStrengthDifference =
  abs(partialTeamARating - partialTeamBRating)
```

For each normalized attribute:
```text
partialAttributeDifference(attribute) =
  abs(partialTeamAAttribute(attribute) - partialTeamBAttribute(attribute))
```

Then:
```text
partialAttributeDifference =
  0.20 * speedDifference
  +
  0.15 * enduranceDifference
  +
  0.25 * defenseDifference
  +
  0.25 * attackDifference
  +
  0.15 * techniqueDifference

partialBalanceScore =
  0.70 * partialStrengthDifference
  +
  0.30 * partialAttributeDifference
```

Greedy choice:
1. lower partialBalanceScore;
2. if tied, assign to the team with the lower current partial rating;
3. if still tied, assign to Team A.

History is not used during partial construction because historical penalties are defined on complete teams.

#### Pairwise local improvement

Starting from the greedy partition, enumerate all legal single pairwise swaps between teams.

A swap must preserve target team sizes.

For every complete swap candidate, use the full comparator below.

Apply the best strictly improving swap. Repeat until no improvement exists or 100 swaps have been applied.

## Balance

For a complete candidate:

```text
strengthDifference =
  abs(teamARating - teamBRating)
```

Each team attribute is already 0..1.

```text
attributeDifference =
  0.20 * abs(teamA.speed - teamB.speed)
  +
  0.15 * abs(teamA.endurance - teamB.endurance)
  +
  0.25 * abs(teamA.defense - teamB.defense)
  +
  0.25 * abs(teamA.attack - teamB.attack)
  +
  0.15 * abs(teamA.technique - teamB.technique)
```

```text
balanceScore =
  0.70 * strengthDifference
  +
  0.30 * attributeDifference
```

Lower is better.

## Balance tolerance

```text
bestBalanceScore = minimum(balanceScore)
```

A candidate is acceptable if:
```text
balanceScore <= max(
  bestBalanceScore * (1 + 0.05),
  bestBalanceScore + 0.001
)
```

Thus relative tolerance is 5% and absolute tolerance is 0.001.

If at least one acceptable candidate exists, history can only choose among acceptable candidates.

## Historical reference set

Use up to the five most recent FINISHED matches containing at least one current participant.

Order newest first:
```text
H1 = immediately previous relevant match
...
H5 = fifth previous relevant match
```

Use:
```text
decay = [1.00, 0.60, 0.35, 0.20, 0.10]
D = sum(decay_i for available historical matches)
```

With no historical matches, all three history penalties are 0.

## Repeated complete team penalty

For candidate team `C` and historical match `H_i`:

```text
exactTeamMatch(C,H_i) =
  1 if C exactly equals historical Team A
  1 if C exactly equals historical Team B
  0 otherwise
```

```text
teamRepeat(C) =
  sum(decay_i * exactTeamMatch(C,H_i))
  /
  D
```

Then:
```text
repeatedTeamPenalty =
  (teamRepeat(teamA) + teamRepeat(teamB)) / 2
```

Range: 0..1.

## Repeated teammate penalty

For every unordered pair `(a,b)` in candidate team `C`:

```text
sameTeam(a,b,H_i) =
  1 if a and b were on the same historical team in H_i
  0 otherwise
```

For a team with at least two players:
```text
pairRepeat(C) =
  average over all unordered pairs in C of
    (
      sum(decay_i * sameTeam(a,b,H_i)) / D
    )
```

For a team with fewer than two players:
```text
pairRepeat(C) = 0
```

Then:
```text
repeatedTeammatePenalty =
  (pairRepeat(teamA) + pairRepeat(teamB)) / 2
```

Range: 0..1.

## Composition similarity penalty

For candidate team `C` and historical match `H_i`:

```text
overlap(C,H_i) =
  max(
    |C ∩ historicalTeamA_i| / |C|,
    |C ∩ historicalTeamB_i| / |C|
  )
```

Then:
```text
similarityRepeat(C) =
  sum(decay_i * overlap(C,H_i))
  /
  D
```

And:
```text
compositionSimilarityPenalty =
  (similarityRepeat(teamA) + similarityRepeat(teamB)) / 2
```

Range: 0..1.

## History score

```text
historyScore =
  0.50 * repeatedTeamPenalty
  +
  0.35 * repeatedTeammatePenalty
  +
  0.15 * compositionSimilarityPenalty
```

Lower is better.

## Full candidate comparator

Only complete candidates use this comparator.

1. If at least one candidate is within balance tolerance, discard all candidates outside tolerance.
2. Choose lowest `historyScore`.
3. If history scores differ by no more than `1e-9`, choose lower `balanceScore`.
4. If still tied within `1e-9`, choose the lexicographically smaller canonical representation of sorted player IDs.

No randomness exists in V1.

This comparator is used for exhaustive selection and pairwise swap evaluation.

## Diagnostics and versioning

```ts
type TeamGenerationResult = {
  teamA: string[]
  teamB: string[]
  balanceScore: number
  historyScore: number
  breakdown: {
    strengthDifference: number
    attributeDifference: number
    repeatedTeamPenalty: number
    repeatedTeammatePenalty: number
    compositionSimilarityPenalty: number
  }
  algorithmVersion: string
  configurationVersion: string
}
```

Initial versions:
```text
algorithmVersion = "v1"
configurationVersion = "v1"
```

A started match stores the versions used by the last generated proposal.

If manually changed before start:
```text
teamGenerationMode = MANUAL_ADJUSTMENT
```
The last generated versions remain stored.

## Determinism

Given identical players, statistics, history, configuration and algorithm version, V1 returns identical teams.

No random seed is used.

## Tests

Cover:
- 0/1 rejection,
- 2+ participants,
- even/uneven counts,
- equal/unequal ratings,
- zero/one-match players,
- group goals baseline,
- percentile interpolation,
- degenerate percentile case,
- recent form with fewer than five matches,
- normalized team attributes,
- exact zero balance,
- tolerance,
- repeated teams,
- repeated teammate pairs,
- composition similarity,
- mirrored partition elimination,
- deterministic tie-breaking,
- exhaustive threshold,
- greedy partial objective,
- pairwise fallback improvement,
- 100-iteration limit,
- configuration validation,
- realistic performance.
