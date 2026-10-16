import { describe, expect, it } from 'vitest';
import {
  RIFTS,
  clearTime,
  fullClearRewards,
  generateRooms,
  getRift,
  offlineClearBundle,
  offlineRiftGrants,
  requiredDps,
  riftEnemyHp,
  riftRoomCount,
  tickAutoFarm,
  probabilisticFloor,
} from '../src/core/expeditions';
import { craftArtifact } from '../src/core/artifacts';
import { GameState } from '../src/core/gameState';
import { sanitizeSave } from '../src/core/saveSystem';

const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const forge = getRift('forge');
const arcane = getRift('arcane');
const mechanism = getRift('mechanism');
const chaos = getRift('chaos');

describe('expedition scaling', () => {
  it('4 rifts exist with distinct modifiers', () => {
    expect(RIFTS.length).toBe(4);
    expect(forge.modifiers.enemyHpMult).toBeGreaterThan(1);
    expect(arcane.modifiers.shardMult).toBeGreaterThan(1);
    expect(mechanism.modifiers.autoFarmSpeedMult).toBe(2);
    expect(chaos.modifiers.secretBonus).toBeGreaterThan(0);
  });

  it('enemy hp scales with depth, elite x3, boss x6', () => {
    expect(riftEnemyHp(1, 'combat')).toBe(30);
    expect(riftEnemyHp(2, 'combat')).toBeGreaterThan(riftEnemyHp(1, 'combat'));
    // floor применяется после умножения на mult — сравниваем соотношение приблизительно
    const combat = riftEnemyHp(5, 'combat');
    expect(riftEnemyHp(5, 'elite') / combat).toBeGreaterThanOrEqual(2.9);
    expect(riftEnemyHp(5, 'elite') / combat).toBeLessThanOrEqual(3.1);
    expect(riftEnemyHp(5, 'boss') / combat).toBeGreaterThanOrEqual(5.9);
    expect(riftEnemyHp(5, 'boss') / combat).toBeLessThanOrEqual(6.1);
    expect(riftEnemyHp(1, 'combat', 1.5)).toBe(45); // forge hpMult
  });

  it('room count grows and caps; mechanism has +2', () => {
    expect(riftRoomCount(1, forge)).toBe(3);
    expect(riftRoomCount(25, forge)).toBe(7); // кап
    expect(riftRoomCount(1, mechanism)).toBe(5);
    expect(riftRoomCount(1000, forge)).toBe(7); // бесконечная глубина не раздувает комнаты
  });

  it('generateRooms ends with boss', () => {
    const rooms = generateRooms(5, forge, seq([0.1, 0.5, 0.9, 0.3, 0.7]));
    expect(rooms[rooms.length - 1].type).toBe('boss');
    expect(rooms.length).toBe(riftRoomCount(5, forge) + 1);
    // у боевых комнат есть HP
    expect(rooms.filter((r) => r.enemyHp > 0).length).toBeGreaterThan(0);
  });

  it('chaos shift: more elite/mystery than forge (distribution)', () => {
    // детерминированное сравнение по весам через generateRooms с фикс. rng
    const countTypes = (rift: typeof forge) => {
      const counts: Record<string, number> = {};
      for (let seed = 0; seed < 50; seed++) {
        const rooms = generateRooms(1, rift, seq([0.05 + (seed % 20) * 0.047]));
        for (const r of rooms) counts[r.type] = (counts[r.type] ?? 0) + 1;
      }
      return counts;
    };
    const f = countTypes(forge);
    const c = countTypes(chaos);
    expect((c['elite'] ?? 0) + (c['mystery'] ?? 0)).toBeGreaterThan((f['elite'] ?? 0) + (f['mystery'] ?? 0));
  });

  it('requiredDps grows with depth; rewards grow too', () => {
    expect(requiredDps(10, forge)).toBeGreaterThan(requiredDps(1, forge));
    expect(fullClearRewards(10, forge).shards).toBeGreaterThan(fullClearRewards(1, forge).shards);
    expect(fullClearRewards(10, forge).gold).toBeGreaterThan(fullClearRewards(1, forge).gold);
  });
});

