# Teamizer — UI / UX

## Product character

Teamizer uses a modern, restrained visual language with a practical sports
character. The interface is friendly and lightweight rather than aggressive or
decorative. Strong hierarchy, direct language, and comfortable controls take
priority over dense dashboards, novelty graphics, gradients, or cards nested
inside cards.

The implemented authentication, onboarding, home, Match, team, and scoring
screens form one visual baseline. New mobile screens must reuse the semantic
tokens and primitives in `packages/ui` plus the safe-area page layout in
`apps/mobile/src/ui/app-screen.tsx`. A screen must not introduce a competing
palette, spacing scale, button style, or form language.

## Semantic visual system

### Color

The application supports System, Light, and Dark appearance. System is the
default and follows the current operating-system color scheme. The explicit
choice is stored locally and does not require a Teamizer account or network
request. `PreferencesProvider` resolves the preference and supplies the active
`ThemeProvider` to the whole mobile tree.

Colors are named by purpose in `packages/ui/src/theme.ts`; shared primitives and
screens read the active theme through `useTheme()` rather than repeating color
values or branching on dark mode.

| Role | Semantic tokens |
|---|---|
| App canvas and hierarchy | `background`, `surface`, `surfaceSubtle`, `surfaceStrong` |
| Text | `textPrimary`, `textSecondary`, `textSubtle` |
| Brand/action | `accent`, `accentPressed`, `accentSoft`, `accentContrast`, `focus` |
| Boundaries | `border`, `borderStrong` |
| Feedback | `danger`, `success`, `warning`, `info` and matching `*Surface` tokens |
| Team distinction | `teamAText`/`teamASurface`, `teamBText`/`teamBSurface` |
| Modal treatment | `overlay` |

Team colors are reserved for identifying sides in team and scoring contexts.
They must always be accompanied by the side name or another semantic label;
color alone never communicates team membership or status.

### Typography

The native system font is used for reliability and platform familiarity. The
shared `AppText` variants are:

- `display`: high-impact screen or score-adjacent statement;
- `title`: primary page title;
- `heading`: section/card heading;
- `body` and `bodyStrong`: normal content and emphasized actions/data;
- `label`: form and row labels;
- `caption`: supporting copy;
- `eyebrow`: short uppercase context/status labels;
- `score`: instant-read score display.

Body copy remains at 16 px with a 23 px line height. Important text is made
larger or heavier, not communicated through color alone.

### Spacing, shape, and elevation

- Spacing uses the shared 4, 8, 12, 16, 20, 24, 32, 40, and 48 scale.
- Corner radii are 10, 14, and 20, with a pill value only for compact status.
- Interactive controls have a minimum 48 pt target; primary buttons are 52 pt
  high.
- Shadows are quiet and reserved for a genuinely raised primary surface.
- Borders separate rows and fields but do not box every piece of content.

## Shared primitives

`packages/ui` implements the reusable cross-screen layer:

- `AppText` for the typography hierarchy and semantic text tones;
- `BrandLockup` for the restrained pitch/team mark and wordmark;
- `Button` with primary, secondary, ghost, and danger hierarchy plus busy and
  disabled states;
- `TextField` with visible label, focus state, supporting text, and inline error;
- `FeedbackBanner` for error, success, information, and warning feedback with
  both symbol and text;
- `NumberStepper` for accessible bounded numeric input with 48 pt controls;
- `StatusPill` for concise text-and-dot status presentation;
- `Avatar` for a square-cropped Player image at shared small, medium, large,
  and hero sizes, with deterministic one/two-letter initials fallback;
- `Surface` for one-level card/list grouping;
- `ThemeProvider`/`useTheme` for active semantic colors;
- semantic light/dark themes, `typography`, `spacing`, `radii`, `layout`, and
  `shadows`.

`AppScreen` owns the app canvas, safe-area insets, phone/tablet page padding,
scroll behavior, and a 760 px readable maximum width. Screens use these pieces
directly and add only layout styles specific to their content.

## Page and navigation conventions

- Phone is the primary layout. Content uses 20 pt side padding and remains easy
  to operate one-handed.
- At 700 px and wider, side padding increases to 32 pt while content is capped
  instead of stretched. Forms remain capped at 460 px.
- Every route is safe-area-aware on all four edges and supports vertical
  scrolling where content or text scaling can exceed the viewport.
- Authenticated routes use one shared Expo Router stack header. Home places the
  compact Teamizer mark/wordmark at the leading edge and the current Player
  avatar at the trailing edge, with no Back action. Inner routes place an
  accessible Back action at the leading edge, a concise route title, and the
  same avatar/account trigger at the trailing edge. Platform back gestures and
  Android system Back remain available.
- The stack is intentionally shallow: Home leads to Match flows, ranking/Player,
  Profile, Settings, and ADMIN-only Administration. No bottom-tab system or
  separate tablet navigation exists.
