# Teamizer — MVP REST API Design

## API conventions

### Transport and representation

- Base paths below are relative to the API origin; no version prefix is required
  for the MVP. A future version may be introduced at the gateway.
- JSON request and response properties use `camelCase`.
- Resource IDs are UUID strings.
- All instant timestamps are RFC 3339 UTC strings, for example
  `2026-08-26T18:30:00.000Z`.
- Schedule local time is `HH:mm:ss`; its IANA `timeZone` supplies the meaning.
  A client must never treat schedule local time as UTC.
- Nullable fields are returned as `null`; omitted fields are not used to mean
  null. Optional request fields may be omitted.
- List responses use cursor pagination:

```json
{
  "items": [],
  "nextCursor": "opaque-string-or-null"
}
```

`limit` defaults to 25 and is between 1 and 100. Cursors are opaque and bound
to the endpoint's documented sort order.

### Authentication and active-user rule

All endpoints except `GET /health` require `Authorization: Bearer <Firebase ID
token>`. The backend validates Firebase issuer, audience, expiry, and subject,
then resolves `authProviderId` to a Teamizer User.

If the Firebase identity is valid but not onboarded, only `POST /onboarding`
is available; other authenticated endpoints return `403 ONBOARDING_REQUIRED`.

Any endpoint described as requiring an active player rejects a User whose
Player is `INACTIVE` with `403 PLAYER_INACTIVE`. ADMIN authority does not let an
inactive account perform player match actions; an active ADMIN may perform its
administrative actions.

`GET /health` is the public operational readiness endpoint. Application startup
first establishes the Prisma/PostgreSQL connection. After startup, `/health`
performs a lightweight PostgreSQL probe and returns `200 {"status":"ok"}` only
while the API can serve persistence-backed requests. Database failures return a
sanitized `503`; no connection or credential details are exposed. Process/TCP
supervision supplies lightweight liveness separately.

### Shared DTOs

```ts
type Id = string // UUID
type Instant = string // RFC 3339 UTC instant
type LocalTime = string // HH:mm:ss

type PlayerAttributes = {
  speed: number // integer 1..10
  endurance: number
  defense: number
  attack: number
  technique: number
}

// Returned to every PLAYER caller. It deliberately has no attributes field.
type PlayerPublicDto = {
  id: Id
  name: string
  type: 'REGULAR' | 'GUEST'
  status: 'ACTIVE' | 'INACTIVE'
  avatarUrl: string | null
}

// This is an ADMIN-only read projection. It is not returned to a normal
// PLAYER merely because the Player is their own.
type AdminPlayerDto = PlayerPublicDto & {
  attributes: PlayerAttributes
}

type PlayerSummary = PlayerPublicDto

type PlayerStatisticsSummaryDto = {
  matches: number
  wins: number
  draws: number
  losses: number
  winRate: number | null
  goals: number
  goalsPerMatch: number | null
}

type PlayerDetailDto = PlayerPublicDto & {
  statistics: PlayerStatisticsSummaryDto
}

type AdminPlayerDetailDto = PlayerDetailDto & {
  attributes: PlayerAttributes
}

type TeamDto = {
  id: Id
  side: 'A' | 'B'
  players: PlayerSummary[]
}

type MatchScoreDto = { teamA: number; teamB: number }

type PlayerGoalsDto = { playerId: Id; goals: number }
```

`avatarUrl` is derived from the stored object key and may be a short-lived URL;
clients must treat it as display data rather than a persistent identifier.

`PlayerAttributes` is an internal balancing-data type. It is never a property
of a response sent to a `PLAYER`, including `GET /me` and that player's own
detail response. ADMIN-only responses use `AdminPlayerDto` for the current
user and `AdminPlayerDetailDto` for a player detail. There is no configurable
visibility mechanism in the MVP.

Implementations must map Player records through these explicit allowlisted
DTOs; they must not serialize a Prisma Player record directly. This makes a
future read policy an authorization/serializer change, not a persistence-model
change.

Creation requests may accept the complete attribute object because every
Player requires initial balancing inputs; that write-only creation input does
not grant read or later update access to a normal PLAYER.

## Error model

Every non-success response has this body:

```json
{
  "error": {
    "code": "INVALID_TEAM_COMPOSITION",
    "message": "Every going player must appear in exactly one team.",
    "details": [
      {"field": "teamAPlayerIds", "code": "DUPLICATE_PLAYER", "message": "..."}
    ],
    "requestId": "uuid"
  }
}
```

