# DataGOAT — Initial Web App Spec

**Jira**: https://concord-consortium.atlassian.net/browse/DGT-25
**Repo**: https://github.com/concord-consortium/datagoat
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

DataGOAT is a mobile-first PWA that helps student athletes track daily health metrics (hydration, sleep, mood, fatigue) and sport-specific performance outcomes (wins, points, assists), earn badges for consistency and healthy habits, and visualize trends over time. Built with React + Vite, Firebase (Firestore + Auth + Hosting), Tailwind CSS + DaisyUI, and Chart.js, the app supports offline use and is designed to help athletes see themselves as data scientists through the "#Sport is Science" lens.

## Project Owner Overview

DataGOAT ("Own Your Sports Data for Peak Performance") is an NSF-funded project (U Maryland, Concord Consortium, UNC) that bridges sports and STEM education. The core idea is legitimate peripheral participation — athletes develop data science skills by tracking and analyzing their own training data, making the abstract concrete through personal relevance.

Athletes choose their sport (Baseball, Basketball, Football, Lacrosse, Track & Field, or Tennis) and receive tailored default metrics. They log daily body metrics (hydration via color scale, sleep hours and efficiency, mood, fatigue, protein, and more) and sport-specific outcomes (wins/losses, goals, assists, yards, etc.). The app rewards consistency with streak and threshold badges grounded in NCAA and sports science guidelines, displays motivational messages driven by admin-editable rules, and provides sparkline trends plus detailed charts. All metric definitions, badge thresholds, sport mappings, and motivational messages are admin-editable via a dedicated admin interface — no code deploys required. Data is versioned for schema evolution, exportable as CSV, and the app is designed for future CODAP integration to support deeper cross-metric analysis.

## Background

This is a greenfield project. The repository currently contains only a LICENSE and README. The Jira ticket (DGT-25) under Epic DGT-5 "Web Data Entry" describes building a web app from PDF mockups created by Leslie Bondaryk. A linked design task (DGT-24 "DataGOAT Website") is also in To Do status.

The PDF mockups define 7 key screens: Landing/Login, Profile Setup, Daily Data Setup, Today/Dashboard, Track Data: My Body, Metric Detail, and Track Data: My Sports Outcomes. The mockups include annotations about behavior rules, sport-specific defaults, threshold-based badges, and CODAP integration.

The app will be built with **React + Vite** as a PWA with a **Firebase** backend (Firestore + Auth), deployed to **Firebase Hosting** with a staging environment from the start. The Firebase Emulator Suite will be used for local development. The app is mobile-first but also works well on desktop, styled with **Tailwind CSS + DaisyUI** using a custom theme derived from CODAP's color palette. Visualizations use **Chart.js with react-chartjs-2**.

## Requirements

### Authentication & User Management
- Users can register with email and password
- Users can log in with email and password
- Sign-up redirects to Profile setup; Login redirects to Today/Dashboard
- User data is private — each user can only access their own data (personal health data)
- Users can reset their password via email (forgot password flow)
- Users can log out from any screen via the persistent navigation
- Email verification is sent on registration; users can use the app immediately but receive a reminder to verify. Unverified accounts are flagged after 7 days
- Firebase Authentication with email/password provider

### Profile Setup
- Users set up a profile with: Username, Password, Sport, Weight (lbs), Age (yr), Gender
- Sport options: Baseball, Basketball, Football, Lacrosse, Track & Field, Tennis
- Gender options: Unspecified, Male, Female, Nonbinary
- Sport and weight choices determine default tracked metrics, goals, and threshold targets
- Sport-to-metric mappings (default metrics, training metrics, outcome metrics per sport) are stored in Firestore and editable by admins via the admin interface — not hard-coded
- Profile screen provides two setup paths: "Setup Your Daily Data" and "Setup Your Outcomes Data"
- At least one of the two data setups (Daily Data or Outcomes Data) must be completed before the user can proceed to tracking
- Both setups are independent — completing one does not require completing the other
- Users can return to set up the second data type later from their profile
- The profile screen must be accessible from any page in the app via persistent navigation (e.g., header/nav bar link or menu item)

