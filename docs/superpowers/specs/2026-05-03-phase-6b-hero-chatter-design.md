# Phase 6b — Hero Chatter Design

**Status:** Locked design (brainstormed 2026-05-03). Layers onto Phase 6a's per-step travel-scene infrastructure. Phase 6c (surprise encounters) builds on the same per-step framework.

## §1 — Overview

Phase 6b adds class-specific, state-aware speech bubbles that fire probabilistically during travel. Pure flavor — no mechanical impact on gameplay. Each chatter event displays a brief speech bubble above one of the three traveling heroes, with line content drawn from a per-class, per-condition pool defined in TypeScript data.

## §2 — Locked design

### §2.1 Content shape

- **Class-specific + state-aware.** Each of the 6 classes (knight, archer, priest, barbarian, rogue, mage) has its own line pool. Lines within a class are tagged by hero condition.
- **Three conditions** (precedence order — first match wins):
  - `critical`: `currentHp < maxHp * 0.3` (regardless of wounds)
  - `wounded`: `wounds.length > 0` (and not critical)
  - `healthy`: default
- **Initial line count:** ~3 lines per (class, condition) bucket = 6 × 3 × 3 = **~54 lines total**. The data structure supports any count per bucket; ~3 is the launch target. More can be added incrementally.

### §2.2 Cadence per edge

- **Probability of any chatter firing:** 70% per edge. Roll once per travel.
- **If chatter fires:** randomly choose step 2 or step 4 as the timing slot (50/50). HP tick at step 3 is unaffected — chatter and HP tick are mutually exclusive in time.
- **Speaking hero:** randomly chosen from the current party (uniform across the 3 heroes). Each hero has equal chance regardless of class or condition.
- **No repeat-avoidance:** randomly pick a line from the chosen hero's (class, condition) bucket each time. Repeats are acceptable; the line pool is large enough that repeats within a single 24-edge run are rare (~17 chatter events per run).

### §2.3 Selection algorithm

```
on each edge travel start (in TravelScene.create):
  if Math.random() >= 0.7: return  // 30% chance: silent edge
  step = Math.random() < 0.5 ? 2 : 4
  heroIndex = Math.floor(Math.random() * party.length)
  hero = party[heroIndex]
  condition = computeChatterCondition(hero)  // 'critical' | 'wounded' | 'healthy'
  pool = CHATTER[hero.classId][condition]
  line = pool[Math.floor(Math.random() * pool.length)]
  scheduleChatterAt(step, heroIndex, line)
```

Uses `Math.random()`, not the run RNG. Rationale: pure flavor, no gameplay state mutation, no save-determinism value worth threading runRngState through the travel scene. Reload during travel may show different chatter — acceptable trade-off.

### §2.4 Visual presentation

- **Speech bubble** rendered as a rounded rectangle (Phaser `Graphics` for rounded corners + `Text` for content) added as a CHILD of the hero's container in `TravelScene` — so the bubble follows the hero as they walk.
- **Position:** above the hero's head, vertically offset by `-(HERO_BODY_HALF * 2 + 16)` from container origin. Horizontally centered on the hero.
- **Background:** light cream color (`#f4ecd8`) with a thin dark border (`0x2a2020`); small triangular tail pointing down to the hero. Width sized to text content + padding (~6px horizontal, ~4px vertical).
- **Text:** dark color (`#2a2020`), monospace 10px, italic, single-line (lines should fit within ~140px width — if longer, line wrap; spec lines stay short).
- **Animation:**
  - Fade in: 150ms, ease `Cubic.easeOut`.
  - Hold: 2000ms (scaled by `walkSpeed` — at 3× speed, hold = ~667ms).
  - Fade out: 250ms, ease `Cubic.easeIn`.
  - Total lifetime: ~2400ms at 1× speed (~800ms at 3×).
- **Destruction:** `onComplete` of fade-out tween destroys the bubble + text.

### §2.5 Module structure

