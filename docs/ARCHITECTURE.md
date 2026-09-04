# Teamizer — Architecture

## Stack
Mobile: Expo/React Native/TypeScript, Expo Router, TanStack Query, Zod.
Backend: NestJS/TypeScript/REST, Prisma, PostgreSQL.
Auth: Firebase Authentication.
Push: Firebase/Expo-compatible infrastructure.

## Monorepo
```text
apps/mobile
apps/api
packages/algorithm
packages/shared
packages/ui
packages/config
docs
```
pnpm workspaces; Turborepo optional.

## Boundaries
Mobile never accesses PostgreSQL and never contains the authoritative balancing algorithm. `packages/algorithm` has no NestJS/Prisma/PostgreSQL/Firebase/HTTP/React dependencies.

Controllers are thin; business logic is in focused services. No ScorekeeperService.

## Operational readiness

The API establishes its Prisma/PostgreSQL connection before listening. Public
`GET /health` is dependency-aware readiness and probes PostgreSQL; process/TCP
supervision is the lightweight liveness signal. Readiness failures are
sanitized and never expose database connection details.

## Authentication
Firebase authenticates. Backend validates tokens and maps them to User/Player. First-time creation is explicit onboarding.

## Authorization
Server-side authorization follows PRODUCT.md; UI is not a security boundary.

## Match persistence
Lifecycle:
`OPEN_FOR_REGISTRATION -> IN_PROGRESS -> FINISHED`, with CANCELLED before start.
Generation is a temporary proposal. Start atomically persists final initial teams and locks attendance/teams.

An active ADMIN may create a one-off Match through the same persistence model.
Its nullable `scheduleId` remains null, while recurring materialization records
the originating Schedule. Both kinds use the same lifecycle services; there is
no parallel manual-Match model.

Do not add a global DB constraint allowing only one IN_PROGRESS match. Multiple concurrent matches are not a user-facing MVP feature, but the model should not structurally forbid them.

## Local scoring
Each device can create its own local scoring state for IN_PROGRESS. No authoritative scorekeeper and no live synchronization. Local state should survive background/navigation/restart where technically possible. Goal entry never calls backend. No recovery/transfer mechanism.

## Completion
Completion validates and persists the result transactionally. The IN_PROGRESS -> FINISHED transition must be atomic. Use idempotency keys.

## Balancing
Framework-independent and deterministic. For 2–14 participants use exhaustive unique partition enumeration. Above 14 use deterministic heuristic fallback with the same scoring functions.

## Historical teams
Final initial composition is immutable and used for match detail, history and balancing penalties. No in-match changes.

## Statistics
Derived from finished matches; raw matches and MatchPlayerStats are source of truth.

## Player profiles and avatars

`Player` remains the permanent public/sports identity. A normal Player profile
mutation can change only its own name and avatar. ADMIN-only serializers and
mutations expose the five internal balancing attributes; public serializers are
allowlists and never contain those fields.

Avatar binary data is behind the focused `AvatarStorage` boundary and is never
stored in PostgreSQL. The development adapter writes normalized JPEG objects to
a configured local directory and returns expiring HMAC-signed display URLs.
The database stores only the server-owned key, content type, and update time.
Upload processing verifies the decoded format, normalizes orientation, and
resizes/crops before storage. Native mobile first normalizes camera/library
assets to an explicitly typed JPEG multipart part; the API nevertheless treats
decoded bytes rather than client MIME/filename metadata as authoritative. A
managed production object-store adapter can
replace the development binding without changing Player or profile services.

Guest conversion updates the same Player row and creates only the User link, so
attributes, avatar metadata, memberships, statistics, and history keep their
existing Player ID. MVP deletion is status deactivation; Player/User rows and
historical Match relations are not physically deleted.

## Recurring scheduling and push

An in-process NestJS worker runs an explicit periodic tick. Calendar recurrence
is calculated from `Schedule.weekday`, local time, and IANA timezone, then
materialized as the existing Match representation. PostgreSQL uniqueness on
`(scheduleId, startsAt)` provides cross-process creation idempotency.

The same tick evaluates attendance reminders. A durable
`MatchReminderDelivery` claim provides cross-process per-device idempotency;
expired claims are leased/reclaimed and late results are fenced by an attempt
token. Provider delivery remains outside Match lifecycle transactions. Expo and
FCM are behind one time-bounded provider adapter. Mobile registers an Expo token
only after an authenticated identity exists and treats denied permission as a
normal no-push state. Before sign-out it records a per-User pending device
revocation locally, attempts the authenticated invalidation, and removes that
record only after success or terminal not-found handling. Transient failure
does not block Firebase sign-out. A later session retries only its own User's
pending revocation before registering again, so an A-to-B account switch never
sends A's revocation with B's credentials; server token upsert transfers the
physical token to B. Validated Match notification IDs route through the
existing protected Match route.
