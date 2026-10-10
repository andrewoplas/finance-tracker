# Finance UI brand audit — 2026-10-11

## Scope and baseline

Source audit of every user-facing route and its rendered components. Baseline: the current Finance overview and Plans UI, using ink, neutral-gray surfaces, system typography, and restrained lime accents. See `BRAND-DESIGN.md` for the shared rules. Historical orange design notes remain preserved.

## Findings and changes

1. Multiple palettes coexisted: the old orange theme, newer monochrome workspace overrides, and hardcoded red/green/gray component classes. Consolidated theme tokens for light/dark appearance and replaced fixed legacy colors with semantic tokens. Charts, popovers, inputs, and warnings now follow those tokens.
2. Management pages used different title sizes, content widths, and mobile insets. Added shared page headings and a common page canvas for accounts, wallets, budgets, recurring, reports, settings, inbox, and manual entry.
3. Authentication had gradients, blurred decorative backgrounds, large shadows, and a separate visual identity. Replaced these with the shared Finance wordmark, neutral canvas, quiet cards, and standard controls.
4. Controls varied in size and shape. Standardized buttons, fields, selects, tabs, menus, dialogs, and focus treatment. Added missing accessible labels and dialog descriptions on affected paths.
5. Account/transaction menus required hover. Made their controls visible and labelled on touch and keyboard paths. Sidebar primary and tool links now identify the active destination; mobile Plans opens the actual Plans workspace.
6. Plans had little hierarchy, long explanations, and reminders outside the page wrapper. Added a totals summary, actionable empty states, integrated reminders, expandable balance checks/history, and mobile installment rows. Deep links still reveal balance reconciliation.
7. CSV input was constrained to 300px. It now uses the available width with a readable monospace editor. Reports use a bounded, labelled table region, consistent formatting, and theme-aware borders.
8. Recurring copy implied automatic posting. Updated it to describe manual posting. Account editing also displays Unknown when its opening baseline is unknown.
9. Added a branded not-found page and aligned the client error fallback with the same design. Loading uses the shared surface tokens.

The initial brand pass preserved financial mutation contracts. The subsequent approved simplification adds the reflection endpoint described in `REFLECTION-ENDPOINT-SPEC.md`. No migrations, explicit deployments, or production financial writes were performed.

## Route coverage

| Page / state | Source coverage | Main action |
| --- | --- | --- |
| `/` | Reviewed | Existing authenticated redirect preserved |
| `/login`, `/register` | Reviewed and updated | Shared identity, auth canvas, fields/buttons, autocomplete |
| `/dashboard` overview | Reviewed and updated | Consolidated brand tokens |
| `/dashboard?view=transactions` | Reviewed | Shared rows, controls, theme/navigation |
| `/dashboard?view=analysis` | Reviewed and updated | Theme-aware category chart/progress colors |
| `/dashboard?view=reflection` | Reviewed | Shared form and surface treatment |
| `/dashboard/transactions` | Reviewed and updated | Single responsive heading, semantic colors, labelled filters, visible menus |
| `/dashboard/accounts` | Reviewed and updated | Shared heading/canvas, visible menus, consistent cards/dialogs |
| `/dashboard/wallets` | Reviewed and updated | Shared heading/canvas, consistent fields/cards/dialog |
| `/dashboard/budgets` | Reviewed and updated | Shared heading/canvas, semantic progress/status colors |
| `/dashboard/recurring` | Reviewed and updated | Shared heading/canvas, honest posting copy, responsive rows |
| `/dashboard/reports` | Reviewed and updated | Shared heading, bounded table, readable theme-aware styling |
| `/dashboard/settings` | Reviewed and updated | Shared heading/canvas, consistent profile/category/API/tag sections |
| `/dashboard/inbox` | Reviewed and updated | Page-level heading, separate review sections, consistent surfaces |
| `/dashboard/plans` | Reviewed and updated | Summary, actions, reminders, maintenance disclosures, mobile schedule |
| `/dashboard/import` | Reviewed and updated | Consistent heading/back link, full-width CSV editor, controls |
| Demo routes and monthly views | Reviewed and updated | Shared styling; synthetic data and disabled persisted actions remain explicit |
| Loading, client error fallback, not-found | Reviewed and updated | Shared branded surfaces and appearance |

## Verification and limits

- TypeScript: passed during the brand pass.
- ESLint: zero errors; five inherited unused-code warnings in swipe handling, responsive-dialog, and constants.
- Production build: passed for the final route set, including branded not-found and client fallback.
- Monthly-navigation tests: all four passed.
- HTTP smoke checks: login, registration, all four demo monthly views, demo Plans/import/inbox returned 200 with page content and styles. Branded demo 404 returned 404. All eleven protected dashboard routes redirected unauthenticated requests to login. These are HTTP checks, not rendered visual proof.
- Diff whitespace validation: passed after cleanup.
- Final visual review: pending. The requested Browser plugin runtime returns no available browser sessions, despite the app's ambient login-tab context. No final screenshot coverage is claimed for this brand pass.
- Authentication-protected populated pages: source reviewed, not visually verified in a live signed-in session. Earlier agent-browser checks of Plans predate the full shared-token pass.

To complete visual acceptance, connect Browser to the local preview, check each route at desktop and narrow mobile widths in light/dark themes, and sign in manually for populated protected pages. Inspect long account/category names, large monetary values, empty/load-error states, and open dialogs. Do not submit financial operations solely to check styling.

## Approved simplification

- Five shared destinations: Overview, Transactions, Planning, Reports, Settings.
- Transactions combines monthly activity, manual and natural-language entry, search/account/type/date/category/tag/review filters, totals, CSV export and incoming review queues. Quick-log suggestions reuse the loaded selected-month entries instead of issuing another history query.
- Planning groups spending plans, budgets, installments, recurring transactions and planned reminders. Shared-money creation/collection workflows and wallets are hidden, with existing historical data retained.
- Accounts are reached from Settings. Wallets, standalone Inbox and CSV import redirect to active destinations. The old manual-entry route preserves its month/filter when redirecting to Transactions.
- Reports provides a month picker, saved reflections and historical monthly comparisons. The old reflection link redirects there. The new owner-scoped GET/PUT endpoint accepts a dedicated reflection bearer key or the app session.
- Authenticated visual acceptance remains pending because Browser provides no connected session.

Implementation verification: 18 focused tests passed (reflection store/auth/body handling, monthly navigation, finance calculations and client retries); production build including TypeScript passed; ESLint had zero errors and five inherited warnings. Local HTTP checks validate public rendering and reflection rejection paths; authenticated visual checks and live reflection persistence remain pending.