`details` is optional and is used only for safe validation information. Error
codes are stable; the human-readable message is not a client contract.

| Status | Codes |
|---|---|
| 400 | `VALIDATION_ERROR`, `IDEMPOTENCY_KEY_REQUIRED`, `UNSUPPORTED_AVATAR_MEDIA_TYPE`, `INVALID_AVATAR_IMAGE` |
| 401 | `UNAUTHENTICATED` |
| 403 | `ONBOARDING_REQUIRED`, `FORBIDDEN`, `PLAYER_INACTIVE` |
| 404 | `RESOURCE_NOT_FOUND` |
| 409 | `MATCH_NOT_OPEN`, `MATCH_NOT_IN_PROGRESS`, `MATCH_ALREADY_FINISHED`, `MATCH_CANCELLED`, `ATTENDANCE_LOCKED`, `CONCURRENT_STATE_CHANGE`, `IDEMPOTENCY_KEY_REUSED`, `PROPOSAL_RECEIPT_INVALID` |
| 413 | `AVATAR_TOO_LARGE` |
| 422 | `PLAYER_IS_NOT_GUEST`, `FIREBASE_IDENTITY_NOT_FOUND`, `INVALID_TEAM_COMPOSITION`, `INSUFFICIENT_GOING_PLAYERS`, `INACTIVE_PARTICIPANT`, `INVALID_SCORE`, `INVALID_PLAYER_GOALS`, `GOAL_TOTAL_MISMATCH`, `INVALID_SCHEDULE` |
| 503 | `IDENTITY_PROVIDER_UNAVAILABLE`; `HTTP_ERROR` for unavailable operational dependencies |

`409` distinguishes a valid request that loses a state race from `422`, which
means the submitted business data is semantically invalid.

## Current user and onboarding

### `GET /me`

- **Authentication:** Firebase token and existing Teamizer User.
- **Authorization:** current User only.
- **200 response:**

```json
{
  "user": {
    "id": "uuid",
    "role": "PLAYER",
    "notificationsEnabled": true,
    "createdAt": "2026-08-26T10:00:00.000Z"
  },
  "player": {
    "id": "uuid",
    "name": "Gaz",
    "type": "REGULAR",
    "status": "ACTIVE",
    "avatarUrl": null
  }
}
```

For an ADMIN caller, the `player` object is the `AdminPlayerDto` variant and
also includes `attributes`. For a PLAYER caller, `player` is always the
attribute-free `PlayerPublicDto` shown above, even when it represents them.

### `POST /onboarding`

- **Authentication:** valid Firebase token with no Teamizer User.
- **Authorization:** self-service only. It creates a new, active `REGULAR`
  Player and a `PLAYER` User for the token subject. It cannot link an existing
  guest.
- **Body:**

```json
{
  "name": "Gaz",
  "attributes": {"speed": 5, "endurance": 5, "defense": 5, "attack": 5, "technique": 5}
}
```

- **Validation:** nonblank name up to 120 characters; all attributes are
  integers 1–10.
- **201 response:** same shape as `GET /me`.
- **409:** `USER_ALREADY_ONBOARDED` when the Firebase subject already maps to a
  User.

## Players

### `GET /players`

- **Authentication/authorization:** any onboarded User.
- **Query:** `status=ACTIVE|INACTIVE` (default `ACTIVE`), `q` (optional
  case-insensitive name prefix), `limit`, `cursor`.
- **Sort:** `name ASC, id ASC`.
- **200:** paginated `PlayerSummary` objects. ADMIN callers may request
  `status=ALL`; PLAYER callers cannot expose inactive players through this list.
  `PlayerSummary` never contains attributes, for either role.

### `GET /players/:playerId`

- **Authentication/authorization:** any onboarded User.
- **200:** Player detail with avatar URL, type, status, and current public
  statistics summary. A PLAYER receives only the public detail shape and
  never receives `attributes`, including for their own Player. An ADMIN
  receives the otherwise identical `AdminPlayerDetailDto`, which includes the
  complete `attributes` object.
- **404:** unknown Player.

### `PATCH /players/:playerId`

- **Authentication:** onboarded User.
- **Authorization:** a PLAYER may update only their own `name`; an ADMIN may
  update name, status, and attributes for any Player. `type` is never patched
  directly.
