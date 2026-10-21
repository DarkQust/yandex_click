/**
 * Система сохранений: сериализация состояния, localStorage + облако Яндекса.
 */
import { GRID_SIZE } from './config';
import { Weapon } from './economy';
import { Artifact, AFFIX_POOL, MAX_EQUIPPED, RARITIES } from './artifacts';
import { RiftProgress, defaultRiftProgress, RIFTS, RiftId } from './expeditions';
import { HUNT_RANKS } from './hunts';
import {
  Pet, PetSpeciesId, PetMod, MAX_ACTIVE_PETS, MAX_SKILL_STARS, PET_MOD_COUNT, PET_MOD_VALUE_CAP,
  PET_SPECIES, PET_SKILLS, PET_SKILL_MIN_RARITY, VALID_PET_STATS, genPetMods, stableRng,
} from './pets';


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
  // --- v2: система артефактов ---
  shards: number; // Осколки Разлома — крафт
  stabilizers: number; // Стабилизаторы — рерoll аффиксов
  artifacts: Artifact[]; // инвентарь
  equippedIds: string[]; // экипированные (макс MAX_EQUIPPED)
  // --- v3: Разломы ---
  riftProgress: Record<string, RiftProgress>;
  // --- v4: Охота и питомцы ---
  pets: Pet[];
  activePetIds: string[]; // команда до MAX_ACTIVE_PETS
  keys: number; // ключи от кейсов питомцев
  bait: number; // приманки для охоты
  petFood: number; // корм для прокачки
  huntsWon: number;
  huntRank: number; // выбранный ранг охоты (0..4)
  /** Максимальный КОГДА-ЛИБО открытый ранг — разблокировка постоянна,
   *  трата душ (будущий ресурс) не закрывает ранги повторно */
  maxUnlockedHuntRank: number;
  lastSeen: number;
}

export const SAVE_VERSION = 4;
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
    shards: 30, // стартовый бонус для знакомства с крафтом
    stabilizers: 2,
    artifacts: [],
    equippedIds: [],
    riftProgress: defaultRiftProgress(),
    pets: [],
    activePetIds: [],
    keys: 1, // стартовая: знакомство с кейсами
    bait: 2, // стартовые: первые охоты
    petFood: 3,
    huntsWon: 0,
    huntRank: 0,
    maxUnlockedHuntRank: 0,
    lastSeen: Date.now(),
  };
}

const VALID_STATS = new Set(AFFIX_POOL.map((a) => a.stat));

/** Минимальная структурная валидация артефактов из сейва */
/** Безопасное неотрицательное целое (NaN/Infinity/строки -> fallback) */
function safeNonNegInt(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : fallback;
}

function sanitizeArtifacts(raw: unknown): Artifact[] {
  if (!Array.isArray(raw)) return [];
  const out: Artifact[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Partial<Artifact>;
    if (typeof a.id !== 'string' || a.id.length === 0) continue;
    if (typeof a.rarity !== 'string' || !RARITIES.includes(a.rarity)) continue;
    if (!Array.isArray(a.affixes)) continue;
    const affixes = a.affixes.filter(
      (af): af is Artifact['affixes'][number] =>
        !!af &&
        typeof af === 'object' &&
        VALID_STATS.has((af as { stat?: string }).stat as never) &&
        Number.isFinite((af as { value?: number }).value) &&
        typeof (af as { secret?: boolean }).secret === 'boolean',
    );
    out.push({
      id: a.id,
      name: typeof a.name === 'string' ? a.name : '',
      rarity: a.rarity,
      affixes,
      createdAt: Number.isFinite(a.createdAt) ? (a.createdAt as number) : Date.now(),
    });
  }
  return out;
}