- Breadcrumb chips are not navigation. The `TEAMIZER` Home chip and repeated
  in-page brand/back rows are absent. Pills are reserved for meaningful domain
  state or identity context.
- A page has one obvious primary action. Secondary actions use outlined or ghost
  treatment and destructive actions are visually separated.
- Navigation never exposes protected content while Firebase restoration or
  Teamizer identity checks are running.

### Account menu and Settings

The header avatar opens a compact, tablet-bounded modal account sheet. It uses
the existing Player avatar or deterministic initials, display name, and useful
role/status context without showing ratings or Firebase identifiers. My
profile, Settings, and ADMIN-only Administration are normal navigation actions;
Sign out is visually separated as the destructive action. Sign out does not
occupy permanent Home header space.

Settings is an authenticated route. Clear choice buttons offer System, Light,
and Dark appearance plus Čeština and English language. The selected option
remains explicit. Both choices persist through AsyncStorage. On the first run,
language is inferred from the system locale when it is Czech and otherwise
falls back to English.

### Localization

Mobile-facing copy lives in feature/domain-keyed i18next resources under
`apps/mobile/src/i18n`. Supported languages are Czech (`cs`) and English (`en`).
Components use translation keys instead of scattered bilingual conditionals.
Stable API/domain error codes map to localized messages at the UI boundary;
technical server messages and internal enum values are not presented as user
copy. Date display uses the selected locale while Schedule payloads and the
Europe/Prague time model remain unchanged. Native iOS camera/photo permission
descriptions and the Android reminder-channel name also provide Czech and
English copy through their platform-appropriate resources.

## Implemented screen patterns

### Sign-in

Sign-in is a single focused column with the brand, a clear benefit statement,
labelled email/password fields, semantic error feedback, and one primary
action. It does not advertise unimplemented account creation, password reset,
or additional authentication providers.

### Onboarding

Onboarding explains why the name and initial ratings are required. Name uses a
normal labelled text field. The five 1–10 values use bounded steppers with a
neutral default of five, avoiding a dense administrative grid and avoiding
numeric-keyboard dismissal problems. Privacy guidance states that ratings are
balancing inputs and are not part of the normal player profile. Role selection
is not present.

### Authenticated home

The home is intentionally focused: compact branded header, an authoritative
`IN_PROGRESS` Match before any future OPEN Match, caller-relative attendance,
one compact player identity surface, semantic account/player status, and a
compact route into statistics. The primary Match remains prominent while
routine explanatory copy and vertical gaps are reduced. Active Matches remain
present regardless of their scheduled time. Overdue OPEN Matches are not
promoted as upcoming and are not auto-cancelled. Loading, empty, and retry
states use the same shared primitives.

### Profile and Player administration

The authenticated Profile route presents the permanent Player identity,
avatar, ACTIVE/inactive state, editable display name, and a compact public
finished-Match summary. A normal Player never sees balancing attributes. Photo
actions use explicit Choose, Take, and Remove controls; the avatar itself is not
a hidden or undersized action.

The ADMIN Player list is a phone-first vertical identity list with avatar,
regular/guest account-linkage language, ACTIVE/inactive status, lightweight
name-prefix search, and simple status filters. Player detail keeps public name
editing, the five ADMIN-only bounded rating steppers, avatar management, guest
invitation, and status management in distinct sections. For a Guest, the
primary account action is a localized email field plus **Invite as user**.
Loading prevents duplicate taps; invalid email is inline; success and stable API
failures use one banner. **Advanced options** reveals the existing Firebase UID
link as a secondary action. Neither account control is rendered for a regular
Player or non-ADMIN. Deactivation is
visually separated, requires confirmation, and explains that Player ID and
history remain; there is no hard-delete affordance.

Avatar-bearing identity rows always retain the textual Player name and guest or
status label where relevant. The shared initials fallback is deterministic, so
missing or failed images preserve both identification and layout.

### Statistics and Player history

The ranking is a phone-first vertical list rather than a compressed data table.
Each row is one comfortable touch target with an explicit rank, Player identity,
guest label when applicable, and the approved scannable metrics. Server order is
preserved; the mobile app formats but never recalculates authoritative rank.

Player detail uses the same stack header, status pills, surfaces, and number
hierarchy as the Match flow. A compact wrapping metric grid adapts from phone to
tablet without fixed columns. Zero-Match win rate and goals per Match are shown
as `N/A`, not zero.

Finished-Match history lives within Player detail and uses load-more pagination.
Every result shows text-labelled outcome, final score, both final teams,
participating Players, and aggregate goal totals. Team lists stack on phone and
form two columns from the 700 px tablet breakpoint. A secondary action opens the
existing full FINISHED Match presentation, avoiding a competing result route.
Ranking and history provide intentional loading, empty, error/retry, and success
states.

