# Shop UI

**Status:** Design · **Date:** 2026-04-28 · **Source:** [`TODO.md`](../../../TODO.md) Cluster B · 3 — gdd §4 + §7 + §10 Tier 2.

## Purpose

Replace the auto-leave stub in `dungeon_scene.ts` with a real shop overlay so the player can see inventory, prices, and click-to-buy. Pairs `EquipPanelScene` from the shop via a small `returnTo` refactor — players can manage gear (equip the item they just bought) before walking to the boss, closing a UX gap that "buy gear, fight boss without it, equip post-fight" creates today. Modal pattern, mirrors `PerkOverlayScene`.

## Dependencies and invariants

**Vocabulary already in place:**
- `Node = combat | boss | shop` (Cluster A · 9). Shop has `inventory: readonly ShopItem[]`.
- `ShopItem = { item, price, sold }` (`src/dungeon/node.ts`).
- `purchaseItem(rs, itemId): RunState` (`src/run/run_state.ts`) — validates 5 pre-conditions; updates inventory + pack atomically.
- `leaveShop(rs): RunState` — advances `currentNodeId` to next.
- Auto-leave stub at `dungeon_scene.ts:232-236` inside `handleArrival()`.
- `EquipPanelScene` (`src/scenes/equip_panel_scene.ts`) — full equip UI, currently launched only from `camp_screen_scene.ts:114`. Hardcodes `scene.resume('camp_screen')` on close.
- `itemDisplayName(item)`, `itemAffixDescription(item)` (`src/items/selectors.ts`) — canonical formatting helpers.
- `BASE_ITEMS[item.baseId].spriteId` — sprite-frame index for items.
- `RARITY_COLOR` map in `equip_panel_scene.ts:32-36` — common `#cccccc`, uncommon `#4488ff`, rare `#ffcc66`. Currently scene-local; this task duplicates rather than extracts (single use elsewhere; refactor noise not worth it).
- `appState.update` is global; cross-scene state is automatic.

**Invariants this spec declares:**
- **Shop overlay is the only "exit" from a shop node.** No close-X / ESC handler. The Leave button calls `leaveShop` and resumes dungeon.
- **`EquipPanelScene` becomes reusable.** Init param `returnTo?: string` defaults to `'camp_screen'` (preserves current call site). Shop launches it with `'shop_overlay'`.
- **Save reload during shop is recoverable.** `currentNodeId` points at shop; `awaitingFork: false`. On reload, `walking_in` tweens party to shop position; `handleArrival` detects shop and re-launches the overlay with the same inventory state (sold items still sold via persisted `ShopItem.sold`).
- **No data changes.** `Hero`, `RunState`, `Pack`, `Node`, `ShopItem` shapes all unchanged.
- **No new tests.** All pure-TS surface is already covered by Cluster A · 9's tests; the new code is Phaser-coupled scene rendering.

## Module layout

| Path | Action | Responsibility |
|---|---|---|
| `src/scenes/shop_overlay_scene.ts` | **Create** | New `Phaser.Scene` subclass `ShopOverlayScene`. Renders header (title + pack gold), 4 item rows, Manage Gear + Leave buttons. Click handlers wire to `purchaseItem`, `leaveShop`, and `EquipPanelScene` launch. ~150 lines. |
| `src/scenes/equip_panel_scene.ts` | **Modify** | Add `init({ returnTo?: string })` accepting an optional return-target scene key; store as instance field; `close()` resumes `this.returnTo` (default `'camp_screen'`). ~5 lines. |
| `src/scenes/dungeon_scene.ts` | **Modify** | Replace auto-leave block in `handleArrival()` with `scene.launch('shop_overlay') + scene.pause()`. Add `Phaser.Scenes.Events.RESUME` handler in `create()` that triggers `setState('walking_to_next')`. |
| `src/main.ts` | **Modify** | Register `ShopOverlayScene` in the scene array (next to other panel/overlay scenes). |

No data, save schema, or run-state changes. No combat or hero changes.

## Schema changes

None. `ShopItem.sold` already persists across save/load. Pack and inventory mutations all flow through `purchaseItem` / `leaveShop` (already shipped).

## Behavior

### Scene flow

1. **Dungeon party walks to shop** (existing `walking_to_next` tween fires after fork pick).
2. **`handleArrival()`** in `dungeon_scene.ts` detects `node.type === 'shop'`. **Replaces** the current auto-leave stub:
   ```ts
   if (node.type === 'shop') {
     this.scene.launch('shop_overlay');
     this.scene.pause();
     return;
   }
   ```