### UX States
- **Empty state**: First-use screens show a friendly message with a call-to-action (e.g., dashboard says "Welcome! Start by logging today's metrics" with a button to the tracking screen). Charts show a placeholder message instead of an empty graph
- **Loading state**: Skeleton/placeholder UI while data loads — no blank screens or full-page spinners
- **Error state**: Inline error messages for failed operations (e.g., save failures); offline banner when network is unavailable. Firestore offline persistence keeps the app functional while offline
- **Sparse data**: Charts with fewer than 3 data points show the available points without a trend line. Sparklines show "Not enough data" as the text alternative until 3+ entries exist

### Navigation
- Persistent hamburger menu icon in the header on all authenticated screens (hidden on login/registration)
- Menu items: Dashboard (Today), My Body, My Sports, Profile, Logout
- Current page is visually indicated in the menu (e.g., bold or highlighted)
- Menu is a slide-out drawer on mobile; can remain a hamburger or expand to an inline menu on desktop at the implementer's discretion
- Header also displays the DataGOAT / #Sport_is_Science branding

### Daily Data Setup
- Checklist UI for selecting which daily metrics to track
- Default daily metrics with definitions:
  - Hydration — color scale
  - Sleep Time — PSQI
  - Sleep Efficiency — Sleep/Bed times
  - Protein — Nutrition Log
  - Mood — numeric scale 1-5 (PSQI)
  - Fatigue — numeric scale 1-5 (PSQI)
  - Availability — Play/Practice
  - Resting Heart Rate — bpm
  - Deadlift — lbs
  - Bench Press — lbs
  - Squat — lbs
  - Reps — count
  - Time — sec/min
  - Distance — mi/km or ft/m
  - Pace — min/mi
  - Weight Lifted — lbs
  - Personal Records — count
- Users can add custom measurements via "Add Measurement". A custom metric requires:
  - Name (text, required)
  - Unit (text, required — e.g., "lbs", "min", "reps")
  - Input type (required): numeric, scale 1-10, or binary (yes/no)
  - Date (optional — for metrics not tracked daily)
  - Min/max range (optional — for validation)
  - Custom metrics are limited to these input types; color scales are only available for built-in metrics
- The setup flow pre-checks the sport-specific default metrics (on-by-default) and shows them first. Off-by-default metrics are shown in a collapsed "Additional Metrics" section that users can expand
- A similar setup screen exists for sport outcome metrics

### Sport-to-Metric Defaults
All sports share a common body-metric base; differences are in training metrics and outcomes.

**Common daily body metrics (all sports, on by default):**
- Hydration (color scale with numeric labels), Sleep Time (hours), Sleep Efficiency (%), Mood (numeric 1-5), Fatigue (numeric 1-5), Availability (binary)

**Common daily body metrics (all sports, off by default):**
- Protein (grams), Resting Heart Rate (bpm), Deadlift (lbs), Bench Press (lbs), Squat (lbs), Reps (count), Time (sec/min), Distance (mi/km or ft/m), Pace (min/mi), Weight Lifted (lbs), Personal Records (count)

| Sport | Default Training Metrics | Default Outcome Metrics |
|---|---|---|
| **Baseball** | Throwing Velocity (mph) | Wins/Losses, Hits, At-Bats, RBIs, Runs, Errors |
| **Basketball** | Vertical Jump (in) | Wins/Losses, Points, Rebounds, Assists, Blocks, Steals |
| **Football** | Deadlift (lbs), Bench Press (lbs), Squat (lbs) | Wins/Losses, Yards, Tackles, Touchdowns, Sacks |
| **Lacrosse** | Sprint Time (sec) | Wins/Losses, Goals, Assists, Ground Balls, Caused Turnovers |
| **Track & Field** | Reps (count) | Times (sec/min), Distance (ft/m), Height (ft/m) |
| **Tennis** | Sprint Time (sec) | Wins/Losses, Aces, Double Faults, Break Points Won |

- Users can always add/remove metrics from their defaults during setup
- Football outcomes are position-dependent — the defaults above are a general set; users remove what doesn't apply
- Track & Field outcomes depend on event type (running vs. field) — both are offered, user selects relevant ones

