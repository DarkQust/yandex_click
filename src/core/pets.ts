/**
 * Питомцы: модификаторы по редкости (2/2/3/4/5), уникальные пассивы топ-редкостей
 * (звёздная градация 1-5, звёзды придут в A5.2 из пазлов), кейсы.
 * Чистая логика, rng инжектируем; миграция старых питомцев — детерминированный синтез.
 */
import { Rarity } from './artifacts';

export type PetSpeciesId =
  | 'wolfpup' | 'batling' | 'drakeling' | 'spirit' | 'bearcub' | 'emberlion' | 'golem' | 'phoenix';

/** Все характеристики питомцев, включая новые модификаторы кузницы и ультра-крит */
export type PetStat =
  | 'income' | 'dps' | 'click' | 'dungeonGold' | 'shardBonus' | 'keyChance' | 'captureChance'
  // --- модификаторы кузницы ---
  | 'tierJump' // +% шанс спавна оружия тиром выше
  | 'extraSpawn' // +% шанс дополнительной генерации оружия при ковке
  | 'spawnDiscount' // -% цена ковки (в кузнице)
  | 'ultraCritChance' // +% шанс ультра-крита (поверх обычного крита)
  | 'ultraCritMult' // +% сила ультра-крита
  | 'offlineRate'; // +% оффлайн-доход

export interface PetSpeciesDef {
  id: PetSpeciesId;
  name: string;
  icon: string;
  stat: PetStat; // первичная характеристика вида
  baseBonus: number; // % за уровень 1
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
  common: 1, uncommon: 1.25, rare: 1.6, epic: 2.1, legendary: 3,
};

/** Количество модификаторов по редкости: 2 / 2 / 3 / 4 / 5 */
export const PET_MOD_COUNT: Record<Rarity, number> = {
  common: 2, uncommon: 2, rare: 3, epic: 4, legendary: 5,
};

/** Вторичный пул модификаторов (помимо первичного стата вида) */
const SECONDARY_POOL: PetStat[] = [
  'income', 'dps', 'click', 'dungeonGold', 'shardBonus', 'keyChance',
  'tierJump', 'extraSpawn', 'spawnDiscount', 'ultraCritChance', 'ultraCritMult', 'offlineRate',
];

// ---------- Уникальные пассивы (эпик+легендарка): звёздная градация 1-5 ----------

export interface PetSkillDef {
  id: string;
  name: string;
  description: string;
  stat: PetStat;
  perStar: number; // % за звезду
  iconKey: string; // заглушка: будущий ассет-ключ арта скилла (этап B)
}

/** Уникальный пассив привязан к виду; звёзды 1-5 (источник звёзд — пазлы A5.2) */
export const PET_SKILLS: Record<PetSpeciesId, PetSkillDef> = {
  wolfpup: { id: 'pack_leader', name: 'Вожак стаи', description: '+% ДПС', stat: 'dps', perStar: 6, iconKey: 'skill_pack_leader' },
  batling: { id: 'echolocation', name: 'Эхолокация', description: '+% шанс ключа', stat: 'keyChance', perStar: 5, iconKey: 'skill_echolocation' },
  drakeling: { id: 'hoard', name: 'Клад', description: '+% доход', stat: 'income', perStar: 6, iconKey: 'skill_hoard' },
  spirit: { id: 'radiance', name: 'Сияние', description: '+% шанс поимки', stat: 'captureChance', perStar: 4, iconKey: 'skill_radiance' },
  bearcub: { id: 'might', name: 'Мощь', description: '+% урон клика', stat: 'click', perStar: 8, iconKey: 'skill_might' },
  emberlion: { id: 'forge_heat', name: 'Жар горна', description: '+% шанс тир-прыжка', stat: 'tierJump', perStar: 3, iconKey: 'skill_forge_heat' },
  golem: { id: 'living_anvil', name: 'Живая наковальня', description: '-% цена ковки', stat: 'spawnDiscount', perStar: 4, iconKey: 'skill_living_anvil' },
  phoenix: { id: 'rebirth', name: 'Перерождение', description: '+% оффлайн-доход', stat: 'offlineRate', perStar: 8, iconKey: 'skill_rebirth' },
};

export const PET_SKILL_MIN_RARITY: Rarity[] = ['epic', 'legendary'];
export const MAX_SKILL_STARS = 5;

export interface PetSkill {
  id: string;
  stars: number; // 1..5 (прокачка пазлами — A5.2; сейчас 1)
}

export interface PetMod {
  stat: PetStat;
  value: number; // %
}

export interface Pet {
  uid: string;
  species: PetSpeciesId;
  rarity: Rarity;
  level: number; // 1..MAX_PET_LEVEL
  name: string;
  /** модификаторы (2/2/3/4/5 по редкости); старые сейвы — синтезируются при миграции */
  mods: PetMod[];
  /** уникальный пассив (только epic/legendary) */
  skill?: PetSkill;
}

