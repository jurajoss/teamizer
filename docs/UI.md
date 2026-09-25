# Teamizer — UI / UX

## Product character

Teamizer uses a modern, restrained visual language with a practical sports
character. The interface is friendly and lightweight rather than aggressive or
decorative. Strong hierarchy, direct language, and comfortable controls take
priority over dense dashboards, novelty graphics, decorative gradients, or
cards nested inside cards.

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
| App canvas and hierarchy | `background`, `surface`, `surfaceElevated`, `surfaceSubtle`, `surfaceStrong` |
| Text | `textPrimary`, `textSecondary`, `textSubtle`, `textDisabled` |
| Brand/action | `accent`, `accentPressed`, `accentSoft`, `accentContrast`, `focus` |
| Boundaries | `border`, `borderStrong`, `borderDisabled` |
| Feedback/status | `danger`, `success`, `warning`, `info` with matching `*Surface` and `*Border` tokens |
| Unavailable controls | `disabledSurface`, `textDisabled`, `borderDisabled` |
| Team distinction | `teamAText`/`teamASurface`/`teamABorder`, `teamBText`/`teamBSurface`/`teamBBorder` |
| Modal treatment | `overlay` |

Team colors are reserved for identifying sides in team and scoring contexts.
They must always be accompanied by the side name or another semantic label;
color alone never communicates team membership or status. Team A uses the
turquoise/green family and Team B uses the blue family in both themes.
`teamSurfaceTints` derives restrained left-to-right surface depth from those
same semantic families. The shared `TeamTintBackground` renders the tint behind
content while its parent continues to own the normal surface, border, radius,
and layout. Its direction is selectable for paired components such as the
scoreboard, while Player-list tiles retain their common left-originating visual
language.

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
- `metric`: compact high-emphasis numeric data such as an individual goal count;
- `scoreCompact`: a live score that must remain prominent in a dense workflow;
- `score`: instant-read score display.

Body copy remains at 16 px with a 23 px line height. Important text is made
larger or heavier, not communicated through color alone.

### Spacing, shape, and elevation

- Spacing uses the shared 4, 8, 12, 16, 20, 24, 32, 40, and 48 scale.
- Corner radii are 10, 14, and 20, with a pill value only for compact status.
- `sizes` owns the 48 pt minimum touch target, 36 pt compact visual control,
  52 pt control height, common icon sizes, and the four Avatar dimensions.
- `borderWidths` distinguishes ordinary and emphasized boundaries.
- `shadows.raised` is reserved for a genuinely raised object;
  `shadows.floating` is for temporary floating UI such as a future sidebar
  overlay or menu.
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
- `Card` only when content is one bounded domain object, such as a Match or
  Player summary;
- `Divider` for quiet row/section separation; ordinary sections are plain
  layout with typography and whitespace;
- `ThemeProvider`/`useTheme` for active semantic colors;
- `TeamTintBackground` for subtle semantic Team A/Team B surface depth without
  affecting the parent component's geometry or interaction;
- semantic light/dark themes, `typography`, `spacing`, `sizes`, `radii`,
  `borderWidths`, `layout`, and `shadows`.

`AppScreen` owns the app canvas, content safe-area insets, phone/tablet page
padding, scroll behavior, optional keyboard avoidance, and a content-width intent:
`readable` (760 px maximum), `working` (1120 px maximum), or `full`. Existing
screens default to `readable`. The authenticated shell declares the safe-area
edges already occupied by its bottom navigation or sidebar, preventing doubled
insets without making feature screens responsive-shell aware. Screens use these
pieces directly and add only layout styles specific to their content.

`Surface` remains temporarily available only because the current screens use
its `default`/`muted`/`brand` tones and padding API extensively. Do not add new
uses. Each screen-migration phase replaces its `Surface` uses with plain
sections, `Divider`, or `Card`; the phase that migrates the final consumer must
delete `Surface`.

The current `Button` default remains full-width because active screens rely on
it. Migrated screens should choose `fullWidth` deliberately; the final screen
migration must make the remaining intent explicit before deciding whether the
default can become intrinsic width. No compatibility-only Button variant is
retained: existing `danger` call sites now use the semantic `destructive`
variant.

## Responsive composition