/** Минимальная структурная валидация питомцев из сейва */
function sanitizePets(raw: unknown): Pet[] {
  if (!Array.isArray(raw)) return [];
  const speciesIds = new Set(PET_SPECIES.map((x) => x.id as string));
  const out: Pet[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Partial<Pet>;
    if (typeof p.uid !== 'string' || p.uid.length === 0) continue;
    if (typeof p.species !== 'string' || !speciesIds.has(p.species as PetSpeciesId)) continue;
    if (typeof p.rarity !== 'string' || !RARITIES.includes(p.rarity)) continue;
    const rarity = p.rarity;
    const species = p.species as PetSpeciesId;
    // модификаторы: строгая валидация — whitelist статов, положительное значение с капом;
    // при несоответствии количества редкости — детерминированный пересинтез из uid
    let mods: PetMod[] = [];
    let modsCorrupt = false;
    if (Array.isArray(p.mods)) {
      for (const m of p.mods) {
        const valid =
          !!m && typeof m === 'object' &&
          typeof (m as { stat?: string }).stat === 'string' &&
          VALID_PET_STATS.has((m as { stat?: string }).stat as PetMod['stat']) &&
          Number.isFinite((m as { value?: number }).value) &&
          (m as { value: number }).value > 0 &&
          (m as { value: number }).value <= PET_MOD_VALUE_CAP;
        if (valid) {
          mods.push(m as PetMod);
        } else {
          modsCorrupt = true; // любой мусор обесценивает весь набор
        }
      }
    }
    // пересинтез: легаси-питомец (без модов), неверное количество ИЛИ любой битый элемент
    if (modsCorrupt || mods.length !== PET_MOD_COUNT[rarity]) {
      mods = genPetMods(species, rarity, stableRng(p.uid)); // детерминированно из uid
    }
    // уникальный пассив: только топ-редкости, ID нормализуется к виду, звёзды 1..5 (int)
    let skill = p.skill;
    if (!PET_SKILL_MIN_RARITY.includes(rarity)) {
      skill = undefined; // у common..rare пассива нет
    } else if (!skill || typeof skill.id !== 'string') {
      skill = { id: PET_SKILLS[species].id, stars: 1 };
    } else {
      const stars = Math.max(1, Math.min(MAX_SKILL_STARS, safeNonNegInt(skill.stars, 1) || 1));
      skill = { id: PET_SKILLS[species].id, stars: skill.id === PET_SKILLS[species].id ? stars : 1 };
    }
    out.push({
      uid: p.uid,
      species,
      rarity,
      level: Math.max(1, Math.min(10, safeNonNegInt(p.level, 1) || 1)),
      name: typeof p.name === 'string' ? p.name : '',
      mods,
      skill,
    });
  }
  return out;
}

/** Валидация и миграция загруженных данных */
export function sanitizeSave(raw: unknown): SaveData {
  const def = createDefaultSave();
  if (!raw || typeof raw !== 'object') return def;
  const r = raw as Partial<SaveData>;
  const grid = Array.isArray(r.grid) ? r.grid.slice(0, GRID_SIZE) : def.grid;
  while (grid.length < GRID_SIZE) grid.push(null);
  const out: SaveData = {
    ...def,
    ...r,
    gold: Number.isFinite(r.gold) ? (r.gold as number) : def.gold,
    crystals: Number.isFinite(r.crystals) ? (r.crystals as number) : 0,
    souls: Number.isFinite(r.souls) ? (r.souls as number) : 0,
    skills: r.skills && typeof r.skills === 'object' ? r.skills : {},
    shards: Number.isFinite(r.shards) ? (r.shards as number) : 30,
    keys: safeNonNegInt(r.keys, 1),
    bait: safeNonNegInt(r.bait, 2),
    petFood: safeNonNegInt(r.petFood, 3),
    huntsWon: safeNonNegInt(r.huntsWon, 0),
    huntRank: Math.max(0, Math.min(HUNT_RANKS.length - 1, safeNonNegInt(r.huntRank, 0))),
    maxUnlockedHuntRank: Math.max(
      0,
      Math.min(HUNT_RANKS.length - 1, safeNonNegInt(r.maxUnlockedHuntRank, 0)),
    ),
    stabilizers: Number.isFinite(r.stabilizers) ? (r.stabilizers as number) : 2,
    artifacts: sanitizeArtifacts(r.artifacts),
    grid,
    version: SAVE_VERSION,
  };
  // riftProgress: заполняем недостающие разломы дефолтами, чистим лишние/битые
  const riftDef = defaultRiftProgress();
  if (r.riftProgress && typeof r.riftProgress === 'object') {
    for (const rift of RIFTS) {
      const rawP = (r.riftProgress as Record<string, Partial<RiftProgress>>)[rift.id as RiftId];
      if (rawP && Number.isFinite(rawP.maxDepth)) {
        riftDef[rift.id] = {
          maxDepth: safeNonNegInt(rawP.maxDepth),
          clears: safeNonNegInt(rawP.clears),
          autoFarm: rawP.autoFarm === true,
          autoFarmProgress: Number.isFinite(rawP.autoFarmProgress) ? Math.min(0.999, Math.max(0, rawP.autoFarmProgress ?? 0)) : 0,
        };
      }
    }
  }
  out.riftProgress = riftDef;
  // питомцы: структурная валидация + команда без дублей/призраков/лимита
  out.pets = sanitizePets(r.pets);
  const petIds = new Set(out.pets.map((x) => x.uid));
  out.activePetIds = (Array.isArray(r.activePetIds) ? r.activePetIds : [])
    .filter((id): id is string => typeof id === 'string')
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .filter((id) => petIds.has(id))
    .slice(0, MAX_ACTIVE_PETS);
  // очистка equippedIds: дубли, не-строки, ID отсутствующих артефактов, лимит слотов
  const inventoryIds = new Set(out.artifacts.map((a) => a.id));
  out.equippedIds = (Array.isArray(r.equippedIds) ? r.equippedIds : [])
    .filter((id): id is string => typeof id === 'string')
    .filter((id, i, arr) => arr.indexOf(id) === i) // без дублей
    .filter((id) => inventoryIds.has(id))
    .slice(0, MAX_EQUIPPED);
  return out;
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