### Loading and recoverable errors

Session restoration and identity checks render a centered branded state with a
labelled activity indicator and explanatory text. Protected content is not
mounted underneath. Recoverable failures use an error banner plus explicit
retry and sign-out actions. Configuration failures use the same visual
language. Feedback does not rely on color alone.

## Forms and interaction

- Labels remain visible when a field has content; placeholder text is only an
  example.
- Email uses email keyboard/autocomplete, password uses secure entry, and name
  uses word capitalization with a 120-character limit.
- Validation appears next to the affected flow and preserves entered values.
- Busy actions retain their label, show progress, and become unavailable until
  complete.
- Pressed, focus, disabled, and error states are visually distinct.
- Frequently used controls must remain at least 48 pt and use concise verbs.

## Accessibility

- Text and action colors use high-contrast foreground/background pairs.
- Headers use semantic accessibility roles.
- Buttons expose disabled/busy state; stepper controls have explicit increase
  and decrease labels and announce the current value.
- Back and account controls have explicit accessible labels and at least 48 pt
  hit targets. The active Settings choice exposes selected state.
- Feedback uses live regions and visible symbols plus text.
- Status always includes a textual label, never just a colored dot.
- Layouts scroll rather than clip under larger text, small screens, or landscape
  height constraints.
- Optional future photos require a textual name and initials fallback; an image
  is never the only player identifier.

## Implemented Match flows

The implemented core Match flow follows these interaction requirements:

- Registration shows date/time, location, GOING, NOT_GOING, unanswered, guests,
  and one clear team-generation action while respecting authorization.
- Team proposals show two labelled sides, players, balance information,
  regenerate, manual adjustment, and a separated Start action. Regeneration
  replaces the current client proposal; there is no proposal history.
- An IN_PROGRESS Match shows immutable persisted teams and a primary `Start
  scoring` action. It never implies scorekeeper ownership or transfer.
- Scoring uses the `score` typography variant for instant readability. Team A
  and B use their semantic color pairs plus labels. A large Player row/card is
  the primary `+1` target, current Player goals are obvious, decrement is a
  smaller secondary control, and Finish Match is safely separated from goal
  entry. The shared medium Avatar sits inside the existing 80 pt row; the photo
  is never a separate required tap target. Local goal entry never displays
  network loading.
- Local persistence failure blocks scoring with explicit error feedback.
- Completion is confirmed as irreversible. A 409 completion conflict closes or
  discards the losing local result as defined by the concurrency design.
- Finished detail shows final teams, score, and aggregate player goals without
  attributing individual goals to a team. Rankings follow `PRODUCT.md`.

Every major screen supplies intentional loading, empty, error, and success
states using the established primitives. Exceptions such as instant local goal
entry follow the approved product behavior rather than introducing network
feedback.

## Match reminder entry

Notification permission is requested at most once after authentication and is
never required for onboarding or normal app use. A denied permission produces
no blocking UI or repeated prompt. Match reminder taps validate the Match ID and
open the existing protected Match route; session routing remains the access
boundary. Automatically materialized Matches otherwise appear through the
existing Home/upcoming-Match presentation.

## ADMIN Match and Schedule management

Administration is available to an ADMIN from the account menu and is not
duplicated as a prominent Home card. Its protected landing screen separates
Manage Matches and Manage Players. The Match-management screen then separates
the two approved setup choices: a one-off Match and the singleton recurring
Schedule. Route-level redirects keep the same screens out of normal PLAYER
navigation; API authorization remains authoritative.

One-off creation is a short form with a supported Sport selector, native
date/time controls, Prague-time guidance, and an optional location. The mobile
client submits calendar components without applying UTC offsets; the API owns
timezone and DST validation. The iOS wheel follows the active appearance and
uses Cancel/Use actions; Android uses its native date/time dialogs, and web uses
browser date/time inputs. A new form starts with tomorrow and
18:00 visibly selected, while both values remain freely editable. Submission is
single-flight, and success refreshes Home's upcoming query before opening the
normal Match detail.

Native date/time controls are supplied by the compiled
`@react-native-community/datetimepicker` module declared in the Expo
configuration. Adding the JavaScript package alone is not a fallback: iOS pods
and the native iOS/Android development application must be rebuilt, because a
Metro reload cannot add the component to an already installed binary.

The recurring editor uses human weekday and Sport choices, a native time
control, a visible enabled switch, and reminders expressed in minutes, hours,
or days. It converts those reminders to the existing minute DTO without
changing scheduler semantics. The screen explicitly explains that an already
materialized Match keeps its current time, location, attendance, and lifecycle
state. Manual generation invokes the existing idempotent Schedule operation;
there is no calendar, bulk rescheduling, or multi-rule UI.