- **Body:** any permitted subset of:

```json
{
  "name": "Gaz",
  "status": "INACTIVE",
  "attributes": {"speed": 7, "endurance": 6, "defense": 5, "attack": 8, "technique": 7}
}
```

- **200:** the caller's Player detail projection: public detail for a PLAYER,
  `AdminPlayerDetailDto` (including attributes) for an ADMIN.
- **Validation:** attributes are supplied as a complete five-field object and
  each value is 1–10. A request that contains `attributes` from a PLAYER is
  rejected with `403 FORBIDDEN`. An inactive Player cannot self-reactivate.

### `POST /players/:playerId/avatar`

- **Authentication:** onboarded User.
- **Authorization:** own Player or ADMIN.
- **Request:** `multipart/form-data` with one `file` part. JPEG, PNG, WebP,
  HEIC, and HEIF are accepted up to the configured limit (5 MB by default,
  with a 10 MB hard ceiling). The API verifies decoded image content,
  normalizes orientation, center-crops/resizes to 512×512, and encodes JPEG.
  Native mobile camera/library input is normalized to a named JPEG part before
  upload so HEIC/HEIF and platform metadata differences do not leak into the
  transport contract. The API uses decoded bytes, not the declared filename or
  multipart MIME, as the authoritative format check.
  Storage keys are server-generated; only object metadata is recorded in
  PostgreSQL.
- **200:** Player detail with refreshed `avatarUrl`.

### `DELETE /players/:playerId/avatar`

- **Authentication/authorization:** same as avatar upload.
- **204:** clears the object-storage reference. The underlying object may be
  removed asynchronously after the database update.

The local development adapter stores normalized files in a configured local
directory. TEST/production use a private Google Cloud Storage adapter selected
by configuration. Both serve through the same API-hosted expiring HMAC-signed
URLs; storage credentials, bucket permissions, and object keys are never
accepted from mobile clients. GCS replacement keys include an object generation
for cache invalidation and use two bounded physical slots per Player so cleanup
failures cannot cause unbounded live-object growth.

### `POST /players/:playerId/convert-to-user`

- **Authentication/authorization:** active ADMIN only.
- **Body:** `{ "authProviderId": "firebase-uid" }`.
- **Behavior:** verifies that the already provisioned Firebase identity exists,
  then binds it to this guest, creates its User with role `PLAYER`, and changes
  Player type to `REGULAR` in one transaction. It does not create a Firebase
  account. Provider validation happens before mutation; validation failure
  leaves the guest unchanged.
- **201:** `{ "user": ..., "player": AdminPlayerDto }`.
- **409:** `PLAYER_ALREADY_HAS_USER` or `AUTH_PROVIDER_ALREADY_LINKED`.
- **422:** `PLAYER_IS_NOT_GUEST` or `FIREBASE_IDENTITY_NOT_FOUND`.
- **503:** `IDENTITY_PROVIDER_UNAVAILABLE`; the response does not expose
  Firebase details. Firebase bearer-token verification does not by itself prove
  that Application Default Credentials can perform Admin `getUser`; local and
  deployed API credentials must target the configured project and have
  `firebaseauth.users.get` permission.

### `GET /players/:playerId/statistics`

- **Authentication/authorization:** any onboarded User.
- **200:**

```json
{
  "playerId": "uuid",
  "matches": 12,
  "wins": 6,
  "draws": 2,
  "losses": 4,
  "winRate": 0.5,
  "goals": 23,
  "goalsPerMatch": 1.9167
}
```

For zero matches, `winRate` and `goalsPerMatch` are `null`, not zero.

### `GET /players/:playerId/matches`

- **Authentication/authorization:** any onboarded User.
- **Query:** `limit`, `cursor`.
- **Sort:** `startsAt DESC, id DESC`.
- **200:** paginated finished-match history; each item has final teams, score,
  the subject player's aggregate goals, and the subject's result (`WIN`,
  `DRAW`, or `LOSS`).

## Matches and attendance

### `POST /admin/matches`

- **Authentication/authorization:** active ADMIN.
- **Body:**

```json
{
  "sportId": "uuid",
  "localDate": "2026-09-15",
  "localStartTime": "18:30:00",
  "location": "Pitch A"
}
```

