import { describe, expect, it } from 'vitest';
import {
  Weapon,
  bossCrystalReward,
  canMerge,
  firstEmptySlot,
  formatNumber,
  isBossWave,
  merge,
  monsterGoldReward,
  monsterHp,
  offlineEarnings,
  spawnCost,
  totalDps,
  totalIncomePerSec,
  weaponDps,
  weaponIncome,
} from '../src/core/economy';
import { MAX_TIER, OFFLINE_CAP_SECONDS } from '../src/core/config';

const sword = (tier: number): Weapon => ({ branch: 'sword', tier });

describe('economy', () => {
  it('income grows by tier', () => {
    expect(weaponIncome(sword(2))).toBeGreaterThan(weaponIncome(sword(1)));
    expect(weaponDps(sword(3))).toBeGreaterThan(weaponDps(sword(2)));
  });

  it('totalIncome sums grid and applies multiplier', () => {
    const grid = [sword(1), sword(1), null];
    expect(totalIncomePerSec(grid)).toBeCloseTo(weaponIncome(sword(1)) * 2);
    expect(totalIncomePerSec(grid, 2)).toBeCloseTo(weaponIncome(sword(1)) * 4);
    expect(totalDps(grid, 3)).toBeCloseTo(weaponDps(sword(1)) * 2 * 3);
  });

  it('spawn cost grows', () => {
    expect(spawnCost(0)).toBe(10);
    expect(spawnCost(10)).toBeGreaterThan(spawnCost(1));
  });

  it('canMerge rules', () => {
    expect(canMerge(sword(1), sword(1))).toBe(true);
    expect(canMerge(sword(1), sword(2))).toBe(false);
    expect(canMerge(sword(1), { branch: 'magic', tier: 1 })).toBe(false);
    expect(canMerge(sword(MAX_TIER), sword(MAX_TIER))).toBe(false);
    expect(canMerge(sword(1), null)).toBe(false);
  });

  it('merge produces tier+1, lucky produces tier+2', () => {
    const res = merge(sword(3), sword(3), 0, () => 0.99)!;
    expect(res.result.tier).toBe(4);
    expect(res.lucky).toBe(false);
    const lucky = merge(sword(3), sword(3), 1, () => 0.0)!;
    expect(lucky.result.tier).toBe(5);
    expect(lucky.lucky).toBe(true);
    // cap на MAX_TIER
    const cap = merge(sword(MAX_TIER - 1), sword(MAX_TIER - 1), 1, () => 0)!;
    expect(cap.result.tier).toBe(MAX_TIER);
  });

  it('firstEmptySlot', () => {
    expect(firstEmptySlot([sword(1), null, sword(1)])).toBe(1);
    expect(firstEmptySlot([sword(1), sword(1)])).toBe(-1);
  });

  it('dungeon waves: boss every 5', () => {
    expect(isBossWave(5)).toBe(true);
    expect(isBossWave(4)).toBe(false);
    expect(monsterHp(5)).toBeGreaterThan(monsterHp(4));
    expect(bossCrystalReward(5)).toBe(1);
    expect(bossCrystalReward(4)).toBe(0);
    expect(bossCrystalReward(20)).toBe(3);
    expect(monsterGoldReward(1)).toBe(5);
  });

  it('offline earnings capped at 8h at 50% rate', () => {
    const income = 100;
    expect(offlineEarnings(income, 3600)).toBe(100 * 3600 * 0.5);
    expect(offlineEarnings(income, OFFLINE_CAP_SECONDS * 10)).toBe(
      Math.floor(100 * OFFLINE_CAP_SECONDS * 0.5),
    );
    expect(offlineEarnings(income, -5)).toBe(0);
  });

  it('formatNumber', () => {
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1500)).toBe('1.5K');
    expect(formatNumber(2_000_000)).toBe('2M');
    expect(formatNumber(3_400_000_000)).toBe('3.4B');
  });
});
