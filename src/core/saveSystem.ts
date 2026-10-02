/**
 * Система сохранений: сериализация состояния, localStorage + облако Яндекса.
 */
import { GRID_SIZE } from './config';
import { Weapon } from './economy';

export interface SaveData {
  version: number;
  gold: number;
  crystals: number;
  souls: number;
  spawnCount: number;
  lifetimeGold: number;
  grid: (Weapon | null)[];
  wave: number;
  bestWave: number;
  bossesKilled: number;
  skills: Record<string, number>;
  doubleIncomeUntil: number; // timestamp окончания ×2
  lastSeen: number;
}

export const SAVE_VERSION = 1;
const LOCAL_KEY = 'forge_of_heroes_save_v1';

export function createDefaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    gold: 25,
    crystals: 0,
    souls: 0,
    spawnCount: 0,
    lifetimeGold: 25,
    grid: new Array(GRID_SIZE).fill(null),
    wave: 1,
    bestWave: 0,
    bossesKilled: 0,
    skills: {},
    doubleIncomeUntil: 0,
    lastSeen: Date.now(),
  };
}

/** Валидация и миграция загруженных данных */
export function sanitizeSave(raw: unknown): SaveData {
  const def = createDefaultSave();
  if (!raw || typeof raw !== 'object') return def;
  const r = raw as Partial<SaveData>;
  const grid = Array.isArray(r.grid) ? r.grid.slice(0, GRID_SIZE) : def.grid;
  while (grid.length < GRID_SIZE) grid.push(null);
  return {
    ...def,
    ...r,
    gold: Number.isFinite(r.gold) ? (r.gold as number) : def.gold,
    crystals: Number.isFinite(r.crystals) ? (r.crystals as number) : 0,
    souls: Number.isFinite(r.souls) ? (r.souls as number) : 0,
    skills: r.skills && typeof r.skills === 'object' ? r.skills : {},
    grid,
    version: SAVE_VERSION,
  };
}

export function saveLocal(data: SaveData): void {
  try {
    data.lastSeen = Date.now();
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Local save failed', e);
  }
}

export function loadLocal(): SaveData | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? sanitizeSave(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
