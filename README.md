# Teamizer

Teamizer is a mobile-first team-sport application. The repository contains the
project and persistence foundations plus Firebase-backed authentication,
Player/User onboarding, role authorization, guest-to-user conversion, Match
registration, deterministic team generation, atomic Match Start, durable local
mobile scoring, atomic Match completion, and derived Player
statistics/rankings/history.
It also materializes recurring Matches and sends durable attendance reminders
through registered mobile push devices.
The MVP Player-management phase adds self profile editing, Player-owned avatars,
ADMIN Player/guest administration, and history-preserving deactivation.

## Prerequisites

- Node.js 22.13 or newer
- pnpm 8.10 or newer
- Docker with Compose, or PostgreSQL 16 or newer

The repository pins pnpm 8.15.9. With Corepack available, enable the pinned
version with:

```bash
corepack enable
corepack prepare pnpm@8.15.9 --activate
```

## Setup

```bash
cp .env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
pnpm install
```

The example URLs match the included Compose services. Replace
`FIREBASE_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` with your Firebase
project ID and an absolute path to deployment credentials. Use equivalent
database URLs if PostgreSQL runs elsewhere.

Set `PROPOSAL_RECEIPT_SECRET` to an application secret of at least 32 random
characters. It signs stateless team-proposal receipts and must be shared by API
instances but never exposed to clients or committed to source control.

`SCHEDULER_ENABLED` controls the in-process scheduling worker and defaults to
true outside tests. `SCHEDULER_TICK_INTERVAL_MS` defaults to 60000 and must be
at least 1000. Multiple API replicas may enable the worker: PostgreSQL keys and
claims provide cross-replica idempotency. `EXPO_PUSH_ACCESS_TOKEN` is optional
unless Expo push security is enabled for the EAS project.
`PUSH_PROVIDER_TIMEOUT_MS` defaults to 30000 and bounds each provider attempt;
it must remain below the documented two-minute reminder claim lease.

Player avatars use a focused storage adapter. Development defaults to local
files under `.data/avatars`; set `AVATAR_STORAGE_DIRECTORY` to another writable
path if needed. `AVATAR_PUBLIC_BASE_URL` must be the API origin reachable by the
mobile device (not `localhost` for a physical phone). Set `AVATAR_URL_SECRET` to
an independent random secret of at least 32 characters. Signed display URLs
default to a one-hour lifetime, and uploads default to a 5 MB limit before the
API normalizes them to 512×512 JPEG. The local adapter is for development;
production deployment should bind the existing `AvatarStorage` interface to
managed object storage and keep its credentials server-side.

The native app accepts normal camera and photo-library selections, including
iPhone HEIC/HEIF assets, and uses Expo Image Manipulator to create a JPEG before
multipart upload. React Native sends that local JPEG URI as its supported
multipart file descriptor (`avatar.jpg`, `image/jpeg`); native code does not
convert the file through an ArrayBuffer-backed Blob. Web keeps the browser Blob
path. The API still decodes the actual bytes, enforces the size/pixel limits,
normalizes orientation, and re-encodes the stored object; a client-declared
extension or MIME is never treated as proof that a file is an image.

## Database setup

`apps/api/.env` is the API configuration file. Its `DATABASE_URL` must point to
the persistent development database. `TEST_DATABASE_URL` is read by integration
tests and must point to a separate, disposable database:

| Purpose                       | Compose service | Host port | Database name   |
| ----------------------------- | --------------- | --------: | --------------- |
| API development data          | `postgres`      |      5432 | `teamizer`      |
| Destructive integration tests | `postgres-test` |      5433 | `teamizer_test` |

Before starting Compose, verify that another PostgreSQL installation is not
already occupying the development port. On macOS or Linux:

```bash
lsof -nP -iTCP:5432 -sTCP:LISTEN
docker compose ps
```

If port 5432 belongs to a non-Teamizer PostgreSQL process, stop or reconfigure
that process before continuing. Do not point Teamizer at it accidentally.

Start the development and dedicated test databases, generate the Prisma client,
and deploy all migrations:

