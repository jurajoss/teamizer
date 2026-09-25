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

## Mobile navigation shell

All authenticated mobile routes remain in one Expo Router stack. The shell owns
one canonical definition of the authenticated primary areas (`/home`,
`/matches`, `/players`, and `/statistics`) and composes it as bottom navigation
below the shared 700 px tablet breakpoint or as a left sidebar at and above it.
Feature screens and authorization rules are shared between modes. Match and
Player details retain their single canonical `/matches/:matchId` and
`/players/:playerId` routes; the shell does not create tab-specific copies or
hold Match lifecycle/scoring state.

Primary switches use framework pop-to/replace behavior instead of accumulating
stack entries. Nested workflows use native stack push/Back behavior, with
canonical-area fallbacks for direct deep-link entry. The shell owns navigation
safe areas, while `AppScreen` owns content spacing, scrolling, keyboard
avoidance, and width constraints.

A focused nested workflow may request temporary removal of primary chrome while
its route is focused. Active local scoring uses this shell contract rather than
covering the phone bottom navigation or duplicating navigation. Removing the
chrome also transfers bottom/left physical safe-area ownership back to
`AppScreen`; leaving scoring restores the normal responsive shell.

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

The active scoring presentation consumes the existing scoring-session
controller and durable draft as read-only inputs plus increment, decrement, and
finish commands. Responsive layout, sticky-score composition, and shell
visibility remain presentation concerns; they do not create another scoring
state or change completion semantics.

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
stored in PostgreSQL. `AVATAR_STORAGE_DRIVER=local` writes normalized JPEG
objects to a configured local directory for development;
`AVATAR_STORAGE_DRIVER=gcs` writes them to a private Google Cloud Storage bucket
through Application Default Credentials for TEST and production. Both adapters
return the existing API-hosted, expiring HMAC-signed display URLs, so clients
never receive bucket credentials or raw bucket permissions. The database stores
only the server-owned key, content type, and update time.

Upload processing verifies the decoded format, normalizes orientation, square
crops/resizes, and re-encodes JPEG before either adapter sees the bytes. Native
mobile first normalizes camera/library assets to an explicitly typed JPEG
multipart part; the API nevertheless treats decoded bytes rather than client
MIME/filename metadata as authoritative.

GCS names two bounded object slots per Player under the optional environment
prefix: `players/<playerId>/avatar-a.jpg` and `avatar-b.jpg`. The opaque database
key also carries the selected object's immutable GCS generation. Replacements
write the inactive slot while holding the Player row lock, atomically switch the
database reference, and then delete the superseded generation. This avoids URL
cache collisions and bounds failed-cleanup remnants without changing the Player
or profile API.

Guest invitation uses a small persistent `PlayerInvitation` reservation because
PostgreSQL, Firebase Authentication, and email delivery cannot be committed in
one transaction. The Guest stays a Guest while Firebase identity preparation
and email delivery run. The reservation stores normalized email, the resolved
Firebase UID, delivery/claim state, and timestamps, but never the action link or
password. On the invited identity's first authenticated request, a Player-row
locked transaction creates the User, changes the same Player row to `REGULAR`,
and marks the invitation accepted. Attributes, avatar metadata, memberships,
statistics, and history therefore keep their existing Player ID.

Invitation delivery remains behind `InvitationEmailSender`. The `development`
driver is a safe no-send adapter. The `firebase` driver uses the existing
Application Default Credential to call Identity Toolkit's project-scoped
`accounts:sendOobCode` operation with `PASSWORD_RESET`, web-first handling, and
no returned OOB link; Firebase sends its configured password-reset template and
hosts the default browser action handler on the project's `firebaseapp.com`
domain. The `resend` driver retains the branded bilingual template and embeds a
Firebase Admin-generated reset link. The Firebase request supplies no mobile
application settings, continue URL, `linkDomain`, or deprecated
`dynamicLinkDomain`, so invitation setup does not depend on Firebase Dynamic
Links, native deep linking, or passwordless email-link authentication.

The ADMIN UID conversion remains an advanced fallback. It uses the same Player
lock and cannot override an in-flight invitation or silently replace a UID
already reserved for that Player. MVP deletion is status deactivation;
Player/User rows and historical Match relations are not physically deleted.

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
