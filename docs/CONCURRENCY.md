# Teamizer — Transactions, Concurrency, and Local Scoring Design

## Concurrency principles

- PostgreSQL is authoritative for persistent Match lifecycle, final teams, and
  completed results.
- A Match row is the serialization point for all Match-affecting writes.
  Start, completion, cancellation, and attendance mutation acquire a row lock
  for that Match before making a state decision.
- Use PostgreSQL `READ COMMITTED` transactions with `SELECT ... FOR UPDATE` on
  the Match row. This gives a waiting transaction a fresh view of the committed
  state after the lock is released. The implementation may issue the row-lock
  statement through Prisma's transaction/raw-query facility; the required
  database behavior, not a particular ORM call, is the contract.
- `Match.stateVersion` increments for every Match-affecting persistent change:
  attendance creation/update/removal, Start, completion, and cancellation. It
  makes a generated proposal receipt invalid when its participant set changes.
- No table or transaction claims scoring ownership. Multiple devices can score
  independently and locally; only completion competes for a persistent state
  transition.

## Start Match transaction

### Input

`POST /matches/:matchId/start` receives:

```json
{
  "teamAPlayerIds": ["uuid"],
  "teamBPlayerIds": ["uuid"],
  "proposalReceipt": "signed-opaque-value"
}
```

The server-signed receipt contains at least:

```ts
type ProposalReceiptPayload = {
  matchId: string
  matchStateVersion: number
  generatedTeamAPlayerIds: string[] // canonical order
  generatedTeamBPlayerIds: string[] // canonical order
  algorithmVersion: string
  configurationVersion: string
}
```

It is an HMAC-signed value, not a database row, lock, or authorization token.
Its purpose is provenance integrity: the client cannot invent an algorithm or
configuration version. A receipt is accepted only while its Match remains OPEN
at the state version it names.

### Exact transaction

1. Begin a `READ COMMITTED` transaction.
2. Lock the Match row: `SELECT ... FROM match WHERE id = :id FOR UPDATE`.
3. If the Match is not `OPEN_FOR_REGISTRATION`, return `409 MATCH_NOT_OPEN`.
4. Verify the proposal receipt signature, Match ID, and receipt state version
   against the locked Match. A failed check returns `409 PROPOSAL_RECEIPT_INVALID`.
5. Lock all current GOING Player rows with `SELECT ... FOR UPDATE`, ordered by
   Player UUID ascending. The lock order is always Match first, then GOING
   Players in UUID order.
6. Read GOING MatchParticipants and their current Player statuses in the same
   transaction. Reject if fewer than two are GOING, any submitted player is not
   GOING/ACTIVE, a GOING player is omitted or duplicated, a team is empty, or
   team sizes differ by more than one.
7. Canonicalize submitted teams. If they exactly equal receipt memberships, set
   `teamGenerationMode = ALGORITHM`; otherwise set
   `MANUAL_ADJUSTMENT`. Copy algorithm/configuration versions from the verified
   receipt in either case.
8. Insert exactly Team A and Team B, then one TeamMembership per GOING player.
   The database unique keys `(matchId, side)` and `(matchId, playerId)` protect
   the central final-team invariants.
9. Update the locked Match to `IN_PROGRESS`, set `startedAt`, provenance
   fields, and increment `stateVersion`.
10. Commit. Return persisted Match detail.

### Concurrent Start and attendance behavior

Two Start requests cannot both succeed: the first transaction holds the Match
lock and changes status; the waiter observes `IN_PROGRESS` and receives 409.

Attendance write operations acquire that same Match lock first. Therefore an
attendance update either commits before Start and invalidates the receipt by
incrementing `stateVersion`, or waits until Start commits and receives
`409 ATTENDANCE_LOCKED`. A team proposal is never started against an unseen
participant set.

Player administration updates lock the affected Player row through PostgreSQL's
normal `UPDATE` behavior. Therefore deactivation that commits first is visible
after Start obtains the Player lock and Start rejects the inactive GOING
Player. If Start obtains the Player lock first, deactivation waits until the
atomic Start decision commits. The shared deterministic order for Start is
Match row first, then GOING Player rows by UUID; attendance mutations take only
the Match lock and do not invert that order.

## Guest invitation and activation