/** Полный whitelist характеристик питомцев (для валидации сейвов) */
export const VALID_PET_STATS: ReadonlySet<PetStat> = new Set<PetStat>([
  'income', 'dps', 'click', 'dungeonGold', 'shardBonus', 'keyChance', 'captureChance',
  'tierJump', 'extraSpawn', 'spawnDiscount', 'ultraCritChance', 'ultraCritMult', 'offlineRate',
]);

/** Верхняя граница значения одного модификатора (защита от читерских сейвов) */
export const PET_MOD_VALUE_CAP = 10000;

export const MAX_ACTIVE_PETS = 3;
export const MAX_PET_LEVEL = 10;

export function petFeedCost(level: number): number {
  return 2 * level;
}

/** Детерминированный rng из строки (миграция старых питомцев без rng-источника) */
export function stableRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^= h >>> 16) >>> 8) / 16777216;
  };
}

/** Генерация модификаторов: первичный стат вида + вторичные из пула */
export function genPetMods(
  species: PetSpeciesId,
  rarity: Rarity,
  rng: () => number,
): PetMod[] {
  const def = getSpecies(species);
  const count = PET_MOD_COUNT[rarity];
  const taken = new Set<PetStat>([def.stat]);
  const stats: PetStat[] = [def.stat];
  const pool = SECONDARY_POOL.filter((s) => !taken.has(s));
  while (stats.length < count && pool.length > 0) {
    const idx = Math.floor(rng() * pool.length);
    stats.push(pool.splice(idx, 1)[0]);
  }
  const mult = PET_RARITY_MULT[rarity];
  return stats.map((stat) => ({
    stat,
    value: Math.round(def.baseBonus * mult * (0.6 + rng() * 0.8) * 10) / 10,
  }));
}

/** Модификаторы питомца с учётом уровня; старые питомцы без mods — детерминированный синтез */
export function petMods(pet: Pet): PetMod[] {
  const source = pet.mods && pet.mods.length > 0 ? pet.mods : genPetMods(pet.species, pet.rarity, stableRng(pet.uid));
  const levelScale = 1 + 0.2 * (pet.level - 1);
  return source.map((m) => ({ stat: m.stat, value: Math.round(m.value * levelScale * 10) / 10 }));
}

/** Бонус уникального пассива (только epic/legendary), звёзды 1..5 */
export function petSkillBonus(pet: Pet): PetMod | null {
  if (!PET_SKILL_MIN_RARITY.includes(pet.rarity) || !pet.skill) return null;
  const def = PET_SKILLS[pet.species];
  if (!def || def.id !== pet.skill.id) return null;
  const stars = Math.max(1, Math.min(MAX_SKILL_STARS, pet.skill.stars));
  return { stat: def.stat, value: Math.round(def.perStar * stars * 10) / 10 };
}

/** Все эффекты питомца: модификаторы + уникальный пассив */
export function petEffects(pet: Pet): PetMod[] {
  const mods = petMods(pet);
  const skill = petSkillBonus(pet);
  return skill ? [...mods, skill] : mods;
}

/** Сумма эффектов команды (моды + скиллы) */
export function petTeamTotals(pets: Pet[]): Record<PetStat, number> {
  const totals = {} as Record<PetStat, number>;
  for (const p of pets) {
    for (const m of petEffects(p)) {
      totals[m.stat] = (totals[m.stat] ?? 0) + m.value;
    }
  }
  for (const k of Object.keys(totals) as PetStat[]) {
    totals[k] = Math.round(totals[k] * 10) / 10;
  }
  return totals;
}

// ---------- Кейсы ----------

export const CASE_RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 40, uncommon: 30, rare: 18, epic: 9, legendary: 3,
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

function petSkillFor(rarity: Rarity, species: PetSpeciesId): PetSkill | undefined {
  if (!PET_SKILL_MIN_RARITY.includes(rarity)) return undefined;
  return { id: PET_SKILLS[species].id, stars: 1 }; // звёзды — A5.2
}

/** Открытие кейса: случайный вид + своя редкость; полное поколение модификаторов */
export function openPetCase(rng: () => number = Math.random): Pet {
  const species = PET_SPECIES[Math.floor(rng() * PET_SPECIES.length)];
  const rarity = rollCaseRarity(rng);
  return {
    uid: `pet_${Date.now().toString(36)}_${Math.floor(rng() * 1e9).toString(36)}`,
    species: species.id,
    rarity,
    level: 1,
    name: species.name,
    mods: genPetMods(species.id, rarity, rng),
    skill: petSkillFor(rarity, species.id),
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
    mods: genPetMods(species, rarity, rng),
    skill: petSkillFor(rarity, species),
  };
}

export const CASE_COST_KEYS = 3;