### Today / Dashboard
- Main screen after login, branded "#Sport_is_Science"
- Motivational message that responds to user behavior (e.g., "Consistency is Key: 5 day streak! Go Leslie!")
  - Requires a behavior rule set to trigger messages
  - Motivational messages and their trigger rules are stored in Firestore (not hard-coded)
  - Messages must be editable by admins via a separate admin interface without requiring a code deploy
  - Message documents are versioned like all other Firestore documents (`schemaVersion`)
- Daily progress indicator showing "X of Y metrics logged today" near the top of the dashboard
- Quick entry buttons for each unlogged metric (e.g., "Enter Hydration") that open a focused single-metric input modal for today's entry
- "My Body" section with selectable metric and chart showing data over time with goal line
- "My Sport" section with selectable outcome metric and chart
- Hydration provided as default example graph

### Badge & Threshold System
Users earn badges when meeting consistency and health metric thresholds. All badge definitions are stored in Firestore and admin-editable. Badge definitions are versioned like all other Firestore documents (`schemaVersion`).

**Streak badges (all sports, consistency-focused):**

| Badge | Trigger | Message Template |
|---|---|---|
| Getting Started | 3-day entry streak | "3 days in a row! You're building a habit, {name}!" |
| Consistent | 5-day entry streak | "Consistency is Key: 5 day streak! Go {name}!" |
| Week Warrior | 7-day entry streak | "A full week of tracking! You're owning your data, {name}!" |
| Dedicated | 14-day entry streak | "2 weeks strong! Your data is telling a story, {name}!" |
| Data Scientist | 30-day entry streak | "30 days! You're a true data scientist now, {name}!" |
| Complete Entry | All tracked metrics logged in a single day | "Full data day! The more you track, the more you know." |

**Body metric threshold badges (based on sports science guidelines):**

| Badge | Metric | Threshold | Source/Rationale |
|---|---|---|---|
| Well Hydrated | Hydration | Color 1-3 on 8-point scale for 7 consecutive days | NCAA hydration guidelines — light straw color indicates adequate hydration |
| Sleep Champion | Sleep Time | >= 8 hours avg over 7 days | NCAA recommends 8+ hours for collegiate athletes |
| Sleep Pro | Sleep Efficiency | >= 85% avg over 7 days | Sleep medicine standard — 85%+ is considered good efficiency |
| Fueled Up | Protein | >= 1.6 g/kg bodyweight avg over 7 days | ISSN position stand — 1.4-2.0 g/kg for active individuals |
| Always Ready | Availability | 100% over 14 days | Full availability for practice/games over 2 weeks |

- **Streak calculation rules:**
  - A "day" = calendar day in the user's local timezone (detected from browser)
  - A day counts toward a streak if at least one tracked metric is logged for that date
  - Backfilling a missed day extends/repairs a streak (encourages data completeness)
  - Streaks are calculated from entry dates, not the timestamp of when data was entered
- Thresholds are evaluated over rolling windows (7-day or 14-day), not single-day spikes
- Sport-specific performance badges (e.g., "hit X yards") are deferred — too variable for initial defaults
- Protein threshold uses bodyweight from the user's profile to calculate the per-kg target

### Track Data: My Body
- Opens to today's date for data entry
- Clear visual indicator of "today"
- Date navigation (can go back but cannot log data in the future)
- Table with columns: 14-Day Trend (sparkline) | Metric | Value
- Sparkline charts must include screen-reader-only text alternatives summarizing trend direction and recent average (e.g., "Hydration: trending up, 5.2 avg over 14 days") and a `title` attribute for desktop hover tooltips
- Multiple input types per metric:
  - Hydration: color blocks with numeric labels (1-8) and ARIA labels describing each level (e.g., "1 — well hydrated", "8 — severely dehydrated")
  - Sleep Time: numeric hours
  - Sleep Efficiency: numeric hours
  - Protein: grams
  - Mood: numeric scale 1-5 with ARIA labels (e.g., "1 — very poor", "5 — excellent")
  - Fatigue: numeric scale 1-5 with ARIA labels (e.g., "1 — fully rested", "5 — exhausted")
  - Availability: checkbox (Played)
  - Sport-specific metrics (e.g., Deadlift in lbs, Reps as count)
