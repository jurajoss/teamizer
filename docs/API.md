# Teamizer — REST API

## Principles
REST/JSON; authentication except health; validated inputs; thin controllers; server-authoritative persistence; concurrency-safe completion; idempotent retries.

## Current user
`GET /me`

## Players
```text
GET    /players
GET    /players/:id
PATCH  /players/:id
GET    /players/:id/statistics
GET    /players/:id/matches
POST   /players/:id/avatar
```

## Matches
```text
GET  /matches/upcoming
GET  /matches/:id
POST /matches/:id/registration
DELETE /matches/:id/registration
POST /matches/:id/participants
PATCH /matches/:id/participants/:playerId
POST /matches/:id/generate-teams
POST /matches/:id/start
POST /matches/:id/complete
POST /matches/:id/cancel
```

## Registration
POST => GOING. DELETE => remove MatchParticipant => unanswered.
Before start, a player may change only their own response. Only an admin may add/change another existing active Player. A player may create a new persistent guest and add that guest as GOING; an admin may add any active persistent guest. After start, reject changes.

## Generate
`POST /matches/:id/generate-teams` requires OPEN, uses GOING players/history, runs algorithm and returns a temporary proposal. Never persists proposals and can be repeated.

## Start
`POST /matches/:id/start` receives selected teams. Backend requires OPEN, validates every GOING player appears exactly once, exactly two non-empty teams, sport rules, then atomically persists final teams/provenance, locks attendance/teams and changes to IN_PROGRESS.

## In progress
`GET /matches/:id` returns persisted teams/state. No live scoring endpoints.
Opening an IN_PROGRESS Match restores that device's valid local draft or starts
a new local scoring session at 0:0.

## Complete
`POST /matches/:id/complete`

Example body:
```json
{
  "score": {"teamA": 4, "teamB": 3},
  "playerGoals": [
    {"playerId": "p1", "goals": 3},
    {"playerId": "p2", "goals": 1},
    {"playerId": "p3", "goals": 2},
    {"playerId": "p4", "goals": 1}
  ]
}
```

Idempotency key uses a standard idempotency header.

Backend requires IN_PROGRESS, validates persisted teams, score and player goals, validates total goals equal total score, then transactionally persists result, updates statistics and marks FINISHED.

First successful completion wins. Later completion gets 409 unless it is a safe retry with the same idempotency key/request.

No scorekeeper authorization.

## Finished
No normal edit endpoint.

## Statistics
```text
GET /players/:id/statistics
GET /players/:id/matches
GET /rankings
GET /matches/:id
```
Default ranking: win rate desc, matches desc, goals/match desc, goals desc, name asc. Zero-match players last with N/A win rate; only ACTIVE players by default, guests included. Statistics summaries also include attendance: distinct FINISHED Matches in which the Player has final Team membership divided by the application-wide FINISHED-Match count. Rankings reuse those counts and percentage without per-Player requests.

`GET /players/:id` is also the screen-level Player profile response. It returns
only public identity/statistics to PLAYER callers. ADMIN callers receive the
existing private ratings plus account linkage state (`UNLINKED`, `INVITED`, or
`REGISTERED`) in that same response; pending invitation email is privileged.

## Schedule/admin
Admin APIs configure weekday, local time, timezone, enabled state, sport, location, generation horizon and notification timings. Concrete matches are generated 7 days before start.

## Push tokens
Support registration/invalidation of device tokens and preferences.

## Errors
Use consistent machine-readable format:
```json
{"error":{"code":"MATCH_ALREADY_FINISHED","message":"The match has already been completed."}}
```
400 validation, 401 unauthenticated, 403 unauthorized, 404 not found, 409 state/concurrency conflict, 422 semantic validation.

## No scoring endpoints
No add/remove goal, live score or score sync endpoints.