- **Date/time:** the two local values are interpreted by the API in
  `Europe/Prague` and converted to the UTC Match instant. The start must be in
  the future. A skipped or repeated local DST time is rejected rather than
  silently shifted or guessed.
- **Behavior:** creates exactly one `OPEN_FOR_REGISTRATION` Match with
  `scheduleId = null`, no MatchParticipants, and no Team or TeamMembership
  rows. After creation it uses the same registration, team, Start, scoring,
  completion, and statistics behavior as a scheduled Match.
- **201:** explicit Match summary DTO.
- **400:** malformed fields. **422 `INVALID_MATCH`:** nonexistent or
  unsupported Sport, invalid local instant, or non-future start.

### `GET /matches`

- **Authentication/authorization:** any onboarded User.
- **Query:** optional `status`, `from`, `to`, `limit`, `cursor`.
- **Sort:** `startsAt ASC, id ASC` for future/open/in-progress results and
  `startsAt DESC, id DESC` when `status=FINISHED` or `CANCELLED` is requested.
- **200:** paginated match summaries.

### `GET /matches/upcoming`

- **Authentication/authorization:** any onboarded User.
- **200:** every `IN_PROGRESS` Match regardless of scheduled time, plus
  `OPEN_FOR_REGISTRATION` Matches whose `startsAt` is now or later, ordered by
  `startsAt ASC, id ASC`. Each includes the caller's attendance (`GOING`,
  `NOT_GOING`, or `null` for unanswered). An overdue open Match remains OPEN
  and accessible by ID/list, but is no longer presented as upcoming; the MVP
  does not auto-cancel or expire it.

### `GET /matches/:matchId`

- **Authentication/authorization:** any onboarded User.
- **200:** Match detail:

```json
{
  "id": "uuid",
  "sport": {"id": "uuid", "name": "Football", "teamsPerMatch": 2, "playersOnFieldPerTeam": 3},
  "startsAt": "2026-08-25T17:00:00.000Z",
  "location": "Pitch A",
  "status": "IN_PROGRESS",
  "stateVersion": 4,
  "myAttendance": "GOING",
  "participants": {"going": [], "notGoing": [], "unanswered": []},
  "teams": [{"id": "uuid", "side": "A", "players": []}, {"id": "uuid", "side": "B", "players": []}],
  "provenance": {"mode": "ALGORITHM", "algorithmVersion": "v1", "configurationVersion": "v1"},
  "result": null
}
```

Before Start, `teams`, `provenance`, and `result` are null. For FINISHED,
`result` contains final score and aggregate `playerGoals`; it never contains
live or per-goal information.

### `POST /matches/:matchId/registration`

- **Authentication/authorization:** active PLAYER or ADMIN for their own
  Player.
- **Body:** none.
- **Behavior:** upserts the caller's MatchParticipant to `GOING` while the
  Match is OPEN.
- **200:** `{ "attendance": "GOING" }` (idempotent).
- **409:** `ATTENDANCE_LOCKED` if not OPEN.

### `DELETE /matches/:matchId/registration`

- **Authentication/authorization:** active PLAYER or ADMIN for their own
  Player.
- **Behavior:** deletes the caller's MatchParticipant while OPEN; this means
  unanswered, not `NOT_GOING`.
- **204:** including when already unanswered.

### `PATCH /matches/:matchId/participants/:playerId`

- **Authentication:** onboarded User.
- **Authorization:** the active Player may patch only their own record; an
  active ADMIN may patch any active existing Player/guest.
- **Body:** `{ "attendance": "GOING" | "NOT_GOING" }`.
- **Behavior:** upserts the response while OPEN. This is the endpoint for a
  player to explicitly choose `NOT_GOING`.
- **200:** `MatchParticipant` DTO.

### `POST /matches/:matchId/participants`

- **Authentication:** onboarded User.
- **Authorization and body are a tagged union:**

```json
{ "playerId": "uuid" }
```

is ADMIN-only and adds an existing ACTIVE Player as GOING; or

```json
{
  "guest": {
    "name": "Guest name",
    "attributes": {"speed": 5, "endurance": 5, "defense": 5, "attack": 5, "technique": 5}
  }
}
```

is available to any active Player or ADMIN. It atomically creates a persistent
GUEST Player and adds that guest as GOING. This is intentionally the MVP route
by which a non-admin creates and adds their own new guest; no guest-ownership
model is needed.

