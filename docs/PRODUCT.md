# Teamizer — Product Requirements

## Purpose
Recurring team-sport app; initial use case is 3v3 football. Must remain extensible to other sports and team sizes.

## User / Player / Guest
A Player owns identity and history. A regular Player has at most one authenticated User. A guest is a persistent Player without a User. Guest conversion creates a User for the existing Player, preserving its ID/history. No separate Guest entity.

Roles: PLAYER, ADMIN.

## Authorization
| Action | PLAYER | ADMIN |
|---|---:|---:|
| View matches/statistics | yes | yes |
| Change own attendance | yes | yes |
| Adjust another player's attendance before start | no | yes |
| Create persistent guest | yes | yes |
| Edit own name/avatar | yes | yes |
| Edit player attributes | no | yes |
| Generate teams | yes | yes |
| Manually adjust proposed teams | yes | yes |
| Start match | yes | yes |
| Complete match | yes | yes |
| Cancel match | no | yes |
| Create one-off match | no | yes |
| Manage schedule | no | yes |
| Manage players | no | yes |

A Player may create a persistent guest but cannot create another person's authenticated User. Guest-to-user conversion is ADMIN-only. Self-onboarding can create/link only the current user's own new regular Player; it cannot claim or link an existing guest. The initial ADMIN is provisioned out-of-band during deployment.

## Participant authorization clarification

Before start:
- a player may change only their own attendance;
- only an ADMIN may add or change another existing active Player;
- a player may add themselves as GOING;
- a player may create a new persistent guest and add that guest as GOING;
- an ADMIN may add any active persistent guest as GOING.

## Firebase bootstrap
On first authenticated access the backend validates the Firebase token. If no application User exists, explicit onboarding creates/links a User and Player. Do not infer identity solely from a Firebase display name. Player ID is permanent.

## Inactive players
Inactive Players retain their identity and all historical data. They cannot register for matches, be added as participants, generate teams, start matches, score matches or complete matches. Admins can still view and manage inactive Players and their history. An inactive Player cannot be reactivated by themselves.

## Match lifecycle
```text
OPEN_FOR_REGISTRATION -> IN_PROGRESS -> FINISHED
```
CANCELLED is possible before start. Generating teams is not a state transition.

Registration:
- GOING = MatchParticipant exists with GOING
- NOT_GOING = MatchParticipant exists with NOT_GOING
- unanswered = no MatchParticipant record
Players change their own response; admins may adjust others before start. Active players can be added as GOING. Persistent guests can be created and added.

Start:
- selected proposal may be manually adjusted,
- backend validates it,
- final initial teams are persisted,
- attendance locks,
- status becomes IN_PROGRESS.

In progress:
- teams immutable,
- any player may open the match and start fresh local scoring at 0:0,
- no live synchronization,
- any player may complete,
- first successful completion wins.

Finished:
- immutable through normal APIs.

## Recurring schedule
Initial defaults:
- Tuesday
- timezone Europe/Prague
- configurable local start time
- enabled

Concrete Match records are created 7 days before start, with configured sport/location and OPEN_FOR_REGISTRATION status.

Notification defaults:
- registration reminder 48h before,
- final reminder 3h before.
Timings are configuration.

An active ADMIN may also create a one-off Match by selecting a Sport, Prague
local date/time, and optional location. It is stored as the same normal Match
model with no Schedule reference and immediately enters
OPEN_FOR_REGISTRATION. Recurring and one-off Matches share the complete Match
lifecycle; there is no separate manual-Match domain model.

## Sport/team configuration
MVP: exactly two teams; football has 3 on-field players per team. Extra participants are substitutes; app does not track substitutions or who is currently on field.

No product-level min/max participant count.
- 0/1 GOING: cannot start
- 2+ GOING: valid
- both teams non-empty
- all GOING players assigned exactly once
- uneven counts differ by one where possible

DB must not impose a global participant maximum.

## Team generation
Server-side in `packages/algorithm`. Uses statistics, five attributes and recent team history. Balance has priority over variety.

Generation can repeat before Start; proposals are not persisted. Only selected final teams are persisted.

Provenance:
- ALGORITHM if unchanged after generation
- MANUAL_ADJUSTMENT if generated proposal was changed
- MANUAL reserved for future fully manual composition

For generated proposals, persist algorithm/configuration version used by the last generation. Do not persist proposal history.

## Scoring
Active scoring shows avatar, name and current total goals. Player card is a one-tap +1 action. Explicit - control decrements goals, never below zero. Team score changes together with player aggregate.

Local state contains match ID, final teams, team scores and player goal totals. No Goal table, timestamps, ordering, deletion history or event log.

If local scoring state cannot be read/written durably, show a blocking error and do not pretend scoring is safe. MVP promises no recovery of lost local state.

## Completion
Any player may complete. Backend verifies IN_PROGRESS, persisted teams, scores and player goals, then transactionally stores result, updates statistics and marks FINISHED.

Invariant:
`sum(player goals) == Team A score + Team B score`.

## Match detail
Show final Team A players, Team B players, final score and player goal totals. Do not attribute individual goals to a team.

## Statistics
Show matches, wins, draws, losses, win rate, goals, goals/match, history, recent teammates/opponents and rankings.

Ranking:
1. win rate desc
2. matches desc
3. goals/match desc
4. goals desc
5. name asc

Zero-match players appear after players with matches and show win rate N/A. Only ACTIVE players included by default; guests included.

## MVP
Authentication, profiles, avatars, persistent guests/conversion, Tuesday matches, attendance, visible unanswered players, participant adjustment, notifications, team generation, history-aware variation, pre-start manual team adjustment, local scoring, durable local state, first-completion-wins, final submission, statistics/rankings/history, responsive phone/tablet UI, portrait/landscape and algorithm tests.

## Out of scope
Scorekeeper mechanisms, live sync, in-match team changes, automatic substitutions, on-field tracking, chat, payments, advertising, tournaments, seasons, public discovery, AI ratings, user-facing multiple simultaneous matches, finished-match editing, persisted alternative proposals and per-goal event history.