describe('autofarm', () => {
  it('requires sufficient dps', () => {
    const p = { maxDepth: 1, clears: 0, autoFarm: true, autoFarmProgress: 0 };
    const weak = tickAutoFarm(p, forge, 0.1, 60);
    expect(weak[1]).toBe(0); // не хватает ДПС
    const strong = tickAutoFarm(p, forge, 1e12, 60);
    // clearTime кап 20с → 3 зачистки за 60с
    expect(strong[1]).toBe(3);
  });

  it('mechanism farms 2x faster', () => {
    const p = { maxDepth: 1, clears: 0, autoFarm: true, autoFarmProgress: 0 };
    const f = tickAutoFarm(p, forge, 1e12, 100)[1];
    const m = tickAutoFarm(p, mechanism, 1e12, 100)[1];
    expect(m).toBe(f * 2);
  });

  it('clearTime has 20s floor', () => {
    expect(clearTime(1, forge, 1e15)).toBe(20);
  });

  it('offline bundle deterministic and scaled by clears', () => {
    const r = fullClearRewards(5, forge);
    const b = offlineClearBundle(r, 10);
    expect(b.shards).toBe(r.shards * 10);
    expect(b.gold).toBe(r.gold * 10);
  });

  it('offlineRiftGrants: needs autofarm on, caps time, 75% efficiency', () => {
    const p = { maxDepth: 1, clears: 0, autoFarm: false, autoFarmProgress: 0 };
    expect(offlineRiftGrants(p, forge, 1e12, 3600, 8 * 3600)).toBeNull(); // autofarm off
    p.autoFarm = true;
    const res = offlineRiftGrants(p, forge, 1e12, 24 * 3600, 8 * 3600)!;
    // clears = floor(min(24h, 8h) * 0.75 / 20s) = floor(28800*0.75/20)=1080
    expect(res.grant.shards).toBe(fullClearRewards(1, forge).shards * 1080);
  });
});

describe('expeditions + GameState/save', () => {
  it('save v3: default rift progress for all rifts', () => {
    const s = new GameState();
    for (const r of RIFTS) {
      expect(s.data.riftProgress[r.id]).toEqual({ maxDepth: 0, clears: 0, autoFarm: false, autoFarmProgress: 0 });
    }
  });

  it('v2 save migrates: rifts filled with defaults', () => {
    const s = sanitizeSave({ version: 2, gold: 500 });
    expect(s.riftProgress).toEqual(new GameState().data.riftProgress);
    expect(s.gold).toBe(500);
  });

  it('autofarm tick in GameState grants resources without any scene', () => {
    const s = new GameState();
    s.data.grid = [{ branch: 'sword', tier: 10 }]; // достаточный ДПС для глубины 1
    expect(s.totalDps()).toBeGreaterThanOrEqual(requiredDps(1, forge));
    s.data.riftProgress.forge.autoFarm = true;
    const shards0 = s.data.shards;
    const gold0 = s.data.gold;
    s.tick(1_000_000);
    s.tick(1_000_000 + 30_000); // 30s автофарма — минимум 1 clear (clearTime(1)≈30s при точном dps)
    expect(s.data.shards).toBeGreaterThanOrEqual(shards0);
    expect(s.data.gold).toBeGreaterThan(gold0);
  });

  it('offline rifts grant aggregated loot on load', () => {
    const s = new GameState();
    s.data.grid = [{ branch: 'sword', tier: 10 }];
    s.data.riftProgress.forge = { maxDepth: 1, clears: 0, autoFarm: true, autoFarmProgress: 0 };
    const t0 = 1_000_000_000;
    s.data.lastSeen = t0;
    const shards0 = s.data.shards;
    const res = s.applyOfflineRifts(t0 + 3600_000);
    expect(res.length).toBe(1);
    expect(s.data.shards).toBeGreaterThan(shards0);
  });

  it('active run: completeRiftRun raises maxDepth, nextDepth follows', () => {
    const s = new GameState();
    expect(s.nextRiftDepth('forge')).toBe(1);
    s.completeRiftRun('forge', 1);
    expect(s.nextRiftDepth('forge')).toBe(2);
    expect(s.data.riftProgress.forge.clears).toBe(1);
  });
});


