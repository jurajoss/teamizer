# Teamizer — Roadmap

## Phase 0 — Readiness
- review specification
- Codex READY FOR DEVELOPMENT review
- resolve all BLOCKER/IMPORTANT findings, including complete AlgorithmConfigV1 formulas and authorization/bootstrap rules

## Phase 1 — DB/API design gate
Only after readiness approval:
- complete PostgreSQL/Prisma schema
- complete REST API contract
- transaction/concurrency design
- authorization matrix
- DTO/error conventions

No production implementation before approval.

## Phase 2 — Foundation
Monorepo, Expo mobile, NestJS API, PostgreSQL/Prisma, shared TS, Firebase auth/onboarding, CI, lint/format/typecheck/test.

## Phase 3 — Domain/persistence
User, Player, Sport, Match, MatchParticipant, Team, TeamMembership, MatchPlayerStats, schedule, push tokens, avatar storage, admin management.

## Phase 4 — Balancing
AlgorithmConfigV1, rating, smoothing/normalization, recent form, candidate generation, exhaustive through 14, deterministic fallback, balance/tolerance/history penalties, versioning, diagnostics and tests.

## Phase 5 — Match flow
Registration, unanswered/GOING/NOT_GOING, participant adjustment, guests, generation, pre-start adjustment, start, immutable teams, local scoring/persistence, complete, first-completion-wins.

## Phase 6 — Statistics
Player stats, rankings, history, recent teammates/opponents, match detail.

## Phase 7 — Notifications
Push registration, Tuesday match creation, reminders, match-start and completion/statistics notifications.

## Phase 8 — Hardening
Concurrency, local-state/restart edge cases, accessibility, security, performance and production deployment.
