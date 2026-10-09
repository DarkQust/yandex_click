import { describe, expect, it } from 'vitest';
import {
  AFFIX_POOL,
  Artifact,
  CRAFT_COST_SHARDS,
  MAX_INVENTORY,
  RARITY_INFO,
  artifactTotals,
  craftArtifact,
  rerollArtifact,
  rollRarity,
} from '../src/core/artifacts';
import { GameState } from '../src/core/gameState';
import { createDefaultSave, sanitizeSave } from '../src/core/saveSystem';

/** детерминированный rng */
const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('artifacts core', () => {
  it('rarity weights cover 100', () => {
    expect(rollRarity(() => 0.001)).toBe('common');
    expect(rollRarity(() => 0.999)).toBe('legendary');
    expect(rollRarity(() => 0.51)).toBe('uncommon');
  });

  it('rarity bonus shifts to rare tiers', () => {
    // без бонуса это common (roll=0.3 → 30 < 50)
    expect(rollRarity(() => 0.3, 0)).toBe('common');
    // с полным бонусом common весит ~0 → тот же ролл уходит выше
    const r = rollRarity(() => 0.3, 1);
    expect(r).not.toBe('common');
  });

  it('craft produces affix count by rarity', () => {
    for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const) {
      const a = craftArtifact(seq([0.5]), 0, 0);
      expect(Object.keys(RARITY_INFO)).toContain(a.rarity);
      void r;
    }
    // legendary: rng 0.999 → max rarity, 5 аффиксов, уникальные статы
    const leg = craftArtifact(seq([0.999, 0.1, 0.5, 0.3, 0.7, 0.2, 0.5]), 0, 0);
    expect(leg.rarity).toBe('legendary');
    expect(leg.affixes.length).toBe(RARITY_INFO.legendary.affixes);
    const stats = leg.affixes.map((a) => a.stat);
    expect(new Set(stats).size).toBe(stats.length);
  });

  it('secret affix never rolls from regular pool, rolls with secretBonus', () => {
    const noSecret = craftArtifact(seq([0.5]), 0, 0);
    expect(noSecret.affixes.every((a) => !a.secret)).toBe(true);
    const withSecret = craftArtifact(seq([0.3, 0.2, 0.5, 0.1]), 0, 1); // secretBonus=1 → гарантия
    expect(withSecret.affixes.some((a) => a.secret)).toBe(true);
    const secretStats = AFFIX_POOL.filter((a) => a.secret).map((a) => a.stat);
    expect(secretStats).toContain(withSecret.affixes.find((a) => a.secret)!.stat);
  });

  it('reroll changes one affix and keeps secrets intact', () => {
    const art: Artifact = {
      id: 'x',
      name: 't',
      rarity: 'rare',
      createdAt: 0,
      affixes: [
        { stat: 'income', value: 10, secret: false },
        { stat: 'dps', value: 10, secret: false },
        { stat: 'petEfficiency', value: 12, secret: true },
      ],
    };
    const next = rerollArtifact(art, seq([0.999, 0.2, 0.5]));
    expect(next.affixes.length).toBe(3);
    expect(next.affixes.find((a) => a.secret)).toEqual({ stat: 'petEfficiency', value: 12, secret: true });
    expect(next).not.toBe(art); // иммутабельность
  });

  it('artifactTotals sums equipped stats', () => {
    const arts: Artifact[] = [
      { id: '1', name: 'a', rarity: 'common', createdAt: 0, affixes: [{ stat: 'income', value: 10, secret: false }] },
      { id: '2', name: 'b', rarity: 'common', createdAt: 0, affixes: [{ stat: 'income', value: 5, secret: false }, { stat: 'dps', value: 7, secret: false }] },
    ];
    const t = artifactTotals(arts);
    expect(t.income).toBe(15);
    expect(t.dps).toBe(7);
  });
});

describe('artifacts + GameState', () => {
  it('craft spends shards, returns artifact', () => {
    const s = new GameState();
    s.data.shards = CRAFT_COST_SHARDS;
    const art = s.craftArtifact(seq([0.5]))!;
    expect(art).toBeTruthy();
    expect(s.data.shards).toBe(0);
    expect(s.data.artifacts.length).toBe(1);
    expect(s.craftArtifact()).toBeNull(); // нет осколков
  });

  it('inventory cap enforced', () => {
    const s = new GameState();
    s.data.shards = 1e9;
    s.data.artifacts = new Array(MAX_INVENTORY).fill(null).map((_, i) => ({
      id: `a${i}`, name: '', rarity: 'common' as const, createdAt: 0, affixes: [],
    }));
    expect(s.craftArtifact()).toBeNull();
  });

  it('equip boosts income and unlocked stats only when equipped', () => {
    const s = new GameState();
    s.data.grid = [{ branch: 'sword', tier: 1 }];
    const baseIncome = s.incomePerSec();
    s.data.shards = 100;
    const art = s.craftArtifact(seq([0.001, 0.001, 0.9]))!; // common, income affix
    expect(s.incomePerSec()).toBeCloseTo(baseIncome); // не экипирован — нет бонуса
    expect(s.equipArtifact(art.id)).toBe(true);
    expect(s.incomePerSec()).toBeGreaterThan(baseIncome);
    s.unequipArtifact(art.id);
    expect(s.incomePerSec()).toBeCloseTo(baseIncome);
  });

  it('reroll spends stabilizer', () => {
    const s = new GameState();
    s.data.shards = 100;
    s.data.stabilizers = 1;
    const art = s.craftArtifact(seq([0.5]))!;
    expect(s.rerollArtifact(art.id, seq([0.5]))).toBeTruthy();
    expect(s.data.stabilizers).toBe(0);
    expect(s.rerollArtifact(art.id)).toBeNull();
  });

  it('salvage returns shards by rarity', () => {
    const s = new GameState();
    s.data.shards = 100;
    const art = s.craftArtifact(seq([0.999, 0.1, 0.5, 0.3, 0.7, 0.2, 0.5]))!; // legendary
    const before = s.data.shards;
    const gained = s.salvageArtifact(art.id);
    expect(gained).toBe(RARITY_INFO.legendary.salvageShards);
    expect(s.data.shards).toBe(before + gained);
    expect(s.data.artifacts.length).toBe(0);
  });

  it('prestige keeps artifacts and materials', () => {
    const s = new GameState();
    s.data.lifetimeGold = 1_000_000;
    s.data.shards = 77;
    s.data.stabilizers = 3;
    s.data.artifacts = [{ id: 'a', name: '', rarity: 'epic', createdAt: 0, affixes: [] }];
    s.data.equippedIds = ['a'];
    expect(s.doPrestige()).toBe(1);
    expect(s.data.artifacts.length).toBe(1);
    expect(s.data.equippedIds).toEqual(['a']);
    expect(s.data.shards).toBe(77);
    expect(s.data.stabilizers).toBe(3);
  });

  it('save v2 migration: v1 save gets defaults', () => {
    const v1 = { version: 1, gold: 100, grid: [] };
    const s = sanitizeSave(v1);
    expect(s.shards).toBe(30);
    expect(s.stabilizers).toBe(2);
    expect(s.artifacts).toEqual([]);
    expect(createDefaultSave().equippedIds).toEqual([]);
  });
});