describe('A4 fix pass', () => {
  // --- P3: affixBias реально смещает генерацию ---
  it('affixBias boosts biased stat weights x3', () => {
    // порядок пула: income18,dps16,click12,critC10,critM8,spawn8,offline6,lucky6,dungeon10,crystal6 (total 100)
    // roll 0.9*100=90 → без биаса попадает в dungeonGold (cum 84..94)
    const base = craftArtifact(seq([0.2, 0.9, 0.5]), 0, 0);
    expect(base.affixes[0].stat).toBe('dungeonGold');
    // с биасом crystal: вес 6→18, total 112, roll 0.9*112=100.8 → crystal (cum 94..112)
    const biased = craftArtifact(seq([0.2, 0.9, 0.5]), 0, 0, ['crystal']);
    expect(biased.affixes[0].stat).toBe('crystal');
  });

  it('forge artifacts bias towards dps-family stats', () => {
    // статистически: 200 крафтов с биасом forge должны дать больше dps, чем без
    let withBias = 0, withoutBias = 0;
    let n = 0;
    const rng = () => ((n = (n * 16807 + 11) % 2147483647) / 2147483647);
    for (let i = 0; i < 200; i++) {
      if (craftArtifact(rng, 0, 0, forge.affixBias).affixes.some((a) => a.stat === 'dps')) withBias++;
      if (craftArtifact(rng, 0, 0).affixes.some((a) => a.stat === 'dps')) withoutBias++;
    }
    expect(withBias).toBeGreaterThan(withoutBias);
  });

  // --- P4: вероятностный оффлайн-дроп не теряет дробную часть ---
  it('probabilisticFloor preserves expectation (no systematic loss)', () => {
    // 0.7 × 3 = 2.1 → floor=2 + (rng<0.1)
    expect(probabilisticFloor(2.1, () => 0.05)).toBe(3);
    expect(probabilisticFloor(2.1, () => 0.5)).toBe(2);
    // матожидание на 10000 бросков близко к 2.1
    let sum = 0;
    let n = 12345;
    const rng = () => ((n = (n * 16807 + 11) % 2147483647) / 2147483647);
    for (let i = 0; i < 10000; i++) sum += probabilisticFloor(2.1, rng);
    expect(sum / 10000).toBeGreaterThan(2.05);
    expect(sum / 10000).toBeLessThan(2.15);
  });

  it('offline bundle keeps stochastic drops instead of always flooring to zero', () => {
    const rewards = { shards: 2, stabilizerChance: 0.5, artifactChance: 0.05, gold: 100, baitChance: 0, keyChance: 0 };
    // раньше: 1 зачистка → floor(0.5)=0 стабилизаторов ВСЕГДА
    const got = offlineClearBundle(rewards, 1, () => 0.4); // 0.4 < 0.5 → 1
    expect(got.stabilizers).toBe(1);
    const missed = offlineClearBundle(rewards, 1, () => 0.6);
    expect(missed.stabilizers).toBe(0);
  });

  // --- P5: sanitize clears от NaN/Infinity/мусора ---
  it('sanitize riftProgress: NaN/Infinity/negative cleared to 0', () => {
    const s = sanitizeSave({
      riftProgress: {
        forge: { maxDepth: NaN, clears: NaN, autoFarm: true, autoFarmProgress: NaN },
        arcane: { maxDepth: Infinity, clears: -5, autoFarm: true },
        mechanism: { maxDepth: 3, clears: 7.9, autoFarm: false },
      },
    });
    // NaN maxDepth → весь разлом на дефолты (gate по Number.isFinite)
    expect(s.riftProgress.forge).toEqual({ maxDepth: 0, clears: 0, autoFarm: false, autoFarmProgress: 0 });
    expect(s.riftProgress.arcane.clears).toBe(0); // -5 → 0
    expect(s.riftProgress.mechanism.maxDepth).toBe(3);
    expect(s.riftProgress.mechanism.clears).toBe(7); // 7.9 → 7
  });
});