```bash
docker compose up -d postgres postgres-test
pnpm prisma:generate
pnpm prisma:migrate:deploy
DATABASE_URL=postgresql://teamizer:teamizer@localhost:5433/teamizer_test?schema=public pnpm prisma:migrate:deploy
```

The development database persists in a Docker volume. The test database uses
temporary container storage. `TEST_DATABASE_URL` must name a dedicated database
ending in `_test`; the PostgreSQL schema tests refuse to truncate any other
database.

Verify the two containers and database identities directly:

```bash
docker compose exec -T postgres pg_isready -U teamizer -d teamizer
docker compose exec -T postgres psql -U teamizer -d teamizer -c 'SELECT current_database();'
docker compose exec -T postgres-test pg_isready -U teamizer -d teamizer_test
docker compose exec -T postgres-test psql -U teamizer -d teamizer_test -c 'SELECT current_database();'
pnpm --filter @teamizer/api exec prisma migrate status --schema prisma/schema.prisma
```

The Prisma status command uses `DATABASE_URL` from `apps/api/.env`; confirm that
its output names `teamizer` at `localhost:5432`. Development and test databases
must remain separate. Never set `TEST_DATABASE_URL` to the persistent
development database, even temporarily.

No general development seed is provided. The approved design does not define
safe default users or players, and Firebase account creation remains an
explicit out-of-band operation. The one required reference record is created by
the focused default Sport bootstrap command:

```bash
pnpm build
pnpm --filter @teamizer/api sport:bootstrap
```

The command creates only `Football` with `teamsPerMatch=2` and
`playersOnFieldPerTeam=3`. It logs the Sport ID required for Schedule
configuration. Repeated or concurrent runs return the same Sport and never
create a duplicate. If a `Football` row already exists with a different shape,
the command fails rather than changing it.

## Firebase authentication

The API verifies Firebase ID tokens with the Firebase Admin SDK and maps the
verified Firebase UID to `User.authProviderId`. It uses Application Default
Credentials. In local development, point `GOOGLE_APPLICATION_CREDENTIALS` to
the absolute path of a readable service-account JSON file for the same project
as `FIREBASE_PROJECT_ID`; never commit that file. The service account must be
allowed to read Firebase Authentication users (`firebaseauth.users.get`, for
example through the Firebase Authentication Admin role). In an environment
that already provides Application Default Credentials with that permission,
the path variable may be omitted.

Check the local values before testing guest conversion:

```bash
test -r "$GOOGLE_APPLICATION_CREDENTIALS"
grep -E '^(FIREBASE_PROJECT_ID|GOOGLE_APPLICATION_CREDENTIALS)=' apps/api/.env
grep '^EXPO_PUBLIC_FIREBASE_PROJECT_ID=' apps/mobile/.env
```

The API and mobile project IDs must name the project containing the UID. Restart
the API after changing its environment. A successfully verified bearer token
does not prove `getUser(uid)` access: token signature verification can succeed
while Admin user lookup fails because ADC is missing, targets another project,
or lacks IAM permission. In that case conversion returns the sanitized
`IDENTITY_PROVIDER_UNAVAILABLE` response and the API log reports only a safe
failure category/provider code and configured project ID, never credentials or
tokens.

The mobile app uses Firebase's client SDK with email/password authentication.
In the Firebase console, register a web app for the project and enable the
Email/Password sign-in provider. Firebase accounts are provisioned out of band;
the MVP app does not provide public account creation or password reset.

ADMIN guest conversion trims the supplied UID and verifies it through Firebase
Admin before mutating the permanent Player identity. A missing identity is
rejected without changing the guest; Teamizer never creates the Firebase
account.

Copy `apps/mobile/.env.example` to `apps/mobile/.env` and set the public API URL
plus the Firebase web-app values:

```text
EXPO_PUBLIC_API_URL
EXPO_PUBLIC_FIREBASE_API_KEY
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
EXPO_PUBLIC_FIREBASE_PROJECT_ID
EXPO_PUBLIC_FIREBASE_APP_ID
EXPO_PUBLIC_EAS_PROJECT_ID
```

