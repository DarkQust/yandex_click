import { describe, expect, it } from 'vitest';
import { computeSkillEffects, getNode, skillCost } from '../src/core/skills';
import { pendingSouls, prestigeMultiplier, soulsForLifetimeGold } from '../src/core/prestige';
import { createDefaultSave, sanitizeSave } from '../src/core/saveSystem';

describe('skills', () => {
  it('skill cost grows with level', () => {
    const node = getNode('midas1');
    expect(skillCost(node, 0)).toBe(1);
    expect(skillCost(node, 2)).toBeGreaterThan(skillCost(node, 0));
  });

  it('computeSkillEffects defaults', () => {
    const e = computeSkillEffects({});
    expect(e.incomeMult).toBe(1);
    expect(e.dpsMult).toBe(1);
    expect(e.crystalMult).toBe(1);
    expect(e.autoSpawn).toBe(false);
  });

  it('skills apply multipliers', () => {
    const e = computeSkillEffects({ midas1: 2, might1: 1, might5: 1, luck5: 1, luck1: 2 });
    expect(e.incomeMult).toBeCloseTo(1.5);
    expect(e.dpsMult).toBeCloseTo(1.3);
    expect(e.crystalMult).toBe(2);
    // fortune wheel ×1.5 both luck & crit
    expect(e.luckyMergeChance).toBeCloseTo(0.05 * 2 * 1.5);
  });

  it('unknown skill throws', () => {
    expect(() => getNode('nope')).toThrow();
  });
});

describe('prestige', () => {
  it('souls from lifetime gold', () => {
    expect(soulsForLifetimeGold(0)).toBe(0);
    expect(soulsForLifetimeGold(1_000_000)).toBe(1);
    expect(soulsForLifetimeGold(4_000_000)).toBe(2);
  });

  it('pending souls account for existing', () => {
    expect(pendingSouls(4_000_000, 1)).toBe(1);
    expect(pendingSouls(4_000_000, 2)).toBe(0);
  });

  it('multiplier', () => {
    expect(prestigeMultiplier(0)).toBe(1);
    expect(prestigeMultiplier(5)).toBeCloseTo(1.5);
  });
});

describe('saveSystem', () => {
  it('default save is valid', () => {
    const s = createDefaultSave();
    expect(s.grid.length).toBe(20);
    expect(s.gold).toBeGreaterThan(0);
  });

  it('sanitize fixes broken data', () => {
    const s = sanitizeSave({ gold: 'bad' as never, grid: null as never });
    expect(s.gold).toBeGreaterThan(0);
    expect(s.grid.length).toBe(20);
    expect(sanitizeSave(null).crystals).toBe(0);
  });
});