3. **Shop overlay renders.** Modal panel over paused dungeon. Player can buy items (each Buy click calls `purchaseItem` and re-renders the affected row), launch the equip panel, or click Leave.
4. **"Manage Gear" click**: `scene.launch('equip_panel', { returnTo: 'shop_overlay' }); scene.pause();`. Equip panel runs over paused shop. On equip-panel close, `scene.resume('shop_overlay')` fires; shop's RESUME handler re-renders pack-gold + rows.
5. **"Leave" click**: `appState.update(s => ({ ...s, runState: leaveShop(s.runState!) })); scene.stop(); scene.resume('dungeon');`.
6. **Dungeon `RESUME`** handler (new) detects resume, refreshes HUD, calls `setState('walking_to_next')` — party walks from shop position to boss position; `handleArrival` fires; boss combat starts.

### Save reload during shop

`appState.update` from `purchaseItem` persists each buy immediately. If the player reloads mid-shop:
- `currentNodeId` = shop node id.
- `awaitingFork: false`.
- Inventory has any prior `sold: true` flips persisted.

On reload, `dungeon_scene.create()` runs `setState('walking_in')`. Party tweens to shop position. `handleArrival` detects shop; relaunches overlay; overlay reads current inventory (with sold items) and renders correctly.

### Shop overlay layout

Modal panel `680×360` centered at `(480, 270)`, dim background `0x000000` at `alpha 0.6` covering the canvas, click-blocking via `setInteractive`.

**Header (y = 90 panel-internal, y_canvas ≈ 150):**
- "Shop" — 18px monospace, white, left-anchored at panel x ≈ 160.
- "Pack: ${gold}g" — 14px, gold `#ffcc66`, right-anchored at panel x ≈ 800.

**Item rows** — 4 rows, ~52 px each, starting at y_canvas ≈ 175:
- **Sprite**: `add.sprite(rowX, rowY, 'sprites', parseInt(BASE_ITEMS[item.baseId].spriteId, 10)).setScale(2)` — 32×32 px on the left at panel x ≈ 175.
- **Display name**: 14px monospace, color from `RARITY_COLOR[item.rarity]`. Uses `itemDisplayName(item)`. Anchored at panel x ≈ 215, vertically centered with the sprite.
- **Affix line**: 11px monospace, color `#aaaaaa`. Uses `itemAffixDescription(item)`. Empty string → don't render. One line below the name.
- **Price/state** — right-aligned at panel x ≈ 790, 14px monospace:
  - `sold === true`: `"SOLD"` in grey `#666666`.
  - `pack.gold < price`: `"${price}g"` in red `#cc6666`.
  - Affordable: `"${price}g"` in gold `#ffcc66`.

**Row interactivity:**
- Invisible bg rectangle behind the row (panel-width minus padding × row-height) handles pointer events.
- `pointerover`: 1px stroke `0xffcc66`, cursor `useHandCursor: true` — only when affordable + not sold.
- `pointerout`: stroke removed.
- `pointerdown`: only when affordable + not sold. Calls `onBuy(itemId)`.

**Footer (y_canvas ≈ 425):**
- `[ Manage Gear ]` — center at x = 380, size 140×32. `pointerdown` → `onManageGear()`.
- `[ Leave ]` — center at x = 580, size 140×32. `pointerdown` → `onLeave()`. Stroke gold `#ffcc66`.

Both buttons use the gold-bordered "primary" style matching Tavern's Hire button (`stroke 2px #44cc44` for affordable, `#555555` for disabled — neither button gets disabled in this UI).

### Click handlers

```ts
private onBuy(itemId: string): void {
  appState.update((s) => ({ ...s, runState: purchaseItem(s.runState!, itemId) }));
  this.rerender();
}

private onManageGear(): void {
  this.scene.launch('equip_panel', { returnTo: 'shop_overlay' });
  this.scene.pause();
}

private onLeave(): void {
  appState.update((s) => ({ ...s, runState: leaveShop(s.runState!) }));
  this.scene.stop();
  this.scene.resume('dungeon');
}
```

`rerender()` destroys the current row containers and rebuilds them from the current `runState`'s shop inventory + pack gold. Simple full re-render is fine for 4 rows.

