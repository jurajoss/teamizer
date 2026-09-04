# Teamizer — Domain Model

## User
```ts
type UserRole = 'PLAYER' | 'ADMIN'
type User = {
  id: string
  playerId: string
  authProviderId: string
  role: UserRole
}
```
One User -> one Player; one Player -> at most one User.

## Player
```ts
type PlayerType = 'REGULAR' | 'GUEST'
type PlayerStatus = 'ACTIVE' | 'INACTIVE'
type Player = {
  id: string
  name: string
  type: PlayerType
  status: PlayerStatus
  avatarUrl?: string
  attributes: PlayerAttributes
}
```
Player IDs are permanent. INACTIVE Players retain all history but cannot participate in new matches or perform player match actions. Admins retain management access.

## Attributes
All 1–10:
```ts
type PlayerAttributes = {
  speed: number
  endurance: number
  defense: number
  attack: number
  technique: number
}
```

## Sport
```ts
type Sport = {
  id: string
  name: string
  teamsPerMatch: number
  playersOnFieldPerTeam: number
}
```
MVP: two teams; football 3 on field per team.

## Match
```ts
type MatchStatus =
  | 'OPEN_FOR_REGISTRATION'
  | 'IN_PROGRESS'
  | 'FINISHED'
  | 'CANCELLED'
```
Includes sport, startsAt, location, status, timestamps, team-generation provenance/version and concurrency metadata as appropriate. No global single-IN_PROGRESS invariant.

## MatchParticipant
```ts
type Attendance = 'GOING' | 'NOT_GOING'
type MatchParticipant = {
  matchId: string
  playerId: string
  attendance: Attendance
}
```
No record = unanswered. Attendance locks at start.

## Team
Exactly two per MVP match, stable side/key A/B.

## TeamMembership
```ts
type TeamMembership = {
  teamId: string
  playerId: string
}
```
Exactly one final team per participating player. Immutable after start.

## MatchPlayerStats
```ts
type MatchPlayerStats = {
  matchId: string
  playerId: string
  goals: number
}
```
Unique `(matchId, playerId)`. Aggregate goals only. No Goal entity/event log.

## Team generation provenance
```ts
type TeamGenerationMode =
  | 'ALGORITHM'
  | 'MANUAL_ADJUSTMENT'
  | 'MANUAL'
```
MVP normally uses ALGORITHM or MANUAL_ADJUSTMENT. Store last generated algorithm/config version when applicable. Do not store alternative proposals.

## Schedule
Includes weekday, local time, timezone, enabled, sport, location, registration/reminder timings and 7-day generation horizon. Initial weekday Tuesday.

## Avatar
The optional avatar belongs to Player, including a guest Player. Store only a
server-generated object-storage reference and metadata, not image binary or a
client-supplied external URL. Guest conversion and deactivation retain that
reference with the unchanged Player ID and history.

## Group
MVP may use one lightweight group/scoping model; do not build full multi-tenancy.

## Relationships
```text
User 1──1 Player
Player 1──N MatchParticipant
Player 1──N TeamMembership
Player 1──N MatchPlayerStats
Match 1──N MatchParticipant
Match 1──2 Team
Match 1──N MatchPlayerStats
Team 1──N TeamMembership
```