- **201:** created/updated participant and, for a guest, its Player summary.
- **409:** attendance locked; **422:** inactive/unknown player or invalid guest.

## Team proposal and Start

### `POST /matches/:matchId/generate-teams`

- **Authentication/authorization:** active PLAYER or ADMIN; Match must be OPEN.
- **Body:** none.
- **200:**

```json
{
  "teamAPlayerIds": ["uuid"],
  "teamBPlayerIds": ["uuid"],
  "balance": {"balanceScore": 0.012, "historyScore": 0.18},
  "algorithmVersion": "v1",
  "configurationVersion": "v1",
  "proposalReceipt": "opaque-server-signed-value"
}
```

The receipt is stateless and not a proposal row. It contains the Match ID,
current `stateVersion`, canonical generated memberships, algorithm/configuration
versions, and an HMAC signature. It is not a grant of authority.

### `POST /matches/:matchId/start`

- **Authentication/authorization:** active PLAYER or ADMIN.
- **Body:**

```json
{
  "teamAPlayerIds": ["uuid"],
  "teamBPlayerIds": ["uuid"],
  "proposalReceipt": "opaque-server-signed-value"
}
```

- **Server-derived provenance:** if submitted canonical memberships exactly
match the signed receipt, mode is `ALGORITHM`; otherwise it is
`MANUAL_ADJUSTMENT`. `algorithmVersion` and `configurationVersion` always come
from the verified receipt, never directly from the client.
- **Validation:** Match OPEN; receipt belongs to this Match and its current
  state version; 2+ GOING Players; exactly two non-empty teams; every GOING
  Player exactly once; no non-GOING Player; team sizes differ by at most one;
  Sport is valid for MVP.
- **200:** started Match detail with persisted teams/provenance.
- **409:** `MATCH_NOT_OPEN`, `CONCURRENT_STATE_CHANGE`, or invalid receipt due
  to changed match state. **422:** invalid team composition.

The receipt is sufficient to preserve algorithm provenance without persisting
alternative proposals. An older receipt may not be used once attendance/state
changes because `stateVersion` changes; it remains a client-only proposal.

## Completion and cancellation

### `POST /matches/:matchId/complete`

- **Authentication/authorization:** active PLAYER or ADMIN. No scorekeeper or
  team-membership authorization exists by approved MVP design.
- **Headers:** `Idempotency-Key: <8–255 character opaque key>` is required.
- **Body:**

```json
{
  "score": {"teamA": 4, "teamB": 3},
  "playerGoals": [
    {"playerId": "uuid", "goals": 3},
    {"playerId": "uuid", "goals": 1}
  ]
}
```

- **Validation:** Match is IN_PROGRESS; scores and goals are non-negative
  integers; no duplicate player IDs; every supplied player belongs to a final
  Team; omitted final team members mean zero; total normalized player goals
  equals `teamA + teamB`.
- **201:** first successful completion returns final Match detail.
- **200:** safe replay with the same key and the same normalized payload;
  response is the same final Match detail and includes
  `Idempotent-Replay: true`.
- **409:** a different request after completion, a reused key with a different
  normalized payload, or a lost completion race.
- **422:** invalid score or player goals.

### `POST /matches/:matchId/cancel`

- **Authentication/authorization:** active ADMIN.
- **Body:** none.
- **Validation:** Match must be OPEN.
- **200:** cancelled Match detail; cancellation preserves the Match row and
  any attendance history. **409:** match already started/finished/cancelled.

## Statistics and rankings

### `GET /rankings`

- **Authentication/authorization:** any onboarded User.
- **Query:** `includeInactive=false` by default, `limit`, `cursor`.
- **Sort:** win rate DESC, matches DESC, goals/match DESC, goals DESC, name
  ASC. Zero-match Players sort after Players with matches; guests are included.
- **200:** paginated ranking rows with rank, Player summary, and statistic
  summary. `includeInactive=true` is ADMIN-only.

Statistics endpoints derive values from FINISHED Match, TeamMembership, and
MatchPlayerStat rows. They never update or synchronize an in-progress score.

## Schedule and notification administration

MVP exposes one configured recurring schedule while retaining a normal
`Schedule` model. An ADMIN may configure it through the mobile editor backed by
this API. There is no user-facing multi-schedule feature or general recurrence
rule editor.

### `GET /admin/sports`

