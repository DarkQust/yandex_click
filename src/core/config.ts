/**
 * Балансные константы игры. Единый источник правды для формул.
 */

export type Branch = 'sword' | 'magic' | 'tech';

export const BRANCHES: Branch[] = ['sword', 'magic', 'tech'];

export const BRANCH_INFO: Record<
  Branch,
  { name: string; baseIncome: number; baseDps: number; color: number; icon: string }
> = {
  sword: { name: 'Мечи', baseIncome: 1.0, baseDps: 1.0, color: 0xd8b24a, icon: '⚔' },
  magic: { name: 'Магия', baseIncome: 0.8, baseDps: 1.4, color: 0x9a5adf, icon: '✦' },
  tech: { name: 'Техно', baseIncome: 1.2, baseDps: 0.8, color: 0x4ac0d8, icon: '⚙' },
};

export const MAX_TIER = 20;

/** Сетка кузницы: 5 колонок × 4 ряда */
export const GRID_COLS = 5;
export const GRID_ROWS = 4;
export const GRID_SIZE = GRID_COLS * GRID_ROWS;

/** Рост дохода/ДПС по тиру */
export const INCOME_TIER_MULT = 2.6;
export const DPS_TIER_MULT = 2.2;

/** Спавнер базового оружия */
export const SPAWN_BASE_COST = 10;
export const SPAWN_COST_GROWTH = 1.35;

/** Данжи */
export const MONSTER_BASE_HP = 20;
export const MONSTER_HP_GROWTH = 1.5;
export const MONSTER_BASE_GOLD = 5;
export const MONSTER_GOLD_GROWTH = 1.4;
export const BOSS_EVERY = 5; // каждая 5-я волна — босс
export const BOSS_HP_MULT = 8;

/** Престиж */
export const SOUL_GOLD_THRESHOLD = 1_000_000; // sqrt(lifetimeGold / threshold) душ
export const SOUL_BONUS = 0.1; // +10% за душу

/** Оффлайн-доход: кап 8 часов */
export const OFFLINE_CAP_SECONDS = 8 * 3600;

/** Rewarded-реклама: ×2 дохода на 5 минут */
export const DOUBLE_INCOME_SECONDS = 5 * 60;

/** Interstitial каждые N убийств боссов */
export const INTERSTITIAL_BOSS_INTERVAL = 3;

/** Шанс перепрыгнуть тир при слиянии (навык "Удача слияния") */
export const LUCKY_MERGE_BASE_CHANCE = 0.05;

export const TIER_NAMES = [
  'Ржавый',
  'Бронзовый',
  'Железный',
  'Стальной',
  'Закалённый',
  'Серебряный',
  'Рунический',
  'Мифриловый',
  'Эльфийский',
  'Драконий',
  'Обсидиановый',
  'Небесный',
  'Демонический',
  'Кровавый',
  'Астральный',
  'Титановый',
  'Божественный',
  'Вечный',
  'Хаоса',
  'Судьбы',
];