`resolveLayoutMode` defines exactly two modes: `phone` below 700 px and
`tablet` at 700 px or wider. Components consume the same decision through
`useResponsiveLayout`; they must not introduce local `Dimensions.get()` or raw
breakpoint checks. `AppScreen` uses that mode for page padding.

Phone and tablet render the same feature content and behavior. Only composition
changes: a phone normally stacks content, while tablet may place the same
sections in two columns or choose the wider `working` content width. The
authenticated navigation shell reserves tablet sidebar space outside
`AppScreen`; feature screens do not calculate or subtract that width.

## Icons

Teamizer owns its application icon vocabulary through `AppIcon` and the small
semantic mapping in `apps/mobile/src/ui/icons`. It uses the Expo-provided
`expo-symbols` runtime: SF Symbols on iOS and centrally mapped Material Symbols
on Android/web. Feature and navigation code asks for Teamizer names such as
`matches`, `account`, or `back`; it does not import platform icon names or icon
families directly. Icons supplement localized labels and never replace the text
of a primary destination. Extend this mapping only for a concrete product need;
do not add a second icon package or scatter raw glyphs through new UI.

## Page and navigation conventions

- Phone is the primary layout. Content uses 20 pt side padding and remains easy
  to operate one-handed.
- At the shared tablet mode (700 px and wider), side padding increases to 32 pt
  while content is capped instead of stretched. Forms remain capped at 460 px.
- Every route is safe-area-aware on all four edges and supports vertical
  scrolling where content or text scaling can exceed the viewport.
- Authenticated routes use one shared Expo Router stack and four canonical
  primary roots: `/home`, `/matches`, `/players`, and `/statistics`. On phone,
  the shell renders these as persistent bottom navigation. At the shared 700 px
  tablet breakpoint, the same destination definitions become a persistent,
  intentionally composed left sidebar. Routes, screens, authorization, and
  active-state semantics are shared; there are no phone/tablet route copies.
- Primary roots have a centered localized title, no Back action, and the
  current Player avatar at the trailing edge. Nested routes such as
  `/matches/:matchId` and `/players/:playerId` keep an accessible Back action,
  a concise native-centered title, and the account trigger. Native stack
  centering avoids arbitrary padding and preserves Android alignment. Platform
  gestures and Android system Back remain available.
- Primary-destination changes use Expo Router pop-to/replace semantics, so they
  do not build synthetic Back history. Detail screens use normal stack pushes;
  direct nested entry has a canonical primary-area Back fallback.
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
Sign out is visually separated as the destructive action. These destinations
remain outside primary bottom/sidebar navigation, and sign out does not occupy
permanent header space.

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
- Active scoring is the first fully migrated Phase 4 feature screen. The shared
  native header is its only Match identity; no date/location subtitle consumes
  the live-scoring canvas. The compact semantic Team A/Team B score is the first
  content child and remains sticky. Team A is always the left grid column and
  Team B the right;
  roster position produces paired rows for every supported team size without a
  player-count-specific layout branch. A normal phone tile has an 84 pt minimum
  and resolves to roughly 87 pt for a one-line name; a two-line name grows the
  individual tile naturally. Tablet uses the same component in a wider inline
  composition.
- Each bounded Player tile has a semantic team-colored left accent and is the
  entire `+1` target, with immediate pressed feedback. The only nested action is
  a 48 pt minus target around a 36 pt visible circle; it stops propagation,
  disables at zero, and never triggers the tile action. A 44 pt Avatar sits
  beside a flexible name/details column. The compact `metric` goal count and
  minus form the lower row, realistic names may wrap to two lines, and the
  controls cannot overlap the name. Shared Avatar fallback behavior remains the
  identity fallback. Player tiles and score panels use the same subdued
  semantic team-border roles; borders remain quieter than accent strips and
  goal/score text. An uneven roster keeps an invisible, noninteractive layout
  slot opposite each unmatched Player so the paired columns stay aligned.
  Local goal entry never displays network loading.
- Active scoring temporarily suppresses authenticated primary chrome through
  the shell visibility contract, so it has no phone bottom navigation or tablet
  sidebar and regains physical-edge safe areas. The native Match header and
  Back/direct-entry behavior remain shared. The completion action stays in
  scroll content, uses the shared `Button`, and retains the existing irreversible
  confirmation, pending retry, idempotency, and conflict behavior.
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