- All inputs must include proper ARIA labels; no input relies solely on color, icons, or non-text indicators
- All numeric inputs enforce non-negative values. Built-in metrics include default min/max ranges (e.g., Sleep Time 0-24h, Sleep Efficiency 0-100%, Resting Heart Rate 20-250 bpm). Admin-editable metric definitions support optional min/max fields for validation. Out-of-range values show an inline error and are not saved
- Click on metric name to open "More Info" detail screen
- Tags/descriptors to qualify entries (e.g., what caused fatigue)
- Users can edit previously entered values for any past date
- Users can delete individual metric entries
- "Analyze your Data in CODAP" button (disabled with "Coming Soon" tooltip)

### Metric Detail Screen
- Full description/definition of the metric
- "Learn More" link
- Line chart showing data over a date range (using Chart.js via react-chartjs-2)
- Goal line displayed on chart
- Average value displayed
- Y-axis appropriate to metric type, X-axis is Day

### Track Data: My Sports Outcomes
- Same date navigation as Body tracking
- Table with columns: Total | Metric | Value (for date)
- Outcome metrics vary by sport (see Sport-to-Metric Defaults section above)
- Users can edit previously entered values for any past date
- Users can delete individual metric entries
- "Analyze your Data in CODAP" button (disabled with "Coming Soon" tooltip)

### Data Versioning
- All Firestore documents must include a `schemaVersion` field (integer, starting at `1`)
- Schema version is set at write time and never silently mutated — migrations are explicit
- The app checks `schemaVersion` on read and applies forward-migration functions when it encounters an older version
- Migration functions are maintained in a central registry (e.g., `migrations/`) keyed by document type and version
- Profile documents, daily body entries, outcome entries, metric definitions, and any config documents are all versioned
- When a schema change is introduced, a new migration function is added and the current version constant is incremented
- The app must handle reading documents written by any prior schema version without data loss
- Offline-synced documents retain their original `schemaVersion` until explicitly migrated
- Offline conflict resolution uses Firestore's default last-write-wins semantics. For this single-user prototype, this is acceptable — custom conflict resolution (e.g., merge or prompt) is deferred

### Technical / Platform Requirements
- React with Vite for build tooling and development
- Progressive Web App (PWA) with offline support
- Firebase Firestore for data storage with offline persistence
- Firebase Authentication (email + password)
- Firebase Hosting with a staging environment from the start
- Tailwind CSS + DaisyUI for styling and UI components
- Chart.js with react-chartjs-2 for visualizations (sparklines, line charts, bar charts)
- Mobile-first responsive design that also works well on desktop
- Local development using Firebase Emulator Suite
- Data stored per-user in Firestore; security rules enforce user-level access
- Users can export their data as CSV from the tracking screens (body metrics and sport outcomes separately)

### Future / CODAP Integration
- "Analyze your Data in CODAP" buttons shown on tracking screens as disabled with "Coming Soon" tooltip
- Full integration is a future story — export/link user data to CODAP for relationship analysis between metrics and performance

## Technical Notes