Invitation send, activation, and UID fallback all lock the target Player row
before changing its account linkage. One `PlayerInvitation` row exists per
Player and per normalized email. Sending records a random attempt token and
start time while holding the Player lock; another request receives
`409 INVITATION_IN_PROGRESS` until the configured lease expires. External
Firebase/email calls happen outside the database transaction. Every later write
is fenced by the attempt token, and retry adopts a Firebase identity previously
created for the same normalized email.

Resend receives the attempt token as its provider idempotency key. Firebase's
password-reset send operation has no Teamizer idempotency-key field, so the
database lease prevents overlapping requests but cannot make an ambiguous
provider acceptance atomic. A retry after a timeout at the delivery boundary
may send another reset email; it still reuses the same Firebase identity and
cannot create another Player or User.

First authenticated activation locks the same Player, rechecks the invitation
UID/email and absence of a User, then creates the User, changes `Player.type`,
and marks the invitation accepted in one transaction. Concurrent self-
onboarding cannot replace the Guest: the authentication guard claims a pending
email reservation before exposing onboarding. UID fallback cannot run while a
send attempt is active and cannot override a different reserved UID.

## Complete Match transaction

### Canonical completion request

The local device submits final side scores and sparse player totals. Before
hashing or persistence, the backend creates a canonical payload:

1. Load immutable final TeamMemberships.
2. Reject duplicate player IDs, negative/non-integer scores or goals, and any
   submitted player outside final teams.
3. Add each omitted final-team player with goals `0`.
4. Sort player totals by `playerId`.
5. Serialize `{score: {teamA, teamB}, playerGoals: sortedTotals}` with a stable
   JSON serializer and calculate SHA-256.

Thus `{p1: 2}` and `{p1: 2, p2: 0}` are the same logical request when `p2` is a
final-team player. The canonical total must equal `teamA + teamB`.

### Exact transaction

1. Begin a `READ COMMITTED` transaction.
2. Lock the Match row with `SELECT ... FOR UPDATE`.
3. Query `MatchCompletionIdempotency` for `(matchId, Idempotency-Key)` **after
   obtaining the Match lock**.
   - If found with a different request hash, return `409 IDEMPOTENCY_KEY_REUSED`.
   - If found with the same hash, the original completion committed. Return the
     immutable final Match detail as `200` and set `Idempotent-Replay: true`.
4. If no idempotency record exists and Match status is not `IN_PROGRESS`, return
   `409 MATCH_ALREADY_FINISHED` for FINISHED or `409 MATCH_NOT_IN_PROGRESS` for
   any other state.
5. Load final Teams and TeamMemberships, canonicalize/validate the request, and
   validate `sum(playerGoals) == teamA + teamB`.
6. Insert `MatchCompletionIdempotency(matchId, key, requestHash)`.
7. Insert one immutable `MatchPlayerStat` for every final TeamMembership,
   including zero totals.
8. Update Match with the two final scores, `completedAt`, `FINISHED`, and
   incremented `stateVersion`.
9. Commit and return `201` with final Match detail.

There is no materialized player-statistics table to update. Statistics are
derived from the newly committed raw Match, TeamMembership, and
MatchPlayerStat rows. This keeps the completion transaction short and makes
statistics recalculable.

### Why first-completion-wins is deterministic

For two different device requests, transaction A locks the Match first. It
inserts its idempotency record and changes status to FINISHED before commit.
Transaction B waits for that lock, then sees FINISHED and no matching key, so
it deterministically returns 409. It cannot insert another final result.

For a network retry from transaction A's device, the same match lock is taken,
then the same idempotency key/hash is found and final Match detail is returned.
No duplicate MatchPlayerStat rows can be inserted because the first result is
already immutable and `(matchId, playerId)` is unique.

### Failure handling

- Any database error rolls back the idempotency row, stats rows, score fields,
  and state transition together. A caller may retry with the same key after a
  rollback.
- Validation failures do not consume an idempotency key because no idempotency
  row is committed.
- Idempotency rows are retained for the lifetime of their Match. Finished
  matches are preserved, so indefinite retention is the simplest robust choice
  and supports late mobile retries.

## Other state-changing operations

### Attendance mutation

While OPEN, lock Match; verify it is OPEN and target/actor authorization; then
create/update/delete the MatchParticipant record and increment `stateVersion`.
Deleting the record represents unanswered. Start serializes with this lock as
described above.

