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
- Authenticated routes use one shared Expo Router stack and three canonical
  primary roots: `/home`, `/matches`, and `/rankings`. On phone,
  the shell renders bottom navigation only on those exact roots. At the shared
  700 px tablet breakpoint, the same destination definitions become an
  intentionally composed left sidebar, again only on the roots. Every nested
  route hides primary chrome and regains its physical bottom/left safe areas.
  Routes, screens, authorization, and active-state semantics are shared; there
  are no phone/tablet route copies.
- Primary roots use native-stack headers with no Back action, the current Player
  avatar at the leading edge, and an optional contextual trailing action.
  Home's native title is the `Teamizer` brand while its localized personalized
  greeting remains the first content block; its primary-navigation label stays
  localized as Home. Matches exposes the ADMIN-only Create Match action in the
  native trailing toolbar, and Rankings has no trailing action.
- Nested routes such as `/matches/:matchId`, `/players/:playerId`, and
  selected-Player history use the native platform Back item, a concise title,
  and permission-aware contextual actions only. They never repeat the global
  account avatar. Native iOS titles are centered while Android follows its
  leading-aligned platform convention. Native swipe/system Back behavior
  remains available.
- Native-stack appearance follows Teamizer's resolved light/dark preference,
  including when it differs from the system preference. On iOS, contextual
  header actions are plain native toolbar items, allowing the operating system
  to own their foreground color, background, grouping, and interaction
  treatment; the custom root account avatar opts out of shared iOS 26
  backgrounds. Android hosts restrained transparent Teamizer icon actions with
  the active theme's ordinary foreground color in its native stack toolbar.
  Direct nested entry receives a focused custom fallback only when no native
  Back history exists.
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

The header avatar opens a compact, content-sized, tablet-bounded modal account
sheet. It uses the existing Player avatar or deterministic initials and display
name without exposing ratings, role/status badges, or Firebase identifiers. My
profile, Settings, and ADMIN-only Administration are compact navigation rows.
My profile opens the authenticated Player's existing statistics/profile route
directly from the session Player ID; it never resolves identity through
Rankings. Repeated entry uses navigation-to-existing semantics rather than
stacking duplicate profile screens;
Sign out is visually separated as the destructive row. These destinations
remain outside primary bottom/sidebar navigation, and sign out does not occupy
permanent header space.

Settings is an authenticated route with two compact cards. Shared segmented
controls offer System, Light, and Dark appearance plus Čeština and English
language without redundant introduction or helper copy. The selected option
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

Home is the first general dashboard composition. Its native root header keeps
the account avatar as the persistent Profile, Settings, Administration (ADMIN),
and sign-out entry point; the personalized greeting remains ordinary content.
The authoritative `IN_PROGRESS` Match remains ahead of OPEN Matches. All OPEN
Matches remain eligible regardless of scheduled time, with the earliest
scheduled one selected deterministically; overdue OPEN Matches are neither
hidden nor auto-transitioned.
The Match summary combines the existing upcoming response with Match detail for
real attendee avatars/counts, and reuses the established attendance endpoints.
Unanswered attendance exposes Going/Not going choices; a saved decision becomes
a compact bordered state-and-Edit row while registration remains open. Match
Detail reuses the same shared attendance control and state presentation.

The dashboard shows only the current Player's existing statistics summary
(win rate, goals per Match, Matches) and aggregate goals from their newest ten
finished-Match history rows. Goal history is reordered chronologically for a
semantic-token line/area chart and is never padded with fabricated Matches.
Phone stacks the same sections; tablet composes the Match and dashboard as two
bounded columns. Home does not infer live server scoring. Opening its
authoritative in-progress Match enters the existing device-local scoring
workflow directly through the canonical Match route. Loading, empty, and retry
states use the same shared primitives in both themes.

### Matches index

The Matches primary root is a dense, scannable list rather than a dashboard.
One segmented control switches between All, Upcoming, and Finished without
changing routes. All groups the same reusable compact rows under explicit
Upcoming and Finished headings. Rows show a Prague-local weekday/date block,
real participant avatars with bounded `+N` overflow, and a trailing detail
chevron; repeated time and location stay in Match Detail.