- **Authentication/authorization:** active ADMIN.
- **200:** supported two-team Sport summaries ordered by name and ID. The
  response exists for the one-off Match and Schedule selectors and contains no
  Player data.

### `GET /admin/schedule`

- **Authentication/authorization:** active ADMIN.
- **200:** schedule configuration DTO.

### `PUT /admin/schedule`

- **Authentication/authorization:** active ADMIN.
- **Body:**

```json
{
  "weekday": "TUESDAY",
  "localStartTime": "18:30:00",
  "timeZone": "Europe/Prague",
  "enabled": true,
  "sportId": "uuid",
  "location": "Pitch A",
  "generationHorizonDays": 7,
  "registrationReminderMinutes": 2880,
  "finalReminderMinutes": 180
}
```

- **Validation:** valid IANA timezone; valid local time; existing Sport with
  two teams in MVP; positive horizon and non-negative reminder intervals.
- **200:** updated schedule.

### `POST /admin/schedule/generate-matches`

- **Authentication/authorization:** active ADMIN; the scheduled job uses the
  same service operation.
- **Behavior:** idempotently materializes the next scheduled occurrence at the
  configured horizon. The unique `(scheduleId, startsAt)` database key prevents
duplicate records from concurrent job/manual execution.
- **200:** `{ "match": MatchSummary, "created": true | false }`.

If a future Match for the schedule is already materialized, configuration
changes apply after that occurrence; generation returns the existing Match
rather than creating a second future session for the changed local time.

One-off Matches are independent of this Schedule and are not changed by
Schedule updates. Scheduled and one-off Match records use the same lifecycle
endpoints after creation.

The periodic worker invokes the same materialization service. Catch-up is
bounded to the next future occurrence inside the configured horizon; historical
occurrences are never backfilled as OPEN Matches. Attendance reminders are
evaluated for OPEN future Matches at the configured offsets. Recipients are
active regular Users with notifications enabled and an active device, excluding
Players explicitly marked NOT_GOING. Guests have no User/device and are not
recipients. Delivery is claimed durably per Match, reminder type, and device.
Expired in-progress claims are reclaimed with a fenced attempt token; strict
exactly-once delivery across the external provider is not claimed.

## Push devices and preferences

### `PUT /me/push-devices`

- **Authentication/authorization:** onboarded User.
- **Body:**

```json
{
  "provider": "EXPO",
  "platform": "IOS",
  "pushToken": "provider-token",
  "deviceLabel": "Gaz's phone"
}
```

- **Behavior:** upserts by `(provider, pushToken)`, sets ownership to the
  current User, reactivates the token, and updates `lastSeenAt`.
- **200:** PushDevice DTO with token redacted except for a display suffix.

### `DELETE /me/push-devices/:deviceId`

- **Authentication/authorization:** device owner only.
- **204:** marks the token inactive and sets `invalidatedAt`.

### `PATCH /me/notification-preferences`

- **Authentication/authorization:** current User.
- **Body:** `{ "notificationsEnabled": true }`.
- **200:** `{ "notificationsEnabled": true }`.

## Authorization summary

| API group | PLAYER | ADMIN | Special handling |
|---|---|---|---|
| Read matches, players, statistics, rankings | yes | yes | Read access remains available to onboarded users; inactivity blocks match actions, not history visibility. |
| Own profile/avatar/attendance | yes | yes | Own Player only. |
| Existing participant changes | no, except own | yes | Existing target must be ACTIVE. |
| New guest plus current-match addition | yes | yes | Atomic creation/addition; no User creation. |
| View balancing attributes | no, including own | yes, all Players | Attributes are internal balancing data and are omitted from all PLAYER read DTOs. |
| Modify existing player attributes/status/conversion | no | yes | Guest conversion binds a pre-provisioned Firebase UID. A PLAYER may supply required initial attributes only while creating their own new Player or a new guest. |
| Generate, adjust proposal, start, complete | active only | active only | No scorekeeper or live-score privilege. |
| Cancel and schedule | no | active only | Match cancellation only while OPEN. |

## Resolved attribute-visibility policy

The final MVP policy is explicit: ADMIN can view all Player attributes and
modify them; PLAYER can neither view any Player attributes (including their
own) nor modify existing attributes. Attributes remain internal algorithm
inputs. No configurable visibility model is introduced. The public/admin DTO
split above is the extension seam for a later policy without a Player data
model migration.
