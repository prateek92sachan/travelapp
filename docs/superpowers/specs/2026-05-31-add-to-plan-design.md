# Add to Plan from Saved Picker + Detail Card — Design

**Date:** 2026-05-31
**Branch:** feature/mapbox-search
**Status:** Approved design, pending implementation plan

## Goal

Today a place card in the live-POI picker modal and the place detail card can be
saved to the **Saved** wishlist (star). Add a parallel action to drop the same
place into the **Plan** itinerary (day → phase session, or day hotel).

## Surfaces

1. **Saved-mode "+ Add" picker** (`SavedPlacePicker` → `PlacePickerModal` →
   `LightPickerRow`). New per-row calendar action beside the star.
2. **Place detail card** (`PlaceDetail`, opens from category tabs). New
   "Add to Plan" button beside Save.

PlanMode's own session/hotel pickers are **unchanged** — picking a row there
already adds to the plan, so they do not get the calendar action.

## Interaction

- `LightPickerRow` gets an optional `onAddToPlan` prop. When provided, render a
  second icon button (Lucide `CalendarPlus`) next to the wishlist star. Star =
  Saved; calendar = Plan. When the prop is absent (PlanMode pickers), no calendar
  icon renders.
- Tapping the calendar icon (or the detail card's "Add to Plan") opens a
  **bottom sheet** pinned to the bottom of the modal/card:
  - **Day chips:** `Day 1 … Day N` + `+ New day`. Preselect Day 1 (or the active
    plan day when invoked from PlanMode context — N/A here, default Day 1).
    `+ New day` appends a day (cap 30) and targets it.
  - **Phase chips:** `Morning / Evening / Night`. Tapping a phase commits the add
    immediately for the selected day.
  - **Hotel rows:** no phase row. Show `Set as hotel · Day N` button instead.
    Hotels are capped at 2/day; if the selected day already has 2, the action is
    blocked with a toast ("Day N already has 2 hotels").
- The host modal stays open after an add (multi-add). The bottom sheet closes on
  commit or on backdrop tap.

## Behavior rules

- **Add-only, duplicates allowed.** Each commit appends a new session via
  `addSession` (which seeds `PHASE_DEFAULT_TIMES`). A place may appear in multiple
  days/phases. No toggle, no dedupe, no "in plan" disabling.
- **Plan list auto-created silently.** First add for a city with no `mode:'plan'`
  list creates one. No prompt.
- **`activeListId` is NOT changed** by creating/targeting the plan list — the
  Saved tab underneath must not shift. (Differs from `ensureListForMode` /
  `promoteGhost`, which set active.)
- **Feedback:** sonner toast on commit. Session → `Added to Day 1 · Morning`.
  Hotel → `Hotel set · Day 1`.

## Store action

New `useWishlistStore` action:

```
addToPlanSlot({ destination, country, place, category, dayIndex, phase, asHotel, newDay })
  → { listId, dayIndex, phase, asHotel } | null
```

1. Resolve `mode:'plan'` list by `destination` (city-key match). If absent,
   create via the same util used by `createListForDestinationMode`, **without**
   emitting `setActiveListId`.
2. `plan = ensurePlan(list.plan)`. If `newDay`, `plan = setDays(plan, plan.days + 1)`
   and set `dayIndex = plan.days - 1`.
3. `plan = setPlaceSnapshot(plan, place, category)`.
4. If `asHotel`: read current day hotels; if `< 2`, append placeId via
   `setHotelsForDay`; else return null (caller toasts the cap message).
   Else: `plan = addSession(plan, { dayIndex, phase, placeId: place.placeId })`.
5. `next = updatePlanForList({ listId, plan })`; `set({ wishlist: next })`.
6. Cloud emit: `upsertList` if the plan list was newly created, then `updatePlan`.
7. Return slot info for the toast (null if blocked).

Reuses existing helpers from `utils/plan.js` (`ensurePlan`, `setDays`,
`setPlaceSnapshot`, `addSession`, `setHotelsForDay`) and `utils/wishlist.js`
(`updatePlanForList`, plan-list create + city-key lookup). Likely no changes to
those util files beyond exporting a create-without-activate path if one does not
already exist.

## City resolution per surface

- **Saved picker:** the picker is bound to a saved `listId` for a city; use that
  list's `destination` + `country` as the plan target.
- **Detail card:** use the viewport city (`viewportCity` / `viewportCountry`) of
  the detail place.

## New component

`PlanSlotChooser.jsx` — presentational bottom sheet. Props: `dayCount`,
`isHotel`, `hotelFullByDay` (or a `canSetHotel(dayIndex)` check), `onCommit({ dayIndex, phase, newDay })`, `onClose`. Renders day chips + `+ New day`,
phase chips (or hotel button), backdrop. No store access — parent wires commit to
`addToPlanSlot`.

## Files

- `src/components/PlacePickerModal.jsx` — `LightPickerRow` second button +
  `onAddToPlan` passthrough on `PlacePickerModal`.
- `src/components/PlanSlotChooser.jsx` — **new** bottom-sheet chooser.
- `src/components/TabbedPlacesWidget.jsx` — `SavedPlacePicker` wiring (chooser
  state, target city), `PlaceDetail` "Add to Plan" button + chooser, toasts.
- `src/stores/wishlistStore.js` — `addToPlanSlot` action.
- `src/utils/wishlist.js` — only if a create-plan-list-without-activate path must
  be added.
- `src/styles/global.css` — bottom-sheet styles, two-button row rail.

## Edge cases

| Case | Handling |
|------|----------|
| No plan list for city | Auto-create silently, no active change |
| Place already in plan | Allowed — appends another session |
| Hotel row | Chooser shows "Set as hotel · Day N", no phases |
| Day already has 2 hotels | Blocked + toast, sheet stays open |
| `+ New day` at 30-day cap | `setDays` is a no-op; disable the chip at cap |
| Manual place (no live data) | Snapshot from the place object as-is (same as PlanMode) |
| Detail card with no viewport city | Fall back to detail place's own city field if present; else the action is hidden |
| Plan list created mid-session, unsynced | Emit `upsertList` before `updatePlan` |

## Out of scope

- Reordering / scheduling beyond default phase times (edit in Plan tab).
- Removing a place from the plan via these surfaces (Plan tab owns removal).
- Drag-and-drop.
