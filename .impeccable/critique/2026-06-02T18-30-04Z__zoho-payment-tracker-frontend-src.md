---
target: zoho-payment-tracker/frontend/src
total_score: 22
p0_count: 0
p1_count: 2
timestamp: 2026-06-02T18-30-04Z
slug: zoho-payment-tracker-frontend-src
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | SyncStatus is well-executed; KPI dashes ambiguous on load vs. error |
| 2 | Match System / Real World | 3 | Spanish UI, domain language correct; Zoho stage names in English |
| 3 | User Control and Freedom | 2 | No breadcrumbs on deep fiducia routes; no undo anywhere |
| 4 | Consistency and Standards | 2 | `text-gray-*` in SyncStatus vs `text-slate-*` everywhere else; two different red tokens in use |
| 5 | Error Prevention | 2 | No confirmation dialogs visible; no client-side input validation |
| 6 | Recognition Rather Than Recall | 2 | Icon-only sidebar requires memorization; no breadcrumbs on deep routes |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcuts; no bulk actions |
| 8 | Aesthetic and Minimalist Design | 3 | Clean and restrained; minor: bare "Sin datos" empty states |
| 9 | Error Recovery | 2 | SyncStatus shows error text; but KPI and chart API calls silently swallow failures |
| 10 | Help and Documentation | 1 | Title-attribute tooltips on sidebar only; no help system |
| **Total** | | **22/40** | **Acceptable** |

---

## Anti-Patterns Verdict

**LLM assessment**: The interface does NOT read as AI-generated. The blue-tinted near-white background (`#f8faff`) avoids the warm-cream AI default. The pipeline StageBadge with colored pills and dot indicators is genuinely distinctive. The icon-only sidebar is a considered product pattern (Linear, Figma), not a lazy choice. No gradient text, no glassmorphism, no side-stripe border accents. The 4-5 column KPI grid with icon+metric cards borders on the hero-metric template but never crosses it: numbers are 22px (not giant), there are no gradient accents, and the icons are functional not decorative.

**Deterministic scan**: 1 finding. `gray-on-color` at `index.css:25` — **false positive**. The detector associated `text-slate-700` from `.btn-secondary` with `bg-blue-500` from `.btn-primary` due to proximity in the same file. The slate-700 text is on a white background, not on blue-500. No real violation.

---

## Overall Impression

Functionally solid, visually clean, and on-brand for a financial tool. The biggest gap is not aesthetic — it is operational reliability: when the API fails silently, the user sees dashes and has no way to know whether their cartera data failed to load, is still loading, or is genuinely empty. For a financial tool used by an analyst making decisions from this data, that ambiguity is a trust-breaker. Fix error visibility first; the visual system is largely sound.

---

## What's Working

1. **SyncStatus component**: Properly handles running/success/error states with precise feedback (record count, last sync time, error snippet). The `animate-pulse` dot during sync is exactly the right level of feedback for a background operation.

2. **StageBadge + semantic palette**: The pipeline stage chips with colored background, tinted border, and dot indicator communicate complex CRM state clearly and compactly. These are the most distinctive component in the system.

3. **Restrained color strategy**: `--aed-base: #f8faff` (blue-tinted near-white) + single accent (blue-500) + semantic status colors is a coherent Restrained strategy. No color noise; every hue is earning its presence.

---

## Priority Issues

### [P1] Silent API failures — users cannot distinguish loading, error, or empty

**Why it matters**: The cartera analyst opens the Dashboard expecting to see total opportunities, receivables, active trusts. All four KPIs show `—`. Is the backend down? Is it loading? Are there genuinely no records? The dash is identical in all three cases. On the Resumen page, `Promise.allSettled()` swallows per-call failures; charts and tables render empty with "Sin datos" and no indication anything went wrong. A financial analyst making decisions from this screen needs to know whether the data is trustworthy at this moment.

**Fix**: Replace the `—` with a skeleton shimmer during the initial load. On API failure (caught promise rejection), show a distinct error state per card/section with a retry option. Keep `—` only for "genuinely no data" after a successful fetch.

