/**
 * Питомцы: коллекция, редкости, пассивы, прокачка кормом, кейсы.
 * Чистая логика, rng инжектируем.
 */
import { Rarity } from './artifacts';

export type PetSpeciesId = 'wolfpup' | 'batling' | 'drakeling' | 'spirit' | 'bearcub' | 'emberlion' | 'golem' | 'phoenix';

/** Пассивы питомцев — подмножество idle-статов + охотничьи */
export type PetStat =
  | 'income' // +% дохода
  | 'dps' // +% ДПС
  | 'click' // +% урона клика
  | 'dungeonGold' // +% золото данжа
  | 'shardBonus' // +% осколки разломов
  | 'keyChance' // +% шанс ключа
  | 'captureChance'; // +% шанс поимки на охоте

export interface PetSpeciesDef {
  id: PetSpeciesId;
  name: string;
  icon: string;
  stat: PetStat;
  baseBonus: number; // % за уровень 1 (растёт с level)
}

export const PET_SPECIES: PetSpeciesDef[] = [
  { id: 'wolfpup', name: 'Волчонок', icon: '🐺', stat: 'dps', baseBonus: 8 },
  { id: 'batling', name: 'Нетопырыш', icon: '🦇', stat: 'keyChance', baseBonus: 10 },
  { id: 'drakeling', name: 'Дракончик', icon: '🐉', stat: 'income', baseBonus: 8 },
  { id: 'spirit', name: 'Дух Света', icon: '✨', stat: 'captureChance', baseBonus: 7 },
  { id: 'bearcub', name: 'Медвежонок', icon: '🐻', stat: 'dungeonGold', baseBonus: 10 },
  { id: 'emberlion', name: 'Огнегрив', icon: '🦁', stat: 'shardBonus', baseBonus: 12 },
  { id: 'golem', name: 'Кристальный голем', icon: '🗿', stat: 'click', baseBonus: 15 },
  { id: 'phoenix', name: 'Феникс', icon: '🔥', stat: 'income', baseBonus: 20 },
];

export function getSpecies(id: PetSpeciesId): PetSpeciesDef {
  const s = PET_SPECIES.find((p) => p.id === id);
  if (!s) throw new Error(`Unknown species: ${id}`);
  return s;
}

export const PET_RARITY_MULT: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.25,
  rare: 1.6,
  epic: 2.1,
  legendary: 3,
};

export const MAX_ACTIVE_PETS = 3;
export const MAX_PET_LEVEL = 10;
/** Корм для уровня: 2 * текущий уровень */
export function petFeedCost(level: number): number {
  return 2 * level;
}

export interface Pet {
  uid: string;
  species: PetSpeciesId;
  rarity: Rarity;
  level: number; // 1..MAX_PET_LEVEL
  name: string;
}

/** Бонус питомца в процентах с учётом уровня */
export function petBonus(pet: Pet): { stat: PetStat; value: number } {
  const def = getSpecies(pet.species);
  const value =
    def.baseBonus *
    PET_RARITY_MULT[pet.rarity] *
    (1 + 0.2 * (pet.level - 1));
  return { stat: def.stat, value: Math.round(value * 10) / 10 };
}

/** Сумма пассивов команды активных питомцев (без petEfficiency — он в GameState) */
export function petTeamTotals(pets: Pet[]): Record<PetStat, number> {
  const totals = {} as Record<PetStat, number>;
  for (const p of pets) {
    const { stat, value } = petBonus(p);
    totals[stat] = (totals[stat] ?? 0) + value;
  }
  for (const k of Object.keys(totals) as PetStat[]) {
    totals[k] = Math.round(totals[k] * 10) / 10;
  }
  return totals;
}

/** Веса редкости питомца при открытии кейса */
export const CASE_RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 40,
  uncommon: 30,
  rare: 18,
  epic: 9,
  legendary: 3,
};

export function rollCaseRarity(rng: () => number): Rarity {
  const entries = Object.entries(CASE_RARITY_WEIGHTS) as [Rarity, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [r, w] of entries) {
    roll -= w;
    if (roll <= 0) return r;
  }
  return 'common';
}

/** Открытие кейса: случайный вид + своя редкость (независимая от охоты) */
export function openPetCase(rng: () => number = Math.random): Pet {
  const species = PET_SPECIES[Math.floor(rng() * PET_SPECIES.length)];
  const rarity = rollCaseRarity(rng);
  return {
    uid: `pet_${Date.now().toString(36)}_${Math.floor(rng() * 1e9).toString(36)}`,
    species: species.id,
    rarity,
    level: 1,
    name: species.name,
  };
}

/** Питомец с поимки: вид существа + редкость существа */
export function petFromCapture(
  species: PetSpeciesId,
  rarity: Rarity,
  rng: () => number = Math.random,
): Pet {
  return {
    uid: `pet_${Date.now().toString(36)}_${Math.floor(rng() * 1e9).toString(36)}`,
    species,
    rarity,
    level: 1,
    name: getSpecies(species).name,
  };
}

export const CASE_COST_KEYS = 3;