These Firebase client values identify the project but do not grant Admin access.
Never put `GOOGLE_APPLICATION_CREDENTIALS`, service-account JSON,
`PROPOSAL_RECEIPT_SECRET`, or any other server credential in the mobile
environment. Native sessions are restored through Firebase Auth backed by Expo's
AsyncStorage integration; web uses Firebase's supported browser persistence.
The EAS project ID is public configuration used to request an Expo push token;
push-provider access tokens and Firebase Admin credentials remain server-only.

All routes except the readiness endpoint `GET /health` require a bearer token.
A valid Firebase identity without a Teamizer User may call only
`POST /onboarding`. Implemented endpoints in this phase are:

```text
GET  /health
GET  /me
POST /onboarding
GET  /rankings
GET  /players
GET  /players/:playerId
PATCH /players/:playerId
POST /players/:playerId/avatar
DELETE /players/:playerId/avatar
GET  /players/:playerId/statistics
GET  /players/:playerId/matches
POST /players/:playerId/convert-to-user
GET  /matches
GET  /matches/upcoming
GET  /matches/:matchId
POST /matches/:matchId/registration
DELETE /matches/:matchId/registration
PATCH /matches/:matchId/participants/:playerId
POST /matches/:matchId/participants
POST /matches/:matchId/generate-teams
POST /matches/:matchId/start
POST /matches/:matchId/complete
POST /matches/:matchId/cancel
GET  /admin/sports
POST /admin/matches
GET  /admin/schedule
PUT  /admin/schedule
POST /admin/schedule/generate-matches
PUT  /me/push-devices
DELETE /me/push-devices/:deviceId
PATCH /me/notification-preferences
```

Self-onboarding always creates a new regular Player and a `PLAYER` User. It
cannot claim an existing guest or select an ADMIN role.

### Initial ADMIN provisioning

The initial ADMIN is promoted out of band after that Firebase identity has
completed normal self-onboarding:

```bash
pnpm build
pnpm --filter @teamizer/api admin:provision -- --auth-provider-id firebase-uid
```

The command is idempotent, requires `DATABASE_URL`, and does not create a
Firebase account, password, User, or Player. There is no public ADMIN signup.

## Recurring Match and push setup

Use the Sport ID printed by `sport:bootstrap`, then configure the singleton MVP
schedule with an authenticated active ADMIN request to `PUT /admin/schedule`.
For example:

```json
{
  "weekday": "TUESDAY",
  "localStartTime": "18:00:00",
  "timeZone": "Europe/Prague",
  "enabled": true,
  "sportId": "sport-id-printed-by-bootstrap",
  "location": "Pitch A",
  "generationHorizonDays": 7,
  "registrationReminderMinutes": 2880,
  "finalReminderMinutes": 180
}
```

The worker immediately ticks at API startup and then at the configured
interval. It creates only the next future occurrence once it enters the
seven-local-day horizon; downtime never produces historical OPEN Matches. The
calendar calculation keeps the configured Europe/Prague local time stable
across CET/CEST transitions. The ADMIN generation endpoint invokes the same
idempotent operation for an operational check. If a future occurrence already
exists, schedule changes take effect after it instead of creating another Match
for the same week.

An active ADMIN can perform the same recurring setup from **Manage Matches →
Recurring Schedule** in the mobile app. **Manage Matches → Create Match**
creates a one-off OPEN Match in Europe/Prague local time; it has no Schedule
reference and then follows the normal registration-through-completion
lifecycle. Creating either kind refreshes the existing Home/upcoming Match
query. Schedule edits never rewrite an already materialized or historical
Match.

Attendance reminders target active regular Users with notifications enabled
and an active device, except Players explicitly marked NOT_GOING. Guests have
no authenticated device and are excluded. The first reminder defaults to 48
hours before start and the final reminder to 3 hours. Durable per-device claims
prevent repeat delivery across ordinary ticks, restarts, and concurrent
workers; explicitly transient failures are retried, while permanently invalid
tokens are disabled. A crashed in-progress claim is reclaimed after two minutes
and late results are fenced by a per-attempt token. Provider failure does not
change Match state. The durable guarantee covers database ownership/state; an
ambiguous provider acceptance followed by process failure can still lead to a
best-effort retry and possible duplicate push.

