# Bugs

Unscoped bug reports captured during testing. When an item is ready, scope it into an actionable [`TODO.md`](TODO.md) entry and remove it from here.

## Format

One section per bug. Keep it terse — this is a triage bin, not a formal tracker.

```markdown
### Short bug title

- **What:** one-line description of the wrong behavior
- **Repro:** minimum steps to see it
- **Expected:** what should happen
- **Seen:** date, commit SHA, browser/resolution if it matters
- **Notes:** screenshots, console output, suspicions (optional)
```

---

<!-- Add bugs below this line. Newest at the top. -->

### "Results" modal after a combat does not indicate deceased party members

### Save loader silently discards old-version saves

- **What:** When a save's `version` is older than `CURRENT_SCHEMA_VERSION` and no migration is registered for that version, `migrate()` returns `null` and `load()` returns `null` without emitting a `console.warn`. The boot scene then generates a fresh save with no indication that an old save was thrown away.
- **Repro:** With `CURRENT_SCHEMA_VERSION = 2`, plant `localStorage.setItem('pixel-battle-game/save', JSON.stringify({ version: 1, roster: {}, vault: {}, unlocks: {} }))` and reload. Old save vanishes; no console message.
- **Expected:** A `console.warn` like `load: discarding save with unsupported version 1 (current is 2)` so the discard is visible during real player support and during dev when the schema bumps.
- **Seen:** 2026-04-26, post-7-stat-model schema bump (commit pending). Surfaced via Claude-in-Chrome browser smoke test of the v1-discard path.
- **Notes:** The other null-return paths in `load()` (corrupt JSON, shape mismatch, future version, paired-rng-state violation) all warn — only the no-migration-registered path is silent. One-line fix in `src/save/save.ts:load` after `if (!migrated) return null;` block. Currently a non-issue because the user is the only player and discards are intentional, but worth fixing before launch when player saves are real.
