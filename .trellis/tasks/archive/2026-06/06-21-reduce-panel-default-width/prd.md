# Reduce Panel Default Width

## Goal

Make the terminal-side live stats and Git changes panels narrower by about 30% from their current defaults, so they take less terminal space when first opened.

## Requirements

* Reduce the merged terminal side panel default width from 290px to about 70% of current width.
* Reduce the standalone live stats panel fixed width from 290px to about 70% of current width.
* Reduce the standalone Git changes panel fixed width from 280px to about 70% of current width.
* Keep existing resize behavior and stored user-resized widths intact.

## Acceptance Criteria

* [ ] Fresh merged side panel opens around 203px wide.
* [ ] Standalone live stats panel renders around 203px wide.
* [ ] Standalone Git changes panel renders around 196px wide.
* [ ] TypeScript check passes.

## Definition of Done

* Minimal frontend-only change.
* No dependency or backend changes.
* Static verification completed.
* Manual UI checks listed for desktop verification.

## Technical Approach

Change only the existing width constants/classes in the terminal panel components. For the merged resizable side panel, lower the minimum width enough so the new default is not clamped back to the previous minimum.

## Out of Scope

* Migrating or deleting user-saved panel widths in localStorage.
* Redesigning panel contents for narrow mode.
* Changing toolbar visibility or panel toggle behavior.

## Technical Notes

* Relevant files:
  * `src/components/terminal/TerminalSidePanel.tsx`
  * `src/components/terminal/TerminalStatsPanel.tsx`
  * `src/components/git/GitChangesPanel.tsx`
* Current widths:
  * Merged side panel: `DEFAULT_WIDTH = 290`, `MIN_WIDTH = 220`
  * Standalone live stats: `w-[290px]`
  * Standalone Git changes: `w-[280px]`
* GitNexus impact lookup did not find these React component symbols in the current index, so impact was checked by direct imports/usage inspection.
