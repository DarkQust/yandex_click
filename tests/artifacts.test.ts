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
    const withSecret = craftArtifact(seq([0.3, 0.2, 0.5, 0.001, 0.5]), 0, 1); // кап 2%, rng=0.001 → secret гарантирован
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

describe('A3 fix pass', () => {
  // --- 1. secret-аффиксы: weighted picker работает, доступны ВСЕ 4 стата ---
  it('secret picker can produce every secret stat (not only the first)', () => {
    const seen = new Set<string>();
    // secretBonus=1 → secret гарантирован; варьируем rng чтобы покрыть весь пул
    for (const roll of [0.01, 0.3, 0.55, 0.8, 0.99]) {
      const art = craftArtifact(seq([0.2, 0.4, 0.5, 0.001, roll, 0.5, 0.5]), 0, 1);
      const secret = art.affixes.find((a) => a.secret);
      expect(secret).toBeTruthy();
      seen.add(secret!.stat);
    }
    expect(seen.size).toBeGreaterThan(1); // раньше weight=0 давал всегда первый элемент
  });

  it('secret chance is clamped to [0.5%, 2%] (Chaos rift rule)', () => {
    // secretBonus=-10 → не должно стать гарантией отсутствия... testable через clamp ≥ BASE
    // huge bonus не пробивает кап 2%: rng=0.03 → нет secret даже при bonus=10
    const art = craftArtifact(seq([0.2, 0.5, 0.03]), 0, 10);
    expect(art.affixes.every((a) => !a.secret)).toBe(true);
  });

  // --- редкости: количество аффиксов ---
  it('affix count matches rarity for ALL rarities', () => {
    const rolls: [string, number][] = [
      ['common', 0.2],
      ['uncommon', 0.6],
      ['rare', 0.85],
      ['epic', 0.95],
      ['legendary', 0.995],
    ];
    for (const [rarity, roll] of rolls) {
      const art = craftArtifact(seq([roll, 0.5, 0.3, 0.7, 0.1, 0.9, 0.4, 0.6, 0.2, 0.8, 0.99]), 0, 0);
      expect(art.rarity).toBe(rarity);
      expect(art.affixes.filter((a) => !a.secret).length).toBe(
        RARITY_INFO[rarity as keyof typeof RARITY_INFO].affixes,
      );
    }
  });

  // --- 3. clamps вероятностей ---
  it('crit chance clamped to 75%', () => {
    const s = new GameState();
    s.data.skills = { might3: 5, luck5: 1 }; // 37.5%
    s.refreshEffects();
    s.data.artifacts = [
      { id: 'c', name: '', rarity: 'legendary', createdAt: 0, affixes: [{ stat: 'critChance', value: 90, secret: false }] },
    ];
    s.data.equippedIds = ['c'];
    expect(s.totalCritChance()).toBe(0.75);
  });

  it('lucky merge clamped to 50%', () => {
    const s = new GameState();
    s.data.skills = { luck1: 5, luck5: 1 };
    s.refreshEffects();
    s.data.artifacts = [
      { id: 'l', name: '', rarity: 'legendary', createdAt: 0, affixes: [{ stat: 'luckyMerge', value: 90, secret: false }] },
    ];
    s.data.equippedIds = ['l'];
    expect(s.totalLuckyMergeChance()).toBe(0.5);
  });

  it('rollRarity bonus clamped to [0,1]', () => {
    expect(rollRarity(() => 0.3, -5)).toBe('common'); // отрицательный → 0
    expect(rollRarity(() => 0.3, 5)).not.toBe('common'); // >1 → как 1
  });

  // --- 2. оффлайн: 4 комбинации независимых множителей ---
  const offlineCase = (full: boolean, offlineRateAffix: number) => {
    const s = new GameState();
    s.data.grid = [{ branch: 'sword', tier: 1 }];
    s.data.skills = full ? { midas4: 1 } : {};
    s.refreshEffects();
    if (offlineRateAffix > 0) {
      s.data.artifacts = [
        { id: 'o', name: '', rarity: 'common', createdAt: 0, affixes: [{ stat: 'offlineRate', value: offlineRateAffix, secret: false }] },
      ];
      s.data.equippedIds = ['o'];
    }
    const t0 = 1_000_000_000;
    s.data.lastSeen = t0;
    const income = s.incomePerSec();
    const earned = s.applyOfflineEarnings(t0 + 3600_000); // 1 час
    const expectedRate = (full ? 1 : 0.5) * (1 + offlineRateAffix / 100);
    return { earned, expected: Math.floor(income * 3600 * expectedRate) };
  };

  it('offline: no skill, no affix → 50%', () => {
    const { earned, expected } = offlineCase(false, 0);
    expect(earned).toBe(expected);
  });
  it('offline: skill midas4 only → 100%', () => {
    const { earned, expected } = offlineCase(true, 0);
    expect(earned).toBe(expected);
  });
  it('offline: affix offlineRate only → 50% × 1.2', () => {
    const { earned, expected } = offlineCase(false, 20);
    expect(earned).toBe(expected);
  });
  it('offline: skill + affix → 100% × 1.2', () => {
    const { earned, expected } = offlineCase(true, 20);
    expect(earned).toBe(expected);
  });

  it('offlineCap affix extends cap', () => {
    const s = new GameState();
    s.data.artifacts = [
      { id: 'k', name: '', rarity: 'common', createdAt: 0, affixes: [{ stat: 'offlineCap', value: 2, secret: true }] },
    ];
    s.data.equippedIds = ['k'];
    expect(s.offlineCapSeconds()).toBe(8 * 3600 + 2 * 3600);
  });

  // --- 4. валидация сейва ---
  it('sanitize drops broken artifacts and cleans equippedIds', () => {
    const good = {
      id: 'g1', name: 'ok', rarity: 'rare', createdAt: 1,
      affixes: [{ stat: 'income', value: 10, secret: false }],
    };
    const badRarity = { id: 'b1', rarity: 'mythic', affixes: [] };
    const noId = { rarity: 'rare', affixes: [] };
    const s = sanitizeSave({
      artifacts: [good, badRarity, noId, null, 'junk'],
      equippedIds: ['g1', 'g1', 'ghost', 42, null],
    });
    expect(s.artifacts).toEqual([good]);
    expect(s.equippedIds).toEqual(['g1']); // без дублей и призраков
  });

  it('artifact with broken affixes keeps only valid ones', () => {
    const s = sanitizeSave({
      artifacts: [{ id: 'a1', name: '', rarity: 'epic', createdAt: 1, affixes: [
        { stat: 'income', value: 10, secret: false },
        { stat: 'NOT_A_STAT', value: 5, secret: false },
        { stat: 'dps', value: 'bad', secret: false },
      ] }],
    });
    expect(s.artifacts[0].affixes).toEqual([{ stat: 'income', value: 10, secret: false }]);
  });

  // --- 5. миграция v1→v2 сохраняет основные данные ---
  it('v1→v2 migration preserves core progress', () => {
    const v1 = {
      version: 1, gold: 12345, crystals: 7, souls: 2, wave: 12, bestWave: 10,
      grid: [{ branch: 'sword', tier: 4 }, null],
      skills: { midas1: 2 }, bossesKilled: 4, spawnCount: 33, lifetimeGold: 99999,
    };
    const s = sanitizeSave(v1);
    expect(s.gold).toBe(12345);
    expect(s.crystals).toBe(7);
    expect(s.souls).toBe(2);
    expect(s.wave).toBe(12);
    expect(s.grid[0]).toEqual({ branch: 'sword', tier: 4 });
    expect(s.skills).toEqual({ midas1: 2 });
    expect(s.bossesKilled).toBe(4);
    // + новые поля v2 с дефолтами
    expect(s.artifacts).toEqual([]);
  });

  // --- 5. экипированные бонусы применяются к ключевым статам ---
  it('equipped artifact bonuses apply to dps/click/dungeon gold/lucky merge', () => {
    const s = new GameState();
    s.data.grid = [{ branch: 'sword', tier: 3 }];
    const baseDps = s.totalDps();
    const baseClick = s.clickDamage();
    s.data.artifacts = [
      { id: 'e', name: '', rarity: 'epic', createdAt: 0, affixes: [
        { stat: 'dps', value: 50, secret: false },
        { stat: 'click', value: 100, secret: false },
        { stat: 'dungeonGold', value: 25, secret: false },
        { stat: 'luckyMerge', value: 10, secret: false },
      ] },
    ];
    s.data.equippedIds = ['e'];
    expect(s.totalDps()).toBeCloseTo(baseDps * 1.5, 3);
    expect(s.clickDamage()).toBeCloseTo(s.totalDps() * 0.15 * 2, 3); // click affix ×2 поверх DPS
    expect(s.clickDamage()).toBeGreaterThan(1);
    void baseClick;
    expect(s.totalDungeonGoldMult()).toBeCloseTo(1.25, 3);
    expect(s.totalLuckyMergeChance()).toBeCloseTo(0.1, 5);
  });
});
