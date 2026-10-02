/**
 * Чистая игровая экономика: формулы, слияние, оффлайн-доход.
 * Без зависимостей от Phaser — полностью юнит-тестируемо.
 */
import {
  Branch,
  BRANCH_INFO,
  INCOME_TIER_MULT,
  DPS_TIER_MULT,
  SPAWN_BASE_COST,
  SPAWN_COST_GROWTH,
  MONSTER_BASE_HP,
  MONSTER_HP_GROWTH,
  MONSTER_BASE_GOLD,
  MONSTER_GOLD_GROWTH,
  BOSS_EVERY,
  BOSS_HP_MULT,
  MAX_TIER,
  OFFLINE_CAP_SECONDS,
  TIER_NAMES,
  BRANCHES,
} from './config';

export interface Weapon {
  branch: Branch;
  tier: number; // 1..MAX_TIER
}

/** Доход оружия в секунду */
export function weaponIncome(w: Weapon): number {
  return BRANCH_INFO[w.branch].baseIncome * Math.pow(INCOME_TIER_MULT, w.tier - 1);
}

/** ДПС оружия */
export function weaponDps(w: Weapon): number {
  return BRANCH_INFO[w.branch].baseDps * Math.pow(DPS_TIER_MULT, w.tier - 1);
}

/** Суммарный доход сетки (с множителями) */
export function totalIncomePerSec(
  grid: (Weapon | null)[],
  incomeMult = 1,
): number {
  return grid.reduce((sum, w) => sum + (w ? weaponIncome(w) : 0), 0) * incomeMult;
}

/** Суммарный ДПС сетки (с множителями) */
export function totalDps(grid: (Weapon | null)[], dpsMult = 1): number {
  return grid.reduce((sum, w) => sum + (w ? weaponDps(w) : 0), 0) * dpsMult;
}

/** Цена следующего спауна базового оружия */
export function spawnCost(spawnCount: number): number {
  return Math.floor(SPAWN_BASE_COST * Math.pow(SPAWN_COST_GROWTH, spawnCount));
}

/** Случайная ветка для спауна */
export function randomBranch(rng: () => number = Math.random): Branch {
  return BRANCHES[Math.floor(rng() * BRANCHES.length)];
}

/**
 * Попытка слияния двух ячеек сетки.
 * @returns новый оружейный результат или null, если слияние невозможно
 */
export function canMerge(a: Weapon | null, b: Weapon | null): boolean {
  return !!a && !!b && a.branch === b.branch && a.tier === b.tier && a.tier < MAX_TIER;
}

/**
 * Слияние с учётом шанса удачи (перепрыгнуть тир).
 * Возвращает merged-оружие и произошёл ли lucky-слияние.
 */
export function merge(
  a: Weapon,
  b: Weapon,
  luckyChance = 0,
  rng: () => number = Math.random,
): { result: Weapon; lucky: boolean } | null {
  if (!canMerge(a, b)) return null;
  const lucky = rng() < luckyChance;
  const tierJump = lucky ? 2 : 1;
  return {
    result: { branch: a.branch, tier: Math.min(a.tier + tierJump, MAX_TIER) },
    lucky,
  };
}

/** Поиск первой свободной ячейки */
export function firstEmptySlot(grid: (Weapon | null)[]): number {
  return grid.findIndex((w) => w === null);
}

// ---------- Данжи ----------

export function isBossWave(wave: number): boolean {
  return wave > 0 && wave % BOSS_EVERY === 0;
}

export function monsterHp(wave: number): number {
  const hp = MONSTER_BASE_HP * Math.pow(MONSTER_HP_GROWTH, wave - 1);
  return Math.floor(hp * (isBossWave(wave) ? BOSS_HP_MULT : 1));
}

export function monsterGoldReward(wave: number): number {
  const gold = MONSTER_BASE_GOLD * Math.pow(MONSTER_GOLD_GROWTH, wave - 1);
  return Math.floor(gold * (isBossWave(wave) ? 5 : 1));
}

/** Кристаллы за босса */
export function bossCrystalReward(wave: number): number {
  return isBossWave(wave) ? 1 + Math.floor(wave / 10) : 0;
}

// ---------- Оффлайн-доход ----------

/**
 * Доход за время отсутствия. Кап OFFLINE_CAP_SECONDS.
 * @param incomePerSec доход в секунду на момент выхода
 * @param secondsAway секунд отсутствия
 */
export function offlineEarnings(incomePerSec: number, secondsAway: number): number {
  const capped = Math.min(Math.max(secondsAway, 0), OFFLINE_CAP_SECONDS);
  return Math.floor(incomePerSec * capped * 0.5); // 50% эффективность оффлайна
}

// ---------- Прочее ----------

export function weaponDisplayName(w: Weapon): string {
  const adj = TIER_NAMES[Math.min(w.tier - 1, TIER_NAMES.length - 1)];
  const noun = { sword: 'клинок', magic: 'жезл', tech: 'модуль' }[w.branch];
  return `${adj} ${noun}`;
}

/** Форматирование больших чисел: 1.2K, 3.4M, 5.6B */
export function formatNumber(n: number): string {
  if (n < 1000) return Math.floor(n).toString();
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [value, suffix] of units) {
    if (n >= value) return `${(n / value).toFixed(1).replace(/\.0$/, '')}${suffix}`;
  }
  return Math.floor(n).toString();
}