| Path | Action | Responsibility |
|---|---|---|
| `src/data/chatter.ts` | **Create** | The `CHATTER` line data table (`Record<ClassId, Record<ChatterCondition, readonly string[]>>`); the `ChatterCondition` type; a `computeChatterCondition(hero)` helper that returns the condition for a hero. ~80 lines (mostly content). |
| `src/data/__tests__/chatter.test.ts` | **Create** | Unit tests: every (class, condition) bucket has ≥1 line; `computeChatterCondition` returns `critical`/`wounded`/`healthy` correctly per HP and wounds. ~50 lines. |
| `src/scenes/travel_scene.ts` | **Modify** | Roll for chatter in `create()` after building heroes; schedule via `time.delayedCall` (so it fires at the chosen step time scaled by walkSpeed). New private method `spawnChatterBubble(heroIndex, line)`. ~60 lines added. |
| `TODO.md` | **Modify** | Mark Phase 6b ✅. |
| `HISTORY.md` | **Modify** | Slim entry. |

### §2.6 Edge cases

- **Party of fewer than 3 heroes** (e.g., one fell in earlier combat): random pick from `party.length` choices. Still works.
- **Hero has no equipment / unusual state:** content is class+condition only; equipment doesn't affect chatter selection.
- **Speed toggle mid-travel:** chatter is scheduled with `time.delayedCall(timeUntilStep / walkSpeed, ...)` at travel start. A mid-travel speed toggle does NOT retroactively reschedule (matches the same trade-off as walk-speed in Phase 6a).
- **Travel is interrupted (e.g., wipe in surprise encounter — Phase 6c future):** scheduled chatter that hasn't fired is harmless (the scene is destroyed; `delayedCall` callbacks on destroyed scenes are no-ops in Phaser). No special cleanup needed.
- **Critical hero has no wound but low HP:** `critical` condition, drawn from the critical bucket. Precedence ensures HP-based critical trumps wound-based wounded.

## §3 — Content authoring

Initial lines will be drafted by Claude during implementation. The user reviews the line content (in `src/data/chatter.ts`) before merge. Lines can be tuned post-launch without code changes — the data module is the single source of truth.

**Tone guidance per class** (rough sketch — finalized during implementation):
- **Knight:** stoic, dutiful, leaderly. Healthy: "Forward." Wounded: "I've had worse." Critical: "Hold me up..."
- **Archer:** wry, observant, alert. Healthy: "Quiet, isn't it?" Wounded: "This will scar." Critical: "Cover me..."
- **Priest:** pious, hopeful, fearful when low. Healthy: "May the light guide us." Wounded: "I bear it gladly." Critical: "Forgive my weakness..."
- **Barbarian:** brash, eager, undeterred. Healthy: "More! More foes!" Wounded: "A scratch." Critical: "I... will not... fall..."
- **Rogue:** quiet, sardonic, pragmatic. Healthy: "Watch your step." Wounded: "Shouldn't have done that." Critical: "Need... a moment."
- **Mage:** scholarly, curious, spent when low. Healthy: "Curious markings here." Wounded: "My focus wavers." Critical: "The spell... fades..."

Lines stay short (≤30 chars typical) so the speech bubble doesn't dominate the scene.

## §4 — Out of scope

- **Repeat-avoidance / chatter history.** First version uses random-with-replacement. If chatter feels repetitive after playtesting, a per-run "recently-spoken" tracker can be added later.
- **State-aware beyond HP/wounds.** No conditions for `near_boss`, `heavy_pack`, `after_loot`, etc. Could be added in a 6b.5 polish.
- **Hero-trait-aware chatter.** Trait IDs (e.g., `'quick'`) are NOT considered in selection; condition is class+HP+wounds only. Adding trait awareness would multiply the bucket count; defer.
- **Run-RNG-driven selection.** Math.random for now; switch to run RNG only if save-determinism becomes a real testing pain point.
- **Sound effects.** No audio in this phase.

## §5 — Test surface

**Pure-TS unit tests (`src/data/__tests__/chatter.test.ts`):**
- Every (class, condition) bucket exists and has ≥1 line (catches data errors)
- `computeChatterCondition` returns `'critical'` when `currentHp / maxHp < 0.3` regardless of wounds
- `computeChatterCondition` returns `'wounded'` when `wounds.length > 0` and not critical
- `computeChatterCondition` returns `'healthy'` when no wounds and HP ≥ 30%
- Boundary: `currentHp / maxHp === 0.3` exactly returns `'wounded'` (per the strict `<` in the threshold)

**Scene-level:** visual smoke test only (consistent with existing Phaser-scene testing pattern). No new scene unit tests.

## §6 — Open questions

None. Design is locked through brainstorm dialogue (2026-05-03).
