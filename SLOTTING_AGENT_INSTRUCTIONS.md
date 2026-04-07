# Slotting Assignment Instructions (For Next AI Agent)

## Goal
Generate or update a mission slotting JSON by assigning **project units** into an existing **in-game slot layout**.

This workflow is iterative: user may add, move, or rebalance units/access after initial assignment. Apply requested changes with minimal collateral edits.

## Terms
- `in-game squad`: Existing squad node in mission JSON (`AR2`, `A23`, etc.).
- `project unit`: External group (`TT`, `ALFA`, `REV`, etc.) placed into mission slots.
- `assigned slot`: Slot occupied by project unit placeholder.
- `free slot`: Slot not occupied by project unit placeholder.

## Rule Priority (When Rules Conflict)
1. Explicit current user request (forced side, forced in-game squad, commander mapping, exact role pattern).
2. Hard Rules in this file.
3. Keep current assignment state (iterative delta updates).
4. Default strategy (proportional balancing/front-load).

## Hard Rules (Do Not Break)
1. Keep mission structure unchanged:
- do not rename/delete sides,
- do not rename/delete in-game squads,
- do not add/remove/reorder slots,
- do not change slot IDs or role names.

2. Every project-unit-assigned slot must be:
- `"access": "unit"`
- `"occupant": { "type": "placeholder", "label": "<PROJECT_UNIT>" }`

3. Never mark assigned project unit slots as `priority` or `regular`.

4. For unassigned slots:
- use valid non-unit access (`priority` or `regular`),
- keep `occupant: null` unless user explicitly asks to preserve existing occupants.

5. Keep unit labels plain (no decoration):
- use `"TT"`, not `"TT (Tester)"`.

6. Every project unit must have an in-game squad anchor:
- each project unit must occupy at least one concrete in-game squad block,
- avoid scattered single-slot placement before establishing at least one anchor block.

7. Iterative updates are delta-first:
- if user asks one change, preserve unrelated assignments,
- rebuild from scratch only if explicitly requested.

8. Explicit directives are mandatory:
- forced side/squad/role pattern/commander rules must be applied exactly.

## Assignment Rules
### A) Side balancing for project units
If user did not force side counts, distribute proportionally:
- `target(side) = round(totalRequestedSlots * sideCapacity / totalCapacity)`
- fix rounding via largest remainder so total matches requested slots exactly.

### B) Front-load inside each side
Fill earlier in-game squads and earlier slot indices first, unless user overrides.

### C) Keep project units together
Keep each project unit contiguous and unsplit when possible.

If split is required:
1. prefer at most 2 neighboring in-game squads,
2. keep split on same side before crossing sides,
3. minimize fragment count.

### D) Squad Leader on split
If a project unit is split, place its `Squad Leader` in the fragment with majority slots.

If tie, use earlier in-game squad.

### E) Role quality for undersized units
If project unit size is smaller than in-game squad capacity:
1. allocate stronger roles first (`Squad Leader`, senior role, MG, assistant, SMG),
2. leave lower-value rifleman roles for overflow,
3. avoid giving high-value roles to non-unit players when project unit still needs slots.

### F) Commander and exact-pattern overrides
Support mission-specific forced rules such as:
1. commander mapping (`US commander = PP`, `KPA commander = RC`),
2. exact slot patterns (example: full HQ + specific top slots + SMG),
3. forced side assignment (`TT` must be on US side).

## Non-Unit Access Rules (`priority` / `regular`)
Apply only after all project units are assigned.

1. Default global split: `priority:regular = 2:1`, unless user requests otherwise.

2. If user asks equal separation between sides:
1. first try equal absolute counts by side,
2. if impossible because free-slot capacities differ by side, keep equal proportion by side and explicitly report feasibility note.

3. If user asks to boost priority in a specific in-game squad (example `A33`):
1. allocate priority there first,
2. rebalance remaining priority elsewhere to preserve global/side policy.

4. Mixed non-unit in-game squads rule:
If an in-game squad contains both `priority` and `regular` (and is not project-assigned), priority should take `Squad Leader` slot first.

## Procedure
1. Parse canonical slotting JSON.
2. Build side capacities and traversal order.
3. Read explicit user directives and lock them.
4. Apply forced assignments first.
5. Place remaining project units by rules above.
6. Apply non-unit access policy (`priority`/`regular`).
7. Validate.

## Validation Checklist (Must Pass)
1. Structure unchanged:
- same sides, same in-game squads, same slot IDs/roles.

2. Count correctness:
- each project unit has exactly requested slot count.

3. Access correctness:
- all project placeholders use `access: "unit"`,
- no project-assigned slot is `priority`/`regular`.

4. Placement correctness:
- front-load respected unless overridden,
- split rules respected,
- Squad Leader placement on splits respected.

5. Explicit directive correctness:
- forced side/squad mappings satisfied,
- commander mappings satisfied,
- exact role-pattern constraints satisfied.

6. Non-unit access correctness:
- requested `priority`/`regular` policy satisfied,
- mixed non-unit in-game squads give SL to `priority`,
- feasibility note provided if exact side equality was impossible.

## Edge Cases
1. Requested total exceeds free capacity:
- fail with clear required/available numbers.

2. Existing `occupant.type === "user"`:
- do not overwrite unless explicitly instructed.

3. Existing placeholders:
- clear and rebuild assignment unless user asks to preserve.

4. Late unit additions (`add RT7`, `add TEST`, etc.):
- add with minimal disruption and revalidate all counts/access policies.

## Review Output (Required)
After generation/update, always provide:
1. project unit -> assigned count,
2. side -> assigned count,
3. split units list,
4. confirmation all project-assigned slots are `access: "unit"`,
5. confirmation in-game structure is preserved,
6. explicit overrides satisfied summary,
7. `priority`/`regular` totals (global and by side),
8. feasibility note if strict side equality was not possible.
