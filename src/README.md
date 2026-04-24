# `src/` layout

This is the source tree for the game. The directories below describe the *intended* home for each kind of file. Some are empty until the first feature lands in them — that's expected. Don't create a folder until it has a reason to exist, and follow the placement rules when adding new files.

## The Phaser firewall

There is one load-bearing rule:

> Files under `combat/`, `heroes/`, `items/`, `dungeon/`, `events/`, `run/`, `camp/`, `save/`, `data/`, and `util/` **must not import `phaser`**.
>
> Only `main.ts`, `scenes/`, `ui/`, and `render/` may import phaser.

Why: keeps the game logic unit-testable without a browser, keeps Vitest fast, and makes a headless combat simulator trivial to spin up when we want to balance numbers. If you find yourself wanting to `import * as Phaser` inside a "core" folder, stop — the phaser-dependent concern belongs in `scenes/` or `ui/`, and the core folder should expose a plain-TS API that the scene drives.

## Directory map

| Path | Purpose | Example files |
|---|---|---|
| `main.ts` | Phaser.Game config + scene registration. The one entry point. | — |
| `style.css` | Host-page CSS. | — |
| `combat/` | Ranked combat: resolution loop, abilities, AI priority engine, turn order. | `combat.ts`, `ability.ts`, `ability_priority.ts`, `turn_order.ts` |
| `heroes/` | Hero entity, class definitions, leveling, traits. | `hero.ts`, `class.ts`, `leveling.ts`, `trait.ts` |
| `items/` | Gear entities, rarity tiers, stat rolls, gear-modifies-ability rule. | `item.ts`, `rarity.ts`, `gear_mod.ts` |
| `dungeon/` | Zones, floor generation, node graph, scaling rules. | `dungeon.ts`, `floor.ts`, `node.ts`, `scaling.ts` |
| `events/` | Narrative event cards and resolution. (Tier 2) | `event_card.ts`, `event_deck.ts` |
| `run/` | Per-expedition state: pack, current floor, party, cashout / press-on. | `run_state.ts`, `pack.ts`, `camp_screen.ts` |
| `camp/` | Persistent hub state. Roster, vault, stash, building logic, unlocks. | `roster.ts`, `vault.ts`, `stash.ts`, `unlocks.ts`, `buildings/tavern.ts`, etc. |
| `save/` | Persistence and migrations. | `save.ts`, `migration.ts` |
| `data/` | Content as TS modules. **No logic, just data.** | `classes.ts`, `abilities.ts`, `enemies.ts`, `items.ts`, `dungeons.ts`, `events.ts`, `traits.ts`, `perks.ts`, `names.ts` |
| `scenes/` | Phaser scenes — the bridge between core and rendering. One scene per major game screen. | `boot_scene.ts`, `camp_scene.ts`, `dungeon_scene.ts`, `combat_scene.ts`, `camp_screen_scene.ts`, `noticeboard_scene.ts` |
| `scenes/dev/` | Dev-only scenes (sprite explorer, paperdoll demos). Not part of the shipping flow. | `main_scene.ts`, `explorer_scene.ts` |
| `ui/` | Reusable Phaser UI widgets. | `hero_card.ts`, `ability_icon.ts`, `formation_editor.ts`, `pack_panel.ts`, `inventory_panel.ts`, `shop_panel.ts`, `event_card_panel.ts` |
| `render/` | Rendering and sprite-atlas helpers. | `paperdoll.ts`, `paperdoll_layers.ts`, `frames.ts`, `parse_sprite_names.ts`, `sprite_names.generated.ts` |
| `util/` | RNG, math, formatting helpers. | `rng.ts`, `math.ts`, `format.ts` |

## Content is TypeScript

Classes, abilities, enemies, items, events, traits, etc. are defined in TS modules under `data/`. No JSON. You get type safety and hot reload; balance tweaks reload the whole game instantly.

## Tests live in `__tests__/` per domain

Each domain folder that has tests gets a `__tests__/` subdirectory — e.g., `render/paperdoll.ts` is tested by `render/__tests__/paperdoll.test.ts`. Test-support helpers (fixtures, harnesses) can live in the same `__tests__/` folder without polluting the source directory. Vitest picks tests up automatically.

## Generated files

Anything ending in `.generated.ts` is produced by a script under `/scripts/` and should not be edited by hand. Regenerate with the relevant `npm run generate:*` script. The generated file lives wherever its consumer lives (e.g., `render/sprite_names.generated.ts`).

## When to create a new folder

Don't create a folder for a single file. If a concept only has one file right now, put it directly in the relevant domain folder. Once you add a second file in the same sub-concept, promote it to its own folder.

Example: `camp/buildings/` exists because there are many buildings; they belong together. But `save/` starts as just `save.ts` — no subfolder until migrations or other concerns show up.