On logout, mobile persists the current device ID as a per-User pending
revocation before calling the API. Successful or terminal not-found handling
clears it; transient failure leaves it for the next authenticated session of
that same User and never blocks Firebase sign-out. Account B never retries
account A's pending revocation. Registering the same physical push token for B
uses the server's unique token upsert to transfer ownership safely.

Native Expo builds require the `expo-notifications` plugin already declared in
`apps/mobile/app.json`, a real device, and `EXPO_PUBLIC_EAS_PROJECT_ID`. Expo Go
and web do not provide production push registration. Configure Firebase Admin
credentials for FCM and, when required, `EXPO_PUSH_ACCESS_TOKEN` only in the API
environment. A successful scheduler tick logs counts for created Matches and
delivered reminders; migration status plus `MatchReminderDelivery` rows provide
the durable operational record.

### Fresh installation bootstrap order

Starting from migrated empty development and test databases:

1. Run `pnpm build` and
   `pnpm --filter @teamizer/api sport:bootstrap`; retain the printed Sport ID.
2. Provision the first Firebase account out of band, sign in, and complete
   normal Teamizer onboarding. This creates its regular Player and PLAYER User.
3. Run `pnpm --filter @teamizer/api admin:provision -- --auth-provider-id
<firebase-uid>` for that onboarded identity.
4. Authenticate as that active ADMIN and call `PUT /admin/schedule` with the
   bootstrapped Sport ID.
5. Let the enabled worker tick, or call
   `POST /admin/schedule/generate-matches`, to create the next OPEN Match.

None of these bootstrap commands creates Firebase accounts, Schedules, Matches,
Users, or Players implicitly.

## Development

Run both development servers:

```bash
pnpm dev
```

Or run one application:

```bash
pnpm --filter @teamizer/api dev
pnpm --filter @teamizer/mobile dev
```

The API listens on `http://localhost:3000` by default. The Expo CLI prints the
native and web launch options for the mobile shell.

## Cloud Run TEST container

The repository-root `Dockerfile` builds a production image containing only the
compiled NestJS API, its production dependencies, the generated Prisma Client,
the Prisma schema/migrations, and the compiled `@teamizer/algorithm` workspace
dependency. It uses the repository's Node 22 line, pinned pnpm 8.15.9, and
`pnpm-lock.yaml`. The dependency install is filtered to the workspace root, the
API, and the API's workspace dependencies; it does not build or copy the mobile
application.

The production command is `node dist/main.js` (equivalently, after a local
build, `pnpm --filter @teamizer/api start`). The image defaults `PORT` to 8080,
while Cloud Run may provide its own value. Nest reads `process.env.PORT` and
binds to `0.0.0.0`. The process connects Prisma before listening, and public
`GET /health` remains the database-aware readiness endpoint.

The image does not copy `.env` files or Firebase credential JSON. It does not
run migrations in its entrypoint. Apply migrations as an explicit release step
from an authorized environment that can reach the TEST database, before
rolling out a revision:

```bash
DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @teamizer/api prisma:migrate:deploy
```

### Local container verification

Start the existing development PostgreSQL service and apply its migrations:

```bash
docker compose up -d postgres
pnpm prisma:migrate:deploy
```

Build from the repository root:

```bash
docker build --tag teamizer-api:cloud-run-test .
```

Run the compiled container against the Compose database. The example secrets
are intentionally local-only values; do not reuse them in Cloud Run:

```bash
docker run --rm --name teamizer-api-cloud-run-test \
  --add-host=host.docker.internal:host-gateway \
  --publish 8080:8080 \
  --env NODE_ENV=production \
  --env PORT=8080 \
  --env 'DATABASE_URL=postgresql://teamizer:teamizer@host.docker.internal:5432/teamizer?schema=public' \
  --env FIREBASE_PROJECT_ID=replace-with-firebase-project-id \
  --env PROPOSAL_RECEIPT_SECRET=local-proposal-receipt-secret-000000001 \
  --env AVATAR_URL_SECRET=local-avatar-url-secret-0000000000001 \
  --env SCHEDULER_ENABLED=false \
  --env AVATAR_STORAGE_DIRECTORY=/tmp/teamizer-avatars \
  --env AVATAR_PUBLIC_BASE_URL=http://localhost:8080 \
  teamizer-api:cloud-run-test
```

