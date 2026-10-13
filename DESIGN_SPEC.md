# SmartLab Monitor — Design Specification

This document is an implementation-ready design specification for SmartLab Monitor — a centralized computer lab usage logging & monitoring platform for ~60 Windows computers. It is intended as the design-phase deliverable (UI/UX, system architecture, user flows, design system, component library) before any backend implementation.

## Project summary

- Product: SmartLab Monitor
- Purpose: Replace paper-based lab registers with a scheduled usage logging system. Students submit planned start/end times; admins view records, reports, analytics.
- Important: This system is NOT an active-session manager. No session timers, no logout/end session flows.

## Deliverables (Phase 1 outputs)

1. Information architecture
2. User flows
3. Sitemap
4. Design system (colors, typography, spacing, tokens)
5. Component library spec
6. Student portal screens and flows
7. Admin auth and dashboard screens
8. Computer monitoring grid & details
9. Usage records management UI
10. Student management UI
11. Reports UI & export flows
12. Analytics dashboard
13. Empty / loading / error states
14. Responsive layouts
15. Clickable prototype flow (Figma-ready)

## Key product rules (short)

- Students submit: Name, Register No, Department, Year, Computer ID (auto-detected/read-only), Start Time, End Time.
- On submit: record saved immediately, duration calculated. No active-session UX.
- Overlap rule: a computer cannot have overlapping records. End == start is allowed.

## Design principles

- SaaS/Enterprise dashboard language: clean, minimal, professional, spacious.
- Accessibility: color + icons + labels; keyboard nav; focus states.
- Scalable: grid for 60 computers with grouping, filters, search.

## Quick file map (created)

- [design/tokens.json](design/tokens.json)
- [design/sitemap.md](design/sitemap.md)
- [design/flows.md](design/flows.md)

---

Full product prompt and details for design generation (can be provided to a design AI or designer):

> Use the complete, production-ready prompt provided in the original brief. Ensure the design strictly excludes any active-session features and focuses on scheduled usage logging.

Refer to the companion files in the `design/` folder for tokens, sitemap, and flows.

---

Prepared by: Design phase automation
Date: 2026-10-13