Upcoming rows show a compact Going or Not going state only after the current
Player has answered. Finished rows keep the score colon on one fixed axis,
independent of avatar overflow or score digits. A fixed compact indicator before
the score represents the personal persisted result: green up triangle for Win,
red down triangle for Loss, neutral right triangle for Draw, and a neutral dash
for Did not play. The row's localized accessibility label communicates the
semantic result without relying on glyph direction or color. Phone and tablet
share the same components and filters, while the readable content cap prevents
rows from stretching across the full tablet canvas. The same ordered,
de-duplicated participants from both persisted teams feed the shared avatar
stack on Matches, Player statistics, and complete Player history; the shared
responsive visible limit determines whether the stack renders `+N`. The shared root header
retains account-menu behavior and adds Match creation only for ADMIN users.

### Profile and Player administration

The **Player Profile** screen (implemented by the existing Player Statistics
route and data model) is the canonical Player profile. Home's My statistics and
My goals headers and the account menu's My profile row open the authenticated
Player directly from session identity, while Rankings opens the selected
Player. The shared nested route retains the primary destination that launched
it. Its native edit action shares the Matches create-action treatment, sits at
the trailing edge of the native navigation header, and is visible only to the
owner or an ADMIN. As on every nested route, the global account avatar is not
repeated there.

One shared edit route handles self and administrative editing. Both modes reuse
the existing display-name and avatar upload/removal flows, disable Save changes
until identity fields are dirty, warn before discarding unsaved form changes,
and invalidate statistics, profile, Match, and current-session identity caches
after mutation. A normal Player can edit only their own public name and photo
and never receives balancing attributes or account-management data. Photo
actions remain explicit Choose, Take, and Remove controls; the avatar itself is
not a hidden or undersized action.

The ADMIN Player list is a phone-first vertical identity list with avatar,
regular/guest account-linkage language, ACTIVE/inactive status, lightweight
name-prefix search, and simple status filters. Its rows open the same shared
edit route, which adds the five ADMIN-only bounded rating steppers, avatar
management, guest invitation, and status management. For an unlinked Guest, the
primary account action is a localized email field plus **Invite as user**.
Loading prevents duplicate taps; invalid email is inline; success and stable API
failures use one banner. **Advanced options** reveals the existing Firebase UID
link as a secondary action. A pending invitation shows its email and the
backend-supported resend action; account controls disappear once the Player is
linked. Neither account control is rendered for a regular Player or non-ADMIN.
Deactivation is
visually separated, requires confirmation, and explains that Player ID and
history remain; there is no hard-delete affordance.

Avatar-bearing identity rows always retain the textual Player name and guest or
status label where relevant. The shared initials fallback is deterministic, so
missing or failed images preserve both identification and layout.

### Rankings and Player history

The `/rankings` primary route is presented as **Rankings** / **Žebříčky**. A
three-part selector switches between win rate, goals per Match, and
participation (attendance percentage across all FINISHED Matches).
The client retrieves every ranking page before sorting, so the selected
criterion applies to the full active-Player population rather than only the
currently visible page. Persistent Guests remain in the same ranking.

The ranking is a phone-first vertical list rather than a compressed data
table. Each compact row is one comfortable touch target with a fixed rank area,
Player avatar and name, subtle Guest metadata, exactly one selected statistic,
and a trailing detail affordance. The leading three rows use small
gold/silver/bronze trophy silhouettes with the numeric rank centered inside;
remaining rows use plain ranks. Rank and statistic regions stay aligned as
values and names vary. Win rate uses one decimal where needed, goals per Match
uses two decimals, and participation displays the integer percentage with
played/total counts directly beneath it. The win-rate view uses the same
secondary row for the Player's win/draw/loss counts, with the result semantics
and colors shared by Player Statistics. When no FINISHED Matches exist its
percentage is a neutral dash while all three result counts remain visible at
zero; changing the selector recalculates the displayed order and top-three
treatment deterministically.

Every Rankings row opens the selected Player's statistics detail, regardless of
the active criterion; Home and My profile open the same screen for the current
Player without a Rankings request. The nested screen uses the native platform
title alignment, Back action, and only its permission-aware Edit action. Its
profile hero shows the selected Player identity and real finished-Match count.
A two-by-two card grid presents the existing win rate and W/D/L totals,
authoritative full-history attendance, combined total/per-Match goals, and
recent wins as a ratio plus a
chronological result bar from up to the five newest Player Matches. Recent wins
reuse the selected Player's existing finished-Match history response. Attendance
comes from the Player detail statistics summary, is not inferred on the client,
and does not introduce another API request.

