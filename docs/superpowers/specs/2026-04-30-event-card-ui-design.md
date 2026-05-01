# Event card UI — Design

- **TODO entry:** Cluster B · 5 (Event card UI).
- **Tier:** 2.
- **Date:** 2026-04-30.

## 1 · Scope

Replace the auto-skip event-node stub in `dungeon_scene.ts` with a real overlay scene. When the player walks onto an event node, an overlay opens with the card body and two choice buttons. Choices apply via `applyEventChoice` (already shipped in Cluster A · 13). For choices that include the `lose_hero` payload, a sub-state hero-picker appears between choice click and resolution. After resolution, an outcome panel shows what changed; the player clicks Dismiss to advance.

A pre-existing latent bug — `dungeon_scene.buildParty()` is only called once on scene `create()`, so mid-scene party changes leave stale paperdolls in the row — is fixed in scope. Two call sites add a `rebuildParty()` invocation; this fixes both the new event-induced Lost-hero path and the existing combat-Fallen path.

**Out of scope:**

- Card art / illustrations (text-only cards).
- Animations or fade transitions on state swaps (each state rebuilds via removeAll + redraw, same as `camp_node_overlay`).
- Per-hero filtering on the picker (e.g. "can't pick the lowest-HP hero" — all party members are equally pickable).
- Edge case where a `lose_hero` payload would drop the party to size 0 (currently impossible: the only mid-run hero loss is Lost itself, which is what we're shipping; Fallen happens in combat which has its own wipe handling).
- Card-specific imagery for the picker title (v1 hardcodes "Pick a hero to be Lost." since `lose_hero` is the only payload that triggers the picker).

## 2 · Decisions

| Decision | Choice | Reasoning |
|---|---|---|
| Architecture | Single overlay scene with state machine | Mirrors `camp_node_overlay_scene.ts`. Three states (`'card'` / `'hero_picker'` / `'outcome'`) with Back navigation. |
| Hero-picker UX | Sub-state inside the overlay | Pattern-consistent with camp-node treat picker. Back button means accidental click recoverable. |
| Outcome detail | Per-hero / per-line with rarity color, Lost-purple, signed gold delta | Events are story beats; the player just made a meaningful choice and deserves to see the math. Data is right there in `EventOutcome`. |
| ESC at card stage | Disabled — events are mandatory | Decline is a button on cards that have a no-payload choice; ESC-as-Decline-shortcut is a footgun for cards where choice 1 isn't no-op. |
| Persistence | Apply choice and advance `currentNodeId` atomically; outcome panel is informational | Same policy as camp-node and shop. If browser refreshes mid-outcome, dungeon reopens at next node — outcome readout lost, state consistent. |
| RNG source | `runRngState` via `createRngFromState` | Same convention as camp_node_overlay; event-resolver consumes RNG (via `add_item`'s `rollEventItem`); persisted RNG keeps run determinism intact. |
| `rebuildParty()` fix | Included in scope | Without it, Lost heroes ghost as stale paperdolls. Same call lands on the latent combat-Fallen bug as a side effect (single small method, two call sites). |

## 3 · State machine

| State | Renders | Exits via |
|---|---|---|
| `'card'` | Card body (word-wrapped), 2 choice buttons stacked vertically with label + payload-preview subtitle | Click choice 0 / 1 → if has `lose_hero`: `'hero_picker'`; else: `applyChoice` and `'outcome'`. ESC disabled. |
| `'hero_picker'` | Title "Pick a hero to be Lost.", 3 hero rows (paperdoll + name + HP), Back button at top-right | Click hero → `applyChoice(choiceIndex, selectedHeroIndex)` and `'outcome'`. Back / ESC → `'card'`. The choice index is stored in scene state so Back returns to the same card without losing context. |
| `'outcome'` | Per-line outcome detail, Dismiss button | Dismiss / ESC → `closeAndAdvance()` (scene.stop + scene.resume('dungeon')). |

State transitions are driven by a `setOverlayState(s)` method that invokes `rerender()` — same shape as `camp_node_overlay_scene.ts`.

## 4 · Apply-choice flow (atomic persist + advance)

```ts
private applyChoice(choiceIndex: 0 | 1, selectedHeroIndex?: number): void {
  const initialRs = appState.get().runState!;
  const node = currentNode(initialRs);
  if (node.type !== 'event') {
    throw new Error(`event_overlay: applyChoice called when current node is '${node.type}'`);
  }

  const card = EVENTS[node.cardId];
  const args = selectedHeroIndex !== undefined ? { selectedHeroIndex } : {};
  const rng = this.rng();  // createRngFromState(appState.get().runRngState!)
  const result = applyEventChoice(initialRs, card, choiceIndex, args, rng);
  const advanced = chooseNextNode(result.runState, node.nextNodeIds[0]);

  appState.update((s) => ({
    ...s,
    runState: advanced,
    runRngState: rng.getState(),
  }));

  this.lastOutcome = result.outcome;
  this.setOverlayState('outcome');
}

private closeAndAdvance(): void {
  this.scene.stop();
  this.scene.resume('dungeon');
  // Dungeon's RESUME handler runs refreshHud + refreshNodeColors + refreshStatusBar
  // + the new rebuildParty(), then setState('walking_to_next').
}
```

`node.nextNodeIds` always has exactly one entry for event nodes (events live on branch arms, not at fork positions; the fork's parent node owns the multi-branch entries). Using `[0]` is unconditionally correct.

## 5 · Outcome panel rendering

Composed top-to-bottom from `lastOutcome`. Empty outcome (Decline with no-payload choice) shows "Nothing happened.".

| Outcome field | Rendering |
|---|---|
| `hpChanges: [{heroIndex, delta}, ...]` | One line per affected hero: `"{name}: {sign}{delta} HP"`. Green `#44cc44` for positive delta, pink `#cc6666` for negative. Ordered by `heroIndex`. |
| `goldDelta: number` | Single line: `"+150g"` (green) or `"-80g"` (pink). |
| `itemAdded: Item` | Single line: `"Got: {itemDisplayName(item)}"` colored by rarity (reuses the `RARITY_COLOR` map literal — same `#cccccc / #4488ff / #ffcc66` triple used in equip_panel and blacksmith_panel). Affixes shown as a sub-line in muted text via `itemAffixDescription`. |
| `heroLost: { heroName }` | Single line in Lost-purple `#aa66aa`: `"{heroName} is Lost."` Same color used in the wipe-panel and cashout-summary Lost-section headers. |

Below the lines, a centered Dismiss button (gold accent, ~200×36, mirrors camp_node's Confirm button styling).

## 6 · Card-stage rendering

- **Body text** word-wrapped at ~400px line width, 14px monospace, white. Top of panel.
- **Two choice buttons** stacked vertically (~440×64 each), centered. Each button shows:
  - **Label** (white, 14px bold) — e.g., "Bleed and pass"
  - **Subtitle** (muted text, 11px) — payload preview, joined by " · "
- **No close-X** in this state.

### 6.1 · `describePayload` helper

Lives in `src/data/events.ts` (pure-TS, no Phaser). Renders one payload to a player-facing short string. Used by the card-stage subtitle.

```ts
export function describePayload(payload: EventPayload): string {
  switch (payload.kind) {
    case 'hp_delta_party': {
      const pct = Math.abs(Math.round(payload.percent * 100));
      return payload.percent >= 0 ? `Party heals ${pct}% HP` : `Party loses ${pct}% HP`;
    }
    case 'gold_delta':
      return payload.amount >= 0 ? `+${payload.amount}g` : `${payload.amount}g`;
    case 'add_item':
      return `Gain a ${payload.rarity} item`;
    case 'lose_hero':
      return 'Lose a hero';
  }
}
```

For a choice with empty payloads (Decline), the subtitle is the literal string `"Walk away"`. Generated in the scene, not `describePayload` (which expects an actual payload).

**Expected outputs for representative payloads:**

| Payload | Output |
|---|---|
| `{kind:'hp_delta_party', percent:-0.20}` | `Party loses 20% HP` |
| `{kind:'hp_delta_party', percent: 0.25}` | `Party heals 25% HP` |
| `{kind:'gold_delta', amount: 150}` | `+150g` |
| `{kind:'gold_delta', amount: -80}` | `-80g` |
| `{kind:'add_item', rarity:'rare'}` | `Gain a rare item` |
| `{kind:'lose_hero'}` | `Lose a hero` |

## 7 · Hero-picker rendering

- **Title:** centered "Pick a hero to be Lost."
- **Choice index stored in scene state** before transitioning to `'hero_picker'` so the picker knows which choice to apply when a hero is clicked.
- **3 hero rows** (per `runState.party`), each ≈70px tall, showing:
  - **Paperdoll thumbnail** (left) — `new Paperdoll(this, x, y, heroToLoadout(hero))` at scale 2. Same render path used by `dungeon_scene.buildParty` and the camp-node treat-picker hero rows.
  - **Name + HP** (center) — name on top line (white, 14px), `"{currentHp}/{maxHp} HP"` on a sub-line (muted text, 11px).
  - **Pick button** (right) — green accent (`0x335533` bg, `0x66aa66` stroke), label "Pick".
- **Back button** at top-right (same `BACK_X = 720, BACK_Y = TITLE_Y` constants as camp_node_overlay).

If party.length drops below 3 (e.g., a future combo where Lost happens twice in one floor), the picker just shows the remaining heroes — no special handling needed; `runState.party` is the source of truth.

## 8 · `rebuildParty()` fix in dungeon_scene

```ts
private rebuildParty(): void {
  const x = this.partyContainer.x;
  this.partyContainer.destroy();
  this.buildParty();
  this.partyContainer.x = x;
}
```

Call sites added:

- **RESUME handler** (`src/scenes/dungeon_scene.ts` ~line 76–81). After the existing `refreshHud / refreshNodeColors / refreshStatusBar`, before `setState('walking_to_next')`. Handles the event-overlay close path (and is harmless for shop/camp_node overlay closes since party.length doesn't change there — buildParty re-renders the same 3 paperdolls).
- **`processCombatReturn`** (~line 113–117). After the existing refresh trio. Fixes the latent combat-Fallen visual bug: a hero who Falls but the party survives currently leaves a paperdoll behind in the row.

`buildParty` already reads `runState.party` and `runState.lost` correctly (post-Cluster B · 11), so no changes to its body — only its callability.

## 9 · Replacing the auto-skip stub

Current code in `src/scenes/dungeon_scene.ts:264-277`:

```ts
if (node.type === 'event') {
  // Stub: auto-skip until Cluster B · 5 ships the event overlay.
  // ...
  appState.update((s) => ({
    ...s,
    runState: chooseNextNode(s.runState!, node.nextNodeIds[0]),
  }));
  this.refreshHud();
  this.refreshNodeColors();
  this.refreshStatusBar();
  this.setState('walking_to_next');
  return;
}
```

Replaced with:

```ts
if (node.type === 'event') {
  this.scene.launch('event_overlay');
  this.scene.pause();
  return;
}
```

Same call shape as the existing shop / camp_node branches.

## 10 · Files touched

| File | Change |
|---|---|
| `src/scenes/event_overlay_scene.ts` | **New.** The overlay scene class. |
| `src/data/events.ts` | Add `describePayload(payload): string` exported helper. |
| `src/data/__tests__/events.test.ts` | Extend with `describePayload` tests covering all 4 payload kinds. |
| `src/scenes/dungeon_scene.ts` | Replace the `node.type === 'event'` stub block with the launch call. Add `rebuildParty()` private method. Call it from the RESUME handler and from `processCombatReturn`. |
| `src/main.ts` | Import `EventOverlayScene`; add to scene array (alongside `CampNodeOverlayScene` and `ShopOverlayScene`). |

## 11 · Save schema

No change. `runState` and `runRngState` are existing persisted state with existing operations (`appState.update`, `chooseNextNode`, `applyEventChoice`).

## 12 · Test plan

**Data layer (`src/data/__tests__/events.test.ts` extension):**

- `describePayload` for `{kind:'hp_delta_party', percent:-0.20}` → `'Party loses 20% HP'`
- `describePayload` for `{kind:'hp_delta_party', percent: 0.25}` → `'Party heals 25% HP'`
- `describePayload` for `{kind:'gold_delta', amount: 150}` → `'+150g'`
- `describePayload` for `{kind:'gold_delta', amount: -80}` → `'-80g'`
- `describePayload` for `{kind:'add_item', rarity:'common'}` → `'Gain a common item'`
- `describePayload` for `{kind:'add_item', rarity:'uncommon'}` → `'Gain an uncommon item'` *(see ambiguity note below)*
- `describePayload` for `{kind:'add_item', rarity:'rare'}` → `'Gain a rare item'`
- `describePayload` for `{kind:'lose_hero'}` → `'Lose a hero'`

**Ambiguity note.** Should "uncommon" use `"an"` or `"a"`? Strict English: "an uncommon" (vowel sound). Strict implementation simplicity: always "a". Decision: use `"a"` uniformly — `"Gain a uncommon item"` is mildly grammatically off but a single-rule renderer is clean and the player is unlikely to notice. (The alternative — a one-character-vowel-sound check — adds complexity for marginal gain.) Test asserts `'Gain a uncommon item'`.

**Scene layer:** no automated tests (Phaser convention). Manual play verification — and importantly, this is the first task that exercises Lost-hero rendering through actual gameplay (Cluster B · 11's verification was hand-crafted-state-only).

Manual play checks:

- Walk onto event node; overlay opens with body + 2 choice buttons.
- Click a no-payload Decline → outcome panel "Nothing happened." → Dismiss → walks to next node.
- Click a choice with `hp_delta_party` → outcome shows per-hero HP deltas → Dismiss → next node; party HP reflects the change.
- Click a choice with `gold_delta` → outcome shows signed gold delta → pack gold updates.
- Click a choice with `add_item` → outcome shows item line with rarity color and affixes → pack contains the new item (verify via Equip panel).
- Click a `lose_hero` choice → hero picker appears → click hero → outcome shows "{name} is Lost." in purple → Dismiss → party row shows 2 paperdolls + 🪦 tombstone.
- Back button on hero picker → returns to card; clicking the other choice still works.
- ESC on card → no-op (events mandatory).
- ESC on outcome panel → same as Dismiss.
- ESC on hero picker → returns to card.
- Browser refresh mid-card → dungeon reopens, event still pending (since persistence happens at apply, not at open). Overlay re-launches.
- Browser refresh mid-outcome → dungeon reopens at next node (state was committed). Outcome readout lost; party row reflects the post-event state (including any Lost hero).
- Combat-fallen hero (party survives) → after returning to dungeon, party row shows 2 paperdolls (regression test for the bundled `rebuildParty()` fix).

## 13 · Open questions

None. Layout constants / colors / button styles all reuse existing literals from `camp_node_overlay_scene.ts` (panel chrome, button styling, Back-button position) and `equip_panel_scene.ts` (rarity color triple).