In another shell, verify readiness:

```bash
curl --fail --show-error http://localhost:8080/health
```

The expected response is `{"status":"ok"}`. Docker Desktop resolves
`host.docker.internal` directly; `--add-host` provides the equivalent mapping
on Docker Engine versions that support `host-gateway`.

### Cloud Run configuration

Set these non-secret environment variables on the TEST service:

- `NODE_ENV=production`
- `FIREBASE_PROJECT_ID=<Firebase project ID>`
- `SCHEDULER_ENABLED=false`
- `AVATAR_STORAGE_DIRECTORY=/tmp/teamizer-avatars`
- `AVATAR_PUBLIC_BASE_URL=<public HTTPS origin of the TEST API>`

`PORT` is supplied by Cloud Run and does not need to be configured. The
existing defaults remain available for `SCHEDULER_TICK_INTERVAL_MS`,
`PUSH_PROVIDER_TIMEOUT_MS`, `AVATAR_MAX_UPLOAD_BYTES`, and
`AVATAR_URL_TTL_SECONDS`.

Provide these through Secret Manager as runtime environment variables:

- `DATABASE_URL`
- `PROPOSAL_RECEIPT_SECRET`
- `AVATAR_URL_SECRET`
- `EXPO_PUSH_ACCESS_TOKEN` only when authenticated Expo push delivery is used

For Cloud SQL over its Unix socket, store the complete Prisma URL in the
`DATABASE_URL` secret, for example
`postgresql://USER:PASSWORD@localhost/DB?host=/cloudsql/PROJECT:REGION:INSTANCE&schema=public`.
Percent-encode credential characters that are reserved in URLs.

Firebase Admin continues to use Application Default Credentials. Do not set
`GOOGLE_APPLICATION_CREDENTIALS` on Cloud Run and do not mount a service-account
key. Attach a dedicated runtime service account with Cloud SQL Client, access
to the referenced Secret Manager secrets, and permission to read Firebase
Authentication users (for example Firebase Authentication Admin). Token
verification and guest conversion then use that workload identity.

The following is the recommended build-and-deploy template. Create the
Artifact Registry repository and Secret Manager secrets first, replace every
placeholder, and apply migrations separately as described above. This command
is documentation only; it must not be run as part of application startup:

```bash
export PROJECT_ID='replace-with-gcp-project-id'
export REGION='europe-west1'
export ARTIFACT_REPOSITORY='teamizer'
export IMAGE_TAG='test-001'
export FIREBASE_PROJECT_ID='replace-with-firebase-project-id'
export CLOUD_SQL_CONNECTION_NAME='PROJECT:REGION:INSTANCE'
export RUNTIME_SERVICE_ACCOUNT='teamizer-api-test@PROJECT.iam.gserviceaccount.com'
export API_ORIGIN='https://replace-with-test-api-origin'
export IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/teamizer-api:${IMAGE_TAG}"

gcloud builds submit \
  --project="$PROJECT_ID" \
  --tag="$IMAGE_URI" \
  .

gcloud run deploy teamizer-api-test \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --platform=managed \
  --image="$IMAGE_URI" \
  --service-account="$RUNTIME_SERVICE_ACCOUNT" \
  --allow-unauthenticated \
  --port=8080 \
  --min=0 \
  --max=1 \
  --set-cloudsql-instances="$CLOUD_SQL_CONNECTION_NAME" \
  --set-env-vars="NODE_ENV=production,FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID},SCHEDULER_ENABLED=false,AVATAR_STORAGE_DIRECTORY=/tmp/teamizer-avatars,AVATAR_PUBLIC_BASE_URL=${API_ORIGIN}" \
  --set-secrets="DATABASE_URL=teamizer-test-database-url:latest,PROPOSAL_RECEIPT_SECRET=teamizer-test-proposal-receipt-secret:latest,AVATAR_URL_SECRET=teamizer-test-avatar-url-secret:latest"
```