**Suggested command**: `/impeccable harden`

---

### [P1] Pizarra Apagada (#94a3b8) fails WCAG AA contrast — used throughout

**Why it matters**: Computed contrast ratio of #94a3b8 on #f8faff (Papel Helado): **2.47:1**. On white (#ffffff): **2.56:1**. WCAG AA requires 4.5:1 for normal text, 3:1 for large text (≥18px regular or ≥14px bold). Pizarra Apagada is used for: KPI card labels ("Total oportunidades", 11px/500 weight), section-label (9px/700/uppercase), input placeholder text, SyncStatus copy, and table header text in Resumen. All of these fail. For the 9px section-label, the failure is especially severe — that size doesn't qualify as "large text" under any definition.

**Fix**: Darken Pizarra Apagada for text uses to at least #6b7680 (which achieves approximately 4.5:1 on #f8faff). Alternatively, use `#64748b` (slate-500) which achieves ~4.6:1 on white. The existing Pizarra Apagada (#94a3b8) can remain for purely decorative uses (border tints, dividers).

**Suggested command**: `/impeccable audit`

---

### [P2] Icon-only sidebar requires memorization, not recognition

**Why it matters**: The 5 sidebar items use Lucide icons with no text labels. `Briefcase` → "Negocios" and `LayoutDashboard` → "Oportunidades" are the most problematic: a new analyst cannot distinguish the two by icon alone. `ArrowLeftRight` → "Movimientos" is non-obvious. The `title` attribute provides a tooltip on hover (desktop only — mobile/touch users see nothing). This is a recall interface, not a recognition interface.

**Fix**: Two options: (A) expand the sidebar to ~160px with text labels alongside icons (standard app shell, see Linear/Notion), with a collapse toggle for power users; or (B) add an always-visible `title` label below each icon within the 60px constraint (icon top, 8px label bottom, similar to iOS tab bars). Option B preserves the compact sidebar without requiring a collapse mechanism.

**Suggested command**: `/impeccable layout`

---

### [P2] No breadcrumbs on deep fiducia drill-down routes

**Why it matters**: The route tree reaches 4 segments deep: `/fiducia/:id/apartamento/:nomenclatura`. An analyst navigating to apartment detail for a specific encargo must remember which encargo and which project they're in. The topbar shows a static page title but no location hierarchy. The sidebar active indicator stays on "Encargos" regardless of depth — providing no sub-route orientation.

**Fix**: Add a lightweight breadcrumb component to the topbar for routes with depth ≥ 2. Minimal implementation: `Encargos > [Encargo Name] > [Nomenclatura]` as a flex row with separator chevrons. The existing topbar `h-[52px]` has room to the right of the title.

**Suggested command**: `/impeccable layout`

---

### [P3] Color tokens fragmented — two red hues, two gray families

**Why it matters**: KpiCard in Resumen uses `iconColor="#dc2626"` (Tailwind red-600) for "Negocios activos". StageBadge uses `#e11d48` (Rojo Cierre, DESIGN.md canonical) for "Negotiation/Review" and "Closed Lost" uses `#6b7280` (gray-500). SyncStatus uses `text-gray-500` and `text-gray-700` while all other pages use `text-slate-*`. Two divergent red hues and two divergent gray families in active use.

**Fix**: Consolidate to the canonical palette defined in DESIGN.md. Replace `#dc2626` KPI uses with the appropriate semantic token. Replace `text-gray-*` in SyncStatus with `text-slate-*` equivalents.

**Suggested command**: `/impeccable polish`

---

## Persona Red Flags

### Alex (Power User — Analista de Cartera Experto)
Walking Alex through the primary task — check recaudos and identify overdue accounts:

- **No keyboard shortcuts** anywhere. Tab navigation works (HTML defaults) but no accelerators for sync trigger, navigation between sections, or table actions.
- **No bulk actions** on the opportunity table. Reviewing 50 accounts one at a time is the only path.
- **The `—` dash on initial load is a time sink**: Alex opens the dashboard, sees 4 dashes, doesn't know if the backend is slow today or genuinely empty. Waits. No ETA.
- **Two navigation items with near-identical icons** (Negocios vs. Oportunidades) — Alex learns the difference once but the distinction itself raises a question: why are there two separate routes for opportunities?

### Sam (Accessibility — Usuario con lector de pantalla)
Sam's keyboard/screen reader experience:

- **Sidebar NavLink `title` attributes provide tooltip text** but screen readers read `aria-label` / `aria-labelledby` / visible text, not `title`. The sidebar links are announced as empty or unlabeled links. **Blocker for screen reader users.**
- **Pizarra Apagada on Papel Helado at 2.47:1** — 11px KPI labels, 9px section-labels, placeholder text all fail WCAG AA. Low-vision users on standard displays will struggle.
- **Animated pulse dot in SyncStatus** has no `prefers-reduced-motion` guard. Users with vestibular disorders will see continuous animation.
- **Color-only state communication in SyncStatus**: the green/red/yellow icons on the sync footer in Resumen convey status through color alone with no text alternative beyond what the icon itself can't describe.

### "Valentina" (Project-Specific Persona — Analista de Cartera, First Week)
Derived from PRODUCT.md: financial/cartera team, daily usage, many simultaneous records.

- **Profile**: Joined AED two weeks ago. Knows CRM concepts but unfamiliar with Zoho's specific stage nomenclature in English. Works in Chrome on a 1440p monitor.
- **Opens Negocios**: sees a table with opportunities. Notices the sidebar has two items that look similar. Clicks both to understand the difference.
- **"Oportunidades" vs "Negocios"**: discovers they show similar data in different layouts. No explanation of when to use which. Confusion tax every session.
- **Sees a KPI showing `—`**: not sure if data isn't loaded or if the number is zero. Waits several seconds, refreshes. No change. Is there a sync she needs to trigger?
- **Navigates to an encargo, then to a nomenclatura**: loses track of which encargo she's in within 2 minutes. The back button works but she isn't sure where it will take her.

---

## Minor Observations

- `variacionText()` in Resumen.jsx uses `▲ ▼` Unicode arrows for trend indicators — functionally good, but these symbols have no accessible text alternative. Screen readers will announce them as "up-pointing triangle" which is correct but verbose. Consider `aria-label` wrapping.
- The "Sin datos" empty state in the Top Deudores and Cartera por Proyecto tables in Resumen is a bare `<p className="text-sm text-slate-400">Sin datos</p>`. No guidance, no context (is this because data hasn't synced yet, or because there genuinely are no deudores?).
- `SyncStatus` has a `setTimeout` inside `handleSync` (3s delay before reloading status) — if the sync takes longer than 3 seconds, the status will flash back to the previous state before showing the new one.
- Resumen header says `"Vista ejecutiva"` as a subtitle next to the page title — but this is not the same pattern as Dashboard.jsx which uses `"CRM Zoho"` as the subtitle. The subtitle pattern is inconsistent: sometimes a data source label, sometimes a view description.
- The 5-column KPI grid on Resumen is one column over the Working Memory Rule limit (≤4 items per group). Not a critical issue but worth noting for future additions.
- `Resumen.jsx` uses a new red: `iconBg="#fef2f2"` / `iconColor="#dc2626"` — an undocumented entry in the palette that diverges from the DESIGN.md canonical Rojo Cierre.

---

## Questions to Consider

- "Negocios" and "Oportunidades" appear to be two views over the same entity (Zoho opportunities). Should they be merged into one route with a view toggle, or does the functional difference justify two separate navigation items?
- The `—` loading state is used everywhere. What does "no data" actually mean for this tool? Should there ever genuinely be zero opportunities/encargos for a production system, or does a dash always mean "still loading / error"?
- The icon-only sidebar is tight at 60px. At what screen density does this stop working? If analysts use 1080p laptops, a 60px sidebar consumes meaningful relative width. Has the breakpoint behavior been tested?