### Cancellation

An active ADMIN locks Match. If OPEN, it sets `CANCELLED`, `cancelledAt`,
`cancelledByUserId`, and increments `stateVersion`; otherwise it returns 409.
It does not delete attendance records.

### Scheduled match materialization

The generator computes the next future occurrence from Schedule local time plus
its IANA timezone, converts it to UTC, and inserts an OPEN Match. Concurrent
scheduler or admin invocations serialize on the Schedule row, use a
conflict-tolerant insert, and read the single resulting Match. The unique
database key `(scheduleId, startsAt)` remains the ultimate cross-process
duplicate guard. A missed tick materializes only the next future occurrence
when it is inside the configured horizon; it never backfills historical OPEN
Matches.

Materialization also locks the Schedule row and returns an already-materialized
future Match before calculating a new instant. Therefore a local-time, Sport,
or location configuration change applies after the existing future occurrence
rather than creating a second session in the same week. The database unique key
remains the final duplicate guard for a concrete occurrence.

### Reminder delivery

Before external delivery, a worker inserts `MatchReminderDelivery` for the
composite identity `(matchId, pushDeviceId, reminderType)`. The primary key lets
only one concurrent worker establish the initial claim. Each attempt receives a
random `claimToken`; result updates require the same token, fencing a worker
whose lease has expired. A `DELIVERED` or `INVALID_TOKEN` row is terminal.

An explicit `TRANSIENT_FAILURE` is reclaimable after the one-minute retry delay.
A `PENDING` claim is reclaimable after its two-minute lease, including after a
process crash before the provider call or database result write. Reclaim uses a
single compare-and-update and increments the attempt count, so concurrent
reclaimers produce one active database owner. Provider calls time out after 30
seconds in the normal flow, leaving headroom before lease expiry. The
process-local tick guard exists only to avoid overlapping work inside one
process.

After claiming and immediately before provider dispatch, the worker rechecks
the authoritative Match lifecycle and current device/User eligibility. If a
cancellation, Start, preference, attendance, activity, or token-ownership change
has already committed, it releases the unsent claim and skips delivery. A state
change after this final check may still race an already-authorized external
call; external push cannot participate in the PostgreSQL transaction.

Push delivery is outside Match lifecycle transactions. Provider failure cannot
alter Match state. A permanently invalid token is marked inactive in the same
database transaction that records `INVALID_TOKEN`.

The application guarantee is durable single-claim ownership and fenced result
recording, not strict end-to-end exactly-once delivery. If a provider accepts a
notification and the worker dies before recording success, a later lease
reclaim may send again. Avoiding both that duplicate and permanent message loss
would require idempotency support from the external provider, which Expo/FCM do
not provide for this call.

## Local scoring persistence contract

### Storage mechanism

Use an Expo-compatible SQLite database on each device. It provides atomic local
writes and structured recovery without involving PostgreSQL or the API. The
local database is private to that app installation; it is not a replication
store and is never read by the backend.

Store at most one current draft per `(authenticatedUserId, matchId)` on an
installation. This permits a restart to resume that installation's score while
still allowing every other device to maintain an independent draft.

### Serialized draft

```ts
type LocalMatchDraftV1 = {
  schemaVersion: 1
  userId: string
  matchId: string
  matchStateVersion: number
  teams: {
    teamA: { id: string; playerIds: string[] }
    teamB: { id: string; playerIds: string[] }
  }
  score: { teamA: number; teamB: number }
  playerGoals: Record<string, number> // every final player, including zero
  completion: {
    state: 'ACTIVE' | 'PENDING' | 'SUCCEEDED' | 'CONFLICTED'
    idempotencyKey: string | null
    canonicalRequestHash: string | null
  }
  createdAt: string // UTC RFC 3339
  updatedAt: string // UTC RFC 3339
}
```

This is aggregate state only. It has no goal timestamps, order, deletion
history, live-sync metadata, or scorekeeper ownership field.

### Creation, mutation, and restoration

1. `Start scoring` first loads Match detail. It must be IN_PROGRESS and contain
   immutable final teams.
2. If an ACTIVE/PENDING draft for the current user and Match already exists,
   restore it rather than silently replacing it. The UI may offer an explicit
   discard-and-start-from-zero action.
3. Otherwise, create a V1 draft with zero scores and an explicit zero entry for
   every final team member, then commit the SQLite row before enabling scoring.
