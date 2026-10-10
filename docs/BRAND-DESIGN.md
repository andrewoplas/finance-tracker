# Finance brand design

This is the current design baseline for Finance. It follows the implemented overview and Plans workspace: system typography, ink text, neutral surfaces, and a restrained lime identity accent. The earlier orange palette in `DESIGN_PLAN.md` is historical; keep that document as project context rather than applying its colors to new UI.

## Tokens and appearance

Use semantic CSS variables in `app/globals.css`, including for charts and popovers. There is one light palette and one dark palette.

| Purpose | Light | Dark |
| --- | --- | --- |
| Canvas | `#ffffff` | `#141617` |
| Main text | `#131313` | `#f0f2f2` |
| Card | `#ffffff` | `#1d2122` |
| Muted surface | `#f5f5f6` | `#252b2d` |
| Secondary text | `#666d72` | `#adb6b9` |
| Border | `#e5e7e8` | `#364044` |
| Primary action | Ink | Lime, with dark text |
| Identity accent | `#c6ff02` | `#c6ff02` |
| Income | `#21786d` | `#79d6b3` |
| Expense | `#b64b4b` | `#ffa7a7` |

Lime identifies the brand and highlights actions in dark appearance. Income, expenses, transfers, warnings, and destructive actions retain distinct semantic colors. User category colors and emoji identify categories; they are not page backgrounds or promotional decoration.

## Layout and typography

- System sans font stack; monospace only for CSV and technical payloads.
- Desktop workspace maximum width: 1100px. Settings: 900px.
- Desktop page headings: 38px, strong weight, tight tracking. Mobile: 30px.
- Section headings: 16px. Descriptions: 13–14px. Metadata: 11–12px.
- Mobile horizontal inset: 16px; reserve space for fixed navigation and safe areas.
- Keep descriptions short. Place detailed financial explanations beside the relevant form or inside expandable maintenance sections.
- Cards and surfaces use quiet borders, 18px corners, and no ornamental shadows. Keep dense report/import tables inside their own scrolling region.

## Shared components and interactions

- `BrandLogo` owns the Finance wordmark and lime dot.
- `PageHeading` owns management-page titles, descriptions, and actions.
- Buttons use pill corners, consistent semantic colors, and a 44px minimum height. Fields use 10px corners and a 44px minimum height.
- Inputs and selects use 16px type on mobile to avoid automatic zoom. Accessible labels remain necessary even when placeholders are present.
- Dialogs use the same surface and field styles, accessible titles/descriptions, and bounded viewport height.
- Overflow actions remain visible on touch devices and keyboard navigation. Do not hide necessary controls behind hover.
- Current navigation links expose `aria-current="page"`. Desktop and mobile share five destinations: Overview, Transactions, Planning, Reports, and Settings. Planning groups spending plans, budgets, installments and recurring items; accounts live under Settings, and monthly reflections live in Reports. Incoming reviews belong to Transactions.
- Unknown balances and load failures remain explicit. Styling must not turn missing financial data into zero totals or imply balances were verified.

## Verification

For future UI changes, inspect desktop and narrow mobile widths in both themes, check empty and populated states, and verify dialogs and navigation. A successful build is not a substitute for an authenticated visual review. Record the actual coverage in `UI-BRAND-AUDIT.md`.