The shop scene also needs a `Phaser.Scenes.Events.RESUME` handler (fires when equip-panel closes back to shop): re-render to pick up any pack-gold changes. (Equip-panel doesn't actually change gold, but a re-render is cheap and future-proof.)

### `EquipPanelScene` refactor

```ts
export class EquipPanelScene extends Phaser.Scene {
  // existing fields…
  private returnTo: string = 'camp_screen';

  constructor() {
    super('equip_panel');
  }

  init(data: { returnTo?: string } = {}): void {
    this.returnTo = data.returnTo ?? 'camp_screen';
  }

  // existing create / etc, unchanged…

  private close(): void {
    this.scene.stop();
    this.scene.resume(this.returnTo);
  }
}
```

Existing call site at `camp_screen_scene.ts:114` (`this.scene.launch('equip_panel')`) keeps working via the default. New call site in shop overlay passes `{ returnTo: 'shop_overlay' }`.

### Dungeon scene RESUME handler

`dungeon_scene.ts` `create()` adds:

```ts
this.events.on(Phaser.Scenes.Events.RESUME, () => {
  this.refreshHud();
  this.refreshNodeColors();
  this.refreshStatusBar();
  this.setState('walking_to_next');
});
```

After the shop overlay's Leave runs `leaveShop` and stops the overlay, this handler fires on the dungeon scene, refreshes the visible state, and triggers `walking_to_next`. The tween moves the party from shop position to boss position; `handleArrival` detects boss and starts combat.

This RESUME handler also fires if any other overlay/panel-style scene resumes the dungeon. Not a concern in current code — only shop_overlay launches over the dungeon. Future overlays (event UI, mid-floor camp UI) would also trigger this; if any need a different post-resume action, gate this handler on a check.

## Tests

**No new tests.** All pure-TS shop surface (`generateShop`, `purchaseItem`, `leaveShop`) is covered by the Cluster A · 9 test suite. The new code is:
- Phaser scene rendering — untested by repo convention.
- A 5-line `init` refactor on `EquipPanelScene` — verified by tsc + the existing camp-screen flow continuing to work.
- One RESUME-handler line on `DungeonScene` — verified by manual smoke.

**Manual smoke checklist:**
1. `npm run dev`, run Crypt floor 1, fork picker shows 🛒 on one branch.
2. Click shop branch → party walks to shop position → shop overlay appears showing 4 items + pack gold.
3. Click an affordable item → gold deducts, row flips to "SOLD", row becomes non-interactive.
4. Click an unaffordable item → no-op.
5. Click "Manage Gear" → equip panel launches. Equip a bought item on a hero. Click the equip panel's X → shop overlay returns; pack-gold display reflects the (unchanged) gold value.
6. Click "Leave" → shop closes, party walks to boss, boss combat starts.
7. Save mid-shop (after buying one item), reload → walking_in animates to shop position, shop overlay re-launches; previously-sold item still shows "SOLD".
8. Click "Manage Gear" from camp_screen post-boss → equip panel still works (default `returnTo: 'camp_screen'` preserved).

## Out of scope

- **Tooltips on hover.** Item info is shown directly in each row; no hover preview.
- **Stat-preview at shop time.** Player buys for the pack, not directly to a hero. Preview happens later via the equip-panel flow (Manage Gear button).
- **Sell-back.** No way to sell items at the shop. Buy-only.
- **Restock after purchase.** Once `sold: true`, the slot stays sold for this floor.
- **Bulk buy / spend-all.** No "buy everything affordable" shortcut.
- **Discount events / haggling.** Static prices with the existing ±15% RNG variance from generation.
- **Gold-display on the icon row.** The dungeon scene's HUD already shows pack gold; no need to duplicate inside the overlay header beyond the prominent display already specified.

## Surprises / call-outs

- **`EquipPanelScene` returnTo refactor is the smallest change with the biggest reuse benefit.** Five-line addition (`init` + field + return value); zero callers needed updates because the default preserves existing behavior. Future overlays that want gear access (Hospital? Blacksmith?) drop in with a one-line param.
- **No close-X / ESC on the shop overlay.** Matches the perk-picker pattern. The player must click Leave to advance — explicit confirmation that they're done shopping. Prevents "I accidentally Esc'd out and lost my shop chance" moments.
- **Save during the equip-panel-over-shop nesting** is a real edge case. `appState.update` persists during equip panel use too (when items are equipped/unequipped). On reload, `currentNodeId` points at the shop, so the dungeon's `handleArrival` re-launches the shop overlay — but the equip panel's nested-launch state is lost. Player has to click "Manage Gear" again to re-enter equip mode. **Acceptable** because the equip panel itself doesn't persist UI state (selection, page) across launches; it always opens fresh. So the loss is "you have to click Manage Gear again," not "you lost progress."
- **The dungeon's RESUME handler is generic.** Any future overlay that pauses the dungeon will trigger `walking_to_next` on resume. For shop, this is correct (the overlay's Leave already advanced `currentNodeId`). Future overlays that don't want to walk-on-resume need either a different exit pattern or a guard in the handler. Not a concern in this task.