`--allow-unauthenticated` permits the mobile client and public health probe to
reach Cloud Run; the API's existing Firebase bearer-token authorization still
protects every non-public API route. `--max=1` limits inconsistent avatar reads
during the temporary TEST phase but does not make local files durable.

With `SCHEDULER_ENABLED=false`, scale-to-zero is safe for API traffic but no
background Match materialization or reminder delivery occurs. An active ADMIN
can manually materialize the next configured Match with authenticated
`POST /admin/schedule/generate-matches`; that endpoint does not dispatch
reminders. Later Cloud Scheduler work needs a dedicated Cloud Run IAM/OIDC
protected endpoint or job that invokes both the existing due-materialization
and reminder services. The current Firebase-user ADMIN endpoint is not a Cloud
Scheduler workload-authentication boundary.

The current `AvatarStorage` binding is `LocalAvatarStorage`. `/tmp` keeps the
container writable for a temporary TEST deployment, but uploaded avatars are
lost on instance restart or replacement and cannot be shared across replicas.
The smallest production follow-up is a Google Cloud Storage implementation of
the existing `AvatarStorage` interface plus configuration-based provider
binding; the Player-facing API and database-owned storage keys need not change.

### Native development builds

The Match-management date and time controls use the native
`@react-native-community/datetimepicker` module. After installing or changing a
native dependency, Metro reload is not sufficient: the development app on the
device must be rebuilt. For a local iOS device build, install the declared pods
and rebuild the app:

```bash
pnpm install
cd apps/mobile/ios
pod install
cd ../../..
pnpm --filter @teamizer/mobile exec expo run:ios --device
```

For a connected Android device or emulator:

```bash
pnpm install
pnpm --filter @teamizer/mobile exec expo run:android --device
```

The checked Expo configuration declares the date/time picker plugin and New
Architecture support. A previously installed development binary that predates
the picker dependency must be replaced by one of these rebuilt binaries.

### Health and readiness

The API verifies its Prisma/PostgreSQL connection before it begins listening.
Public `GET /health` is a readiness check: it runs a lightweight PostgreSQL
probe and returns `200 {"status":"ok"}` only while persistence-backed requests
can be served. It returns a sanitized `503` if the database becomes unavailable;
credentials and database details are never included in the response.

Use process or TCP supervision as the lightweight liveness signal. Deployment
traffic routing should use `GET /health` so a running Nest process is not
mistaken for a ready Teamizer API.

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm prisma:validate
pnpm prisma:generate
```

When `TEST_DATABASE_URL` is present, `pnpm test` also runs PostgreSQL-specific
constraint and uniqueness tests. Apply migrations to that database first as
shown above. Without `TEST_DATABASE_URL`, those focused integration tests are
reported as skipped while database-independent tests still run.

Validate migration state against the development database:

```bash
pnpm prisma:migrate:deploy
pnpm --filter @teamizer/api exec prisma migrate status --schema prisma/schema.prisma
```

## Workspace layout

```text
apps/
  api/        NestJS API and Prisma persistence foundation
  mobile/     Expo and Expo Router application shell
packages/
  algorithm/  Framework-independent balancing package boundary
  shared/     Shared contracts package boundary
  ui/         Shared React Native UI package boundary
  config/     Shared configuration package boundary
docs/         Approved product and architecture specification
```

Persistent guest creation is available only through the approved atomic
`POST /matches/:matchId/participants` flow. No standalone guest endpoint exists.
Statistics are derived from immutable FINISHED Match data; no aggregate table is
persisted. Avatar binary data is stored outside PostgreSQL and remains attached
to the permanent Player identity through guest conversion and deactivation.
Live score synchronization and in-match team changes are not implemented.
Recurring Match creation and attendance reminders reuse the existing Match/Home
flow; they do not automatically generate teams or start a Match.