- **Repo state**: Greenfield — no existing code, framework, or build tooling yet
- **Framework**: React with Vite — lightweight, fast dev server, good ecosystem
- **Hosting**: Firebase Hosting with staging environment from the start, enabling early stakeholder review
- **PWA**: Requires a service worker, manifest.json, and offline-capable architecture
- **Firestore schema**: Needs design — user profiles, daily entries, outcome entries, metric definitions. Every document type includes a `schemaVersion` integer field. A central migrations registry maps `(documentType, fromVersion)` → migration function, applied on read when the document's version is older than the app's current expected version. This keeps the migration logic in the client (no Cloud Functions needed for this prototype) and allows offline-created documents to be migrated when the user upgrades the app
- **Sport-specific defaults**: All 6 sports have default metric mappings (see Sport-to-Metric Defaults). These are stored in Firestore and admin-editable.
- **Behavior rule engine**: The motivational messaging system uses a rule set stored in Firestore (streak detection, threshold achievement). Admin-editable without code deploys.
- **Charts/Visualizations**: Chart.js with react-chartjs-2 — sparklines on the tracking table, full line charts with goal lines on the detail screen, canvas-based rendering
- **Admin / security rules**: The admin interface will need Firestore security rules that grant admin-role users broader read access — specifically the ability to read across user data to gather summary/aggregate statistics (e.g., active users, entry counts, compliance rates). Standard user rules restrict access to own data only, so a separate admin role and corresponding rule set will be needed
- **Admin role assignment**: Admin roles use Firebase custom claims (e.g., `{ admin: true }`), set via a CLI script (`node scripts/set-admin.js <email>`). Custom claims are checked in Firestore security rules and available client-side via `auth.currentUser.getIdTokenResult()`. No in-app admin-granting UI needed for the initial prototype.
- **Minor data handling**: Age and minor data handling will be governed by the project's IRB protocol. The initial prototype assumes users are 18+ (college athletes per the mocks). If the app is extended to younger athletes, COPPA compliance and parental consent flows will need to be added.
- **Styling / Component Library**: Tailwind CSS + DaisyUI. Custom `datagoat` theme derived from CODAP's color palette for visual continuity with the broader Concord ecosystem:
  - `primary`: #0693e3 (CODAP cyan-blue — links, primary actions)
  - `secondary`: #ffc222 (CODAP/DataGOAT gold — header, branding accent)
  - `accent`: #7bdcb5 (CODAP green-cyan — success states, badges)
  - `neutral`: #32373c (CODAP dark charcoal — nav, footer)
  - `base-100`/`base-200`/`base-300`: #ffffff / #f5f5f5 / #e5e5e5
  - `info`: #0693e3, `success`: #7bdcb5, `warning`: #ffc222, `error`: #e53e3e
  - Typography: Lato (CODAP's primary font), with system font fallback
  - Style: rounded corners, subtle shadows, clean spacing per CODAP's flat aesthetic
- **Linked Jira issues**: DGT-24 "DataGOAT Website" (Design Task) — the design work for this project

## Out of Scope

- CODAP integration implementation (buttons shown as disabled "Coming Soon"; full integration is a future story)
- Native mobile app (this is a PWA)
- Team/coach features — this is individual athlete tracking only
- Social features or data sharing between users
- Breakaway Speed integration (shown in mocks as reference only)
- Sport-specific performance badges (e.g., yardage targets) — deferred until more data on reasonable thresholds
- Push notifications / daily reminders for data entry — high-priority follow-up for a future spec

## Open Questions

### RESOLVED: What frontend framework should be used?
**Context**: The repo is greenfield. The choice of framework affects project structure, build tooling, routing, and developer experience. Concord Consortium has experience with React.
**Decision**: **React with Vite** — lightweight, fast, well-known at Concord.

### RESOLVED: How should the CODAP integration button behave in this initial version?
**Context**: The mocks show "Analyze your Data in CODAP" buttons, but full CODAP integration is a future story.
**Decision**: **Show the buttons but disabled with a "Coming Soon" tooltip.**

### RESOLVED: What is the initial set of sport-to-metric mappings?
**Context**: The mocks state that sport and weight determine default tracked metrics, goals, and threshold targets.
**Decision**: **Define a basic mapping for all 6 sports upfront.** See Sport-to-Metric Defaults section in Requirements. All mappings stored in Firestore and admin-editable.

### RESOLVED: What should the badge/threshold system look like in this initial version?
**Context**: The mocks mention badges for meeting thresholds based on sport and sex, but the specifics aren't defined.
**Decision**: **Implement both streak and threshold badges** using the defaults in the Badge & Threshold System section. All badge definitions stored in Firestore and admin-editable.

### RESOLVED: Should the app be deployed to Firebase Hosting from the start?
**Context**: Firebase Hosting is a natural fit and would allow sharing with stakeholders early.
**Decision**: **Set up Firebase Hosting from the start with a staging environment.**

### RESOLVED: What charting library should be used for visualizations?
**Context**: The app needs sparklines in tables, line charts with goal lines, and potentially bar charts. The library should be lightweight and mobile-friendly.
**Decision**: **Chart.js with react-chartjs-2** — versatile, canvas-based, good for the variety of chart types needed.

## Self-Review

### Senior Engineer

#### RESOLVED: No password reset / forgot password flow specified
Added "Users can reset their password via email (forgot password flow)" to Authentication & User Management.

#### RESOLVED: No logout requirement specified
Added "Users can log out from any screen via the persistent navigation" to Authentication & User Management.

#### RESOLVED: Edit/delete existing entries not specified
Added edit and delete capabilities to both Track Data: My Body and Track Data: My Sports Outcomes sections.

#### RESOLVED: "Add Measurement" custom metric definition is underspecified
Defined custom metric fields: Name (required), Unit (required), Input type (numeric/scale 1-10/binary, required), Date (optional), Min/max range (optional). Custom metrics limited to these input types; color scales and emoji inputs reserved for built-in metrics.

---

### Security Engineer

#### RESOLVED: No email verification requirement
Added email verification on registration with non-blocking flow — users can proceed immediately but are reminded to verify. Unverified accounts flagged after 7 days.

#### RESOLVED: Age consideration — COPPA / minor data handling
Deferred to IRB protocol. Added note to Technical Notes: initial prototype assumes 18+ college athletes. COPPA/parental consent needed if extended to younger athletes.

#### RESOLVED: Admin role assignment mechanism not defined
Admin roles use Firebase custom claims, set via a CLI script (`node scripts/set-admin.js <email>`). Added to Technical Notes.

---

### Product Manager

#### RESOLVED: Onboarding flow for the 17 daily metrics is potentially overwhelming
Added to Daily Data Setup: sport-specific defaults shown first and pre-checked; off-by-default metrics in a collapsed "Additional Metrics" section.

#### RESOLVED: No data export requirement beyond CODAP (deferred)
Added CSV export to Technical/Platform Requirements. Users can export body metrics and sport outcomes separately.

---

### Student (Athlete/User)

#### RESOLVED: No notification or reminder system for daily entry
Deferred to a future spec as a high-priority follow-up. Added to Out of Scope.

#### RESOLVED: Dashboard "quick entry" interaction unclear
Clarified: dashboard shows a "X of Y metrics logged today" progress indicator, plus simple quick entry buttons (e.g., "Enter Hydration") that open a focused single-metric input modal. The "+N" from the mocks is replaced by the progress indicator.

---

### WCAG Accessibility Expert

#### RESOLVED: Hydration color scale and emoji inputs need accessible alternatives
Removed emoji scales entirely. Mood and Fatigue now use numeric 1-5 scales with descriptive ARIA labels. Hydration color blocks now include numeric labels (1-8) and ARIA labels describing each hydration level. Added a general requirement that all inputs include proper ARIA labels and no input relies solely on color, icons, or non-text indicators.

#### RESOLVED: Sparkline charts need text alternatives
Added: sparklines include sr-only text summarizing trend direction and recent average, plus `title` attributes for desktop hover tooltips.

---

### QA Engineer

#### RESOLVED: No validation rules specified for metric inputs
Added: all numeric inputs enforce non-negative values, built-in metrics ship with default min/max ranges, admin metric definitions support optional min/max, out-of-range values show inline errors and are not saved.

#### RESOLVED: Offline conflict resolution not specified
Added: Firestore's default last-write-wins semantics are acceptable for this single-user prototype. Custom conflict resolution deferred.

#### RESOLVED: Streak calculation edge cases undefined
Added streak rules: calendar day in user's local timezone, at least one metric logged counts, backfilling repairs streaks, calculated from entry dates not entry timestamps.

---

### UI Expert/Designer

#### RESOLVED: No navigation structure defined beyond "persistent nav to profile"
Added Navigation section: hamburger menu with slide-out drawer on mobile, items for Dashboard, My Body, My Sports, Profile, Logout. Current page indicated. Header includes branding.

#### RESOLVED: No loading, empty, or error states defined
Added UX States section: empty states with CTAs, skeleton loading UI, inline error messages, offline banner, and sparse data handling for charts (fewer than 3 points show without trend line).

#### RESOLVED: Color palette and branding not specified
Added DaisyUI with a custom `datagoat` theme derived from CODAP's color palette (codap.concord.org): gold header (#ffc222), cyan-blue primary (#0693e3), green-cyan accent (#7bdcb5), Lato typography. Provides visual continuity with the CODAP ecosystem.