The selected Player's existing history endpoint also drives a shared goal chart
for the latest ten finished Matches, ordered chronologically, and five newest
result rows. Those rows reuse the same visual component as the main Matches
list: compact date block, bounded team avatar stack, personal-result indicator,
fixed structured score, explicit personal goal count (including zero), and
chevron. A nonparticipant never receives a fabricated goal count. The entire
recent-Matches section header is one accessible chevron action that opens
the canonical `/matches` primary destination in its normal All view. The
dedicated `/players/:playerId/matches` cursor-paginated route remains available,
but is no longer this section's destination. Both history surfaces link to the
canonical finished Match detail and provide intentional loading, empty,
error/retry, and success states. There is no standalone Players primary
destination. Player statistics is entered from Home, the account menu, or
Rankings, while ADMIN Player management opens the shared editor directly.

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

- Pre-start Match Detail uses the shared native Match header, followed by real
  date/time/location, compact editable personal attendance, visible Going and
  Not-going groups, one Teams card, and a separate primary Start action. The
  Participants card is the same compact read-only summary for Players and
  ADMINs. Guest creation remains available there, while an ADMIN-only Edit
  participants action opens a dedicated searchable, cursor-paginated workflow
  with Going, Not-going, and Unanswered groups plus immediate attendance
  persistence. Existing persistent Guest Players participate in that workflow
  by Player ID. The current API supports Unanswered to Going/Not-going and
  Going/Not-going changes, but only a Player may remove their own registration;
  the ADMIN editor therefore truthfully disables returning another Player to
  Unanswered. Unanswered Players retain their domain state but are not rendered
  as a third group on Match Detail. Start remains a two-step transition: its
  amber information panel explains that attendance and teams will lock while
  scoring starts separately, followed by full-width Keep editing and Start
  match actions. The separate destructive Cancel match action remains below.
- Team proposals are created automatically for the current Going Players and
  live in a non-persisted, Match-keyed Zustand draft. The Teams card keeps both
  sides and the equal Regenerate/Edit text actions together for every active
  Player. Returning
  to the Match reuses the exact generated or manually adjusted draft. A
  participant-set change preserves the old proposal, shows an attendance-change
  warning, changes regeneration to Update teams, and disables Start.
- Edit teams is a dedicated two-column screen. A short hold activates dragging;
  cross-team Player drops swap atomically, while an odd roster exposes only a
  Player-tile-sized valid empty slot for moving the extra Player. Tap-select plus
  cross-team tap provides the same operation without relying on drag visuals.
  Editor changes remain temporary until Apply distribution. The editor refreshes
  a stale proposal receipt without applying or silently deleting the old draft.
- The canonical Match route maps OPEN to pre-match detail, IN_PROGRESS directly
  to scoring, FINISHED to immutable result detail, and CANCELLED to its existing
  read-only state. Home, Matches, notifications, and deep links all use this
  route. After confirmed Start succeeds, the authoritative IN_PROGRESS response
  enters scoring without another action; a failed Start remains on pre-match
  detail.
- Finished Match Detail reuses the pre-match detail header, Match information,
  and Teams presentation. One read-only result card centers large standalone
  Team A and Team B score numbers in their semantic colors around a colon,
  directly above the same two-column player tiles used before Start. Generic
  team labels and score-panel surfaces are omitted. Each player tile adds a
  secondary aggregate goal count below a single-line, ellipsized name; zero
  goals remain visible and tile heights stay aligned. The tile surface, border,
  avatar, spacing, and responsive geometry remain shared with the pre-match
  Teams card.
- Scoring initialization restores an existing valid local draft or durably
  writes a new 0:0 draft before score controls appear. Normal initialization,
  restoration, and local persistence are silent; only actionable persistence or
  completion warnings interrupt scoring. Corrupt/stale drafts, terminal-state
  cleanup, and first-completion-wins safeguards remain unchanged.
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
- All Match detail, editing, and scoring routes are nested and therefore have
  no phone bottom navigation or tablet sidebar. They regain physical-edge safe
  areas through the root-route shell policy. The native Match header and
  Back/direct-entry behavior remain shared across lifecycle states. The
  full-width completion action
  stays in scroll content and uses the shared `Button`. Its confirmation matches
  Start: an amber panel shows the dynamic final score above vertically stacked,
  full-width Continue match and Confirm result actions. Pending retry,
  idempotency, and conflict behavior remain unchanged.
- Local persistence failure blocks scoring with explicit error feedback.
- Completion is confirmed as irreversible. A 409 completion conflict closes or
  discards the losing local result as defined by the concurrency design.
- Finished detail shows the authoritative final teams, score, and aggregate
  player goal totals in its read-only result card. Rankings follow `PRODUCT.md`.

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
