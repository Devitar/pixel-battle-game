import { describe, it, expect } from 'vitest';
import { ENEMY_VISUALS } from '../enemy_sprites';

describe('ENEMY_VISUALS.bone_lich', () => {
  it('uses the bespoke boss sprite, not the paperdoll body', () => {
    const lich = ENEMY_VISUALS.bone_lich;
    expect(lich.bossSprite).toBe(0);
    expect(lich.bodyFrame).toBeUndefined();
  });

  it('has no paperdoll overlay slots set', () => {
    const lich = ENEMY_VISUALS.bone_lich;
    expect(lich.outfit).toBeUndefined();
    expect(lich.weapon).toBeUndefined();
    expect(lich.hat).toBeUndefined();
    expect(lich.legs).toBeUndefined();
  });

  it('overrides body scale to 3 for boss-sized rendering', () => {
    expect(ENEMY_VISUALS.bone_lich.bodyScale).toBe(3);
  });
});

describe('ENEMY_VISUALS minions', () => {
  it('still use a bodyFrame and no bossSprite', () => {
    for (const id of ['skeleton_warrior', 'skeleton_archer', 'ghost', 'zombie', 'cultist'] as const) {
      const visual = ENEMY_VISUALS[id];
      expect(visual.bodyFrame).toBeDefined();
      expect(visual.bossSprite).toBeUndefined();
    }
  });
});
