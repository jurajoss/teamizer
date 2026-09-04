# Teamizer — AI Coding Agent Instructions

Read `docs/` before implementing. If a business rule is ambiguous, ask rather than invent.

## Engineering principles
Readable, maintainable and testable code is a project-wide requirement. Prefer explicit, boring, well-structured code over clever abstractions.

- TypeScript strict mode; avoid `any`.
- Validate external inputs at API boundaries.
- Keep controllers thin and business logic in focused services.
- Keep domain logic independent of HTTP/persistence where practical.
- Avoid large functions, hidden side effects, magic numbers and excessive indirection.
- Centralize named configuration.
- Important business behavior has focused tests.
- Do not duplicate business rules between mobile and backend.
- Preserve historical data.
- No event sourcing for scoring.
- Team balancing is critical business logic: prioritize readability, explainability and testability.

## Architecture
- Mobile never accesses PostgreSQL directly.
- Mobile does not contain the authoritative balancing algorithm.
- `packages/algorithm` is framework-independent.
- No Scorekeeper domain concept exists in MVP.

## Scoring
Each device may maintain its own local score for an IN_PROGRESS match. Goal entry makes no network request. Any player may finish. The first successful completion atomically changes IN_PROGRESS to FINISHED; later attempts conflict. There is no scorekeeper claim/transfer.

## Match/team rules
- Team generation is a temporary proposal, never a persisted lifecycle state.
- Proposals can be regenerated repeatedly before start.
- Only the selected proposal is persisted at Start.
- Teams may be manually adjusted before Start.
- Teams and attendance lock at Start.
- No in-match team changes.
- FINISHED is immutable.

## MVP exclusions
No scorekeeper sessions/transfers, live score sync, in-match team changes, automatic substitution tracking, on-field tracking, chat, payments, advertising, tournaments, seasons, public discovery, AI player ratings, user-facing multiple simultaneous matches, finished-match editing, persisted alternative proposals or per-goal event history.