4. Every `+1` or `−1` changes player total and its final team's score in the
   same SQLite transaction. Decrement never allows a value below zero.
5. On foregrounding, navigation return, or restart, read and validate the
   draft before rendering score controls.

### Local failure and stale drafts

- If SQLite cannot create, read, or commit a draft, roll back the visible action,
  show a blocking error, and disable scoring. The application must not pretend
  that an unsaved score is safe.
- If JSON/row validation fails, a schema version is unsupported, or team/player
  data is inconsistent, mark the draft corrupt and offer only discard. Lost
  local state is unrecoverable by explicit MVP decision.
- Before resuming a draft, fetch Match detail. If Match is FINISHED or
  CANCELLED, discard the stale draft; there is no merge, sync, or transfer.
- If Match remains IN_PROGRESS but its persisted teams/state version does not
  equal the draft's immutable team snapshot, block and discard the draft. In
  normal MVP flow this cannot happen after Start, so it identifies stale or
  corrupt local data.

### Completion from a draft

1. On the first completion attempt, normalize the draft into the API request,
   generate an idempotency key, calculate/store its canonical hash, set local
   state to `PENDING`, and commit that local update before making the network
   call.
2. Network failures retry the exact same normalized body and idempotency key.
   A user cannot edit a PENDING draft, which would create a different payload.
3. `201` or idempotent `200` marks the draft `SUCCEEDED`; after final detail is
   shown, delete the local draft.
4. `409` means another completion won (or the key was misused). Mark the draft
   `CONFLICTED`, show the required message, and discard it after acknowledgement.
5. A non-consumed `422` validation failure returns the draft to ACTIVE, clears
   the key/hash, and allows correction. Such a response should be exceptional
   because the local state enforces normal score constraints.

No action in this process uploads incremental goals, polls for live score, or
creates a hidden scorekeeper/ownership mechanism.

## Internal design review

| Review question | Result |
|---|---|
| Is every approved domain entity represented? | Yes: User, Player, Sport, Match, attendance, final teams, aggregate stats, Schedule, push device, and completion idempotency. |
| Can a guest convert without losing history? | Yes. User is added against the permanent Player ID and type changes in one transaction. |
| Can unanswered attendance exist? | Yes. It is absence of a composite-keyed MatchParticipant row. |
| Can final teams remain immutable? | Yes. They are only inserted by Start; no post-start team mutation exists. |
| Can completion race safely? | Yes. Both requests serialize on the Match row; only the first changes IN_PROGRESS to FINISHED. |
| Can the same completion retry safely? | Yes. Match-scoped key plus canonical request hash returns the original final detail. |
| Can devices score independently? | Yes, with independent SQLite drafts. |
| Is there score synchronization or a hidden scorekeeper? | No. The only server scoring call is final completion and no owner/session table exists. |
| Can a FINISHED match change accidentally? | No normal mutator accepts FINISHED; database checks and row-locked transitions reinforce this. |
| Can inactive users perform forbidden actions? | No. Match-action authorization requires an ACTIVE Player. |
| Can a non-admin add another existing Player? | No. Only the atomic new-guest path is available to a normal Player. |
| Can a PLAYER view or change balancing attributes? | No. Public DTOs omit attributes even for self, and only ADMIN endpoints may update them; initial creation input is write-only. |
| Is algorithm provenance retained without proposals? | Yes. A stateless signed receipt supplies verified versions at Start; only final provenance is stored. |
| Are unnecessary tables present? | No Goal, Scorekeeper, proposal, event, Group, or derived-statistics table is introduced. |
| Are primary indexes present? | Yes: lifecycle/upcoming Match queries, attendance, final memberships, player history, push device delivery, schedule occurrence, and idempotency. |
| Are date/time semantics unambiguous? | Yes: UTC instants for Match/API timestamps; local time plus IANA timezone for Schedule. |

## DB/API Design Gate Result

**READY FOR IMPLEMENTATION.**

The final attribute-visibility policy is reflected in the API DTO boundary:
attributes remain internal Player data for balancing, ADMIN-only serializers
may return them, and PLAYER serializers never do. The persistence model needs
no visibility configuration or change. Database, transaction, idempotency,
lifecycle, local-scoring, and API design decisions have no remaining genuine
implementation blocker.
