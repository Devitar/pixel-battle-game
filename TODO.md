# TODO

The actionable backlog. Every entry should carry enough context that a fresh session can pick it up without clarifying questions.

Priority is implicit in ordering: items higher in the file are higher priority. When a task is completed, move its entry to [`HISTORY.md`](HISTORY.md) with decision context added — don't leave it here.

## Format

One section per task.

```markdown
### Short task title

- **What:** the task in one line
- **Why:** the motivation — what this unblocks or improves
- **Tier:** 1 / 2 / 3 (per `gdd.md §10`)
- **Acceptance:** bullet list of "done when…" criteria, or implementation hints
- **Touches:** key files/folders expected to change (optional)
- **Source:** `bugs.md` / `ideas.md` / design note / ad-hoc (optional)
```

---

<!-- Add tasks below this line. Highest priority at the top. -->

## Cluster A — Foundation (pure TypeScript, no Phaser)

Nothing in this cluster should import `phaser`. All of it must be unit-testable via Vitest.

---

## Cluster B — Scenes & UI (Phaser)

Everything in this cluster may import `phaser`. Core logic lives in Cluster A modules; scenes only orchestrate and render.

### 19 · Enemy art for Crypt

- **What:** Produce sprites for the 4 Crypt enemy types + 1 boss. Placeholder reuse of existing NPC frames is acceptable for Tier 1; bespoke pixel art can come later.
- **Why:** Combat scene needs enemy sprites. Without this, enemies are unrenderable.
- **Tier:** 1
- **Acceptance:**
  - Every enemy id referenced by `data/enemies.ts` maps to a valid sprite frame — either new pixels drawn in LibreSprite or reuse of existing NPC frames from the catalog.
  - `spritenames.txt` updated with the new / mapped entries; `npm run generate:names` run and output committed.
  - Boss is visually distinguishable (scaled up, unique frame, or outlined).
- **Touches:** `public/assets/sprites/base_sprites.png` (if drawing), `spritenames.txt`, `src/render/sprite_names.generated.ts` (regenerated).
