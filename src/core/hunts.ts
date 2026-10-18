/**
 * Охота: roguelite-забег (выслеживание → драфт карточек → элитный бой → поимка).
 * Сложность масштабируется от силы игрока, редкость существа — от ролла.
 * Чистая логика + состояние забега, сцена только оркестрирует.
 */
import { Rarity } from './artifacts';
import { PetSpeciesId } from './pets';

// ---------- Существа ----------

export interface CreatureDef {
  id: string;
  name: string;
  icon: string;
  species: PetSpeciesId;
  terrain: string;
  /** множитель наград за редкость существа */
  rewardBias: 'food' | 'keys' | 'gold' | 'capture';
}

export const CREATURES: CreatureDef[] = [
  { id: 'wolf', name: 'Вожак стаи', icon: '🐺', species: 'wolfpup', terrain: 'Дикие земли', rewardBias: 'food' },
  { id: 'bat', name: 'Кровосос', icon: '🦇', species: 'batling', terrain: 'Проклятый лес', rewardBias: 'keys' },
  { id: 'dragon', name: 'Древний дракон', icon: '🐉', species: 'drakeling', terrain: 'Древнее логово', rewardBias: 'gold' },
  { id: 'spirit', name: 'Хранитель святилища', icon: '✨', species: 'spirit', terrain: 'Затерянное святилище', rewardBias: 'capture' },
];

/** Редкость существа: вес рандома, определяет ЦЕННОСТЬ награды (не сложность) */
export const CREATURE_RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 45,
  uncommon: 28,
  rare: 16,
  epic: 8,
  legendary: 3,
};

export function rollCreatureRarity(rng: () => number): Rarity {
  const entries = Object.entries(CREATURE_RARITY_WEIGHTS) as [Rarity, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [r, w] of entries) {
    roll -= w;
    if (roll <= 0) return r;
  }
  return 'common';
}

/** HP существа: от силы ИГРОКА (сложность поимки следует за прогрессом) × редкость */
export const CREATURE_HP_RARITY_MULT: Record<Rarity, number> = {
  common: 0.8,
  uncommon: 1,
  rare: 1.35,
  epic: 1.8,
  legendary: 2.6,
};

/** HP цели = эффективные ~22с авто-ДПС игрока × множитель редкости (мин. 60) */
export function creatureHp(playerDps: number, rarity: Rarity): number {
  return Math.max(60, Math.floor(playerDps * 22 * CREATURE_HP_RARITY_MULT[rarity]));
}

/**
 * Урон существа по выносливости за атаку (раз в 2.5с).
 * Масштаб — от бюджета выносливости (стамина не растёт с ДПС игрока,
 * поэтому атака тоже НЕ должна масштабироваться от ДПС): ~5% базы за удар.
 */
export function creatureAttack(rarity: Rarity, staminaBase = 100): number {
  return Math.max(4, Math.floor(staminaBase * 0.05 * CREATURE_HP_RARITY_MULT[rarity]));
}

// ---------- Карточки забега ----------

export type CardRarity = Rarity;

export interface HuntCard {
  id: string;
  name: string;
  description: string;
  rarity: CardRarity;
  tags: string[]; // наборы/синергии, напр. 'dark' для «Тёмного лорда»
}

/** Модификаторы забега (только внутри забега) */
export interface RunMods {
  dmgMult: number; // к урону по существу
  clickMult: number; // к клику
  staminaMax: number;
  staminaHeal: number;
  captureChance: number; // +к базовому шансу поимки
  goldMult: number;
  critChance: number; // доп. крит на охоте
  lifesteal: number; // доля урона в выносливость
}

export function baseRunMods(): RunMods {
  return { dmgMult: 1, clickMult: 1, staminaMax: 100, staminaHeal: 0, captureChance: 0, goldMult: 1, critChance: 0, lifesteal: 0 };
}

export const HUNT_CARDS: HuntCard[] = [
  // --- common (серые) ---
  { id: 'sharp_blade', name: 'Острый клинок', description: '+15% урона', rarity: 'common', tags: [] },
  { id: 'heavy_hand', name: 'Тяжёлая рука', description: '+20% урона клика', rarity: 'common', tags: [] },
  { id: 'camp', name: 'Лагерь', description: '+25 выносливости', rarity: 'common', tags: [] },
  { id: 'scout_mark', name: 'Знак следопыта', description: '+10% золота охоты', rarity: 'common', tags: [] },
  { id: 'snares', name: 'Силки', description: '+6% шанс поимки', rarity: 'common', tags: [] },
  // --- uncommon ---
  { id: 'hunt_fury', name: 'Ярость охотника', description: '+35% урона', rarity: 'uncommon', tags: [] },
  { id: 'quick_feet', name: 'Быстрые ноги', description: '+40% урона клика', rarity: 'uncommon', tags: [] },
  { id: 'field_cook', name: 'Полевая кухня', description: '+45 выносливости и лечение 30', rarity: 'uncommon', tags: [] },
  { id: 'keen_nose', name: 'Острый нюх', description: '+12% шанс поимки', rarity: 'uncommon', tags: [] },
  { id: 'blood_mark', name: 'Кровавая метка', description: '+12% крит на охоте', rarity: 'uncommon', tags: ['dark'] },
  // --- rare ---
  { id: 'ashen_blade', name: 'Пепельный клинок', description: '+80% урона, −15 выносливости', rarity: 'rare', tags: [] },
  { id: 'trapmaster', name: 'Мастер ловушек', description: '+25% шанс поимки', rarity: 'rare', tags: [] },
  { id: 'dark_seal', name: 'Тёмная печать', description: 'Вампиризм 8% (набор «Тёмный лорд»)', rarity: 'rare', tags: ['dark'] },
  // --- epic ---
  { id: 'blood_feast', name: 'Кровавый пир', description: 'Вампиризм 15% (набор «Тёмный лорд»)', rarity: 'epic', tags: ['dark'] },
  { id: 'twin_fang', name: 'Клыки-близнецы', description: '+150% урона клика', rarity: 'epic', tags: [] },
  { id: 'gold_scent', name: 'Золото в крови', description: '+80% золота охоты', rarity: 'epic', tags: [] },
  // --- legendary (золотые) ---
  { id: 'heart_of_darkness', name: 'Сердце Тьмы', description: 'Синергия «Тёмный лорд»: ×1.6 урона и вампиризм 25%', rarity: 'legendary', tags: ['dark'] },
  { id: 'dragon_roar', name: 'Рёв дракона', description: '+200% урона существу', rarity: 'legendary', tags: [] },
  { id: 'golden_cage', name: 'Золотая клетка', description: '+45% шанс поимки', rarity: 'legendary', tags: [] },
];

export const CARD_RARITY_WEIGHTS: Record<CardRarity, number> = {
  common: 50,
  uncommon: 28,
  rare: 14,
  epic: 6,
  legendary: 2,
};

/** Синергии: подсчёт по тегам собранных карточек */
export const SYNERGIES: { id: string; name: string; tag: string; need: number; apply: (m: RunMods) => void; description: string }[] = [
  {
    id: 'dark_lord',
    name: 'Тёмный Лорд',
    tag: 'dark',
    need: 3,
    description: '3 карты тьмы: ×1.6 урона, вампиризм 25%',
    apply: (m) => {
      m.dmgMult *= 1.6;
      m.lifesteal = Math.max(m.lifesteal, 0.25);
    },
  },
];

/** Эффекты карточек применяются к модификаторам забега */
export function applyCard(mods: RunMods, card: HuntCard): RunMods {
  const m = { ...mods };
  switch (card.id) {
    case 'sharp_blade': m.dmgMult += 0.15; break;
    case 'heavy_hand': m.clickMult += 0.2; break;
    case 'camp': m.staminaMax += 25; break;
    case 'scout_mark': m.goldMult += 0.1; break;
    case 'snares': m.captureChance += 0.06; break;
    case 'hunt_fury': m.dmgMult += 0.35; break;
    case 'quick_feet': m.clickMult += 0.4; break;
    case 'field_cook': m.staminaMax += 45; m.staminaHeal += 30; break;
    case 'keen_nose': m.captureChance += 0.12; break;
    case 'blood_mark': m.critChance += 0.12; break;
    case 'ashen_blade': m.dmgMult += 0.8; m.staminaMax -= 15; break;
    case 'trapmaster': m.captureChance += 0.25; break;
    case 'dark_seal': m.lifesteal += 0.08; break;
    case 'blood_feast': m.lifesteal += 0.15; break;
    case 'twin_fang': m.clickMult += 1.5; break;
    case 'gold_scent': m.goldMult += 0.8; break;
    case 'heart_of_darkness': m.dmgMult += 0.2; break; // основную силу даёт синергия
    case 'dragon_roar': m.dmgMult += 2; break;
    case 'golden_cage': m.captureChance += 0.45; break;
  }
  return m;
}

/** Драфт: 3 (или 4 при «Быстрых ногах»-бонусах) карточки, без дублей в одном драфте */
export function rollDraft(count: number, rng: () => number, exclude: Set<string> = new Set()): HuntCard[] {
  const pool = HUNT_CARDS.filter((c) => !exclude.has(c.id));
  const picked: HuntCard[] = [];
  const used = new Set<string>();
  while (picked.length < count && used.size < pool.length) {
    // ролл редкости → ролл карты этой редкости
    const rw = Object.entries(CARD_RARITY_WEIGHTS) as [CardRarity, number][];
    const total = rw.reduce((s, [, w]) => s + w, 0);
    let roll = rng() * total;
    let rarity: CardRarity = 'common';
    for (const [r, w] of rw) {
      roll -= w;
      if (roll <= 0) { rarity = r; break; }
    }
    const tier = pool.filter((c) => c.rarity === rarity && !used.has(c.id));
    const source = tier.length > 0 ? tier : pool.filter((c) => !used.has(c.id));
    if (source.length === 0) break;
    const card = source[Math.floor(rng() * source.length)];
    used.add(card.id);
    picked.push(card);
  }
  return picked;
}

// ---------- Забег ----------

export type HuntPhase = 'track' | 'elite' | 'final' | 'won' | 'lost';

export interface HuntRunState {
  creature: CreatureDef;
  creatureRarity: Rarity;
  creatureHp: number;
  creatureMaxHp: number;
  creatureAtk: number;
  phase: HuntPhase;
  trackStep: number; // 0..TRACK_STEPS-1
  stamina: number;
  pickedCards: HuntCard[];
  /** пассивный бонус питомцев к поимке, переживает драфты */
  extraCapture: number;
  mods: RunMods;
  foodFound: number;
  keysFound: number;
}

export const TRACK_STEPS = 3;
export const CREATURE_ATTACK_MS = 2500;
export const BASE_CAPTURE_CHANCE = 0.4;

/** Создание забега: сложность от силы игрока, редкость — от ролла */
export function startHunt(
  creature: CreatureDef,
  rarity: Rarity,
  playerDps: number,
  extraCapture = 0,
  rng: () => number = Math.random,
): HuntRunState {
  void rng;
  const hp = creatureHp(playerDps, rarity);
  return {
    creature,
    creatureRarity: rarity,
    creatureHp: hp,
    creatureMaxHp: hp,
    creatureAtk: creatureAttack(rarity),
    phase: 'track',
    trackStep: 0,
    stamina: baseRunMods().staminaMax,
    pickedCards: [],
    extraCapture,
    mods: baseRunMods(),
    foodFound: 0,
    keysFound: 0,
  };
}

/** Итоговые модификаторы с учётом синергий (пересчёт каждый раз из pickedCards) */
export function computeRunMods(run: HuntRunState): RunMods {
  let mods = baseRunMods();
  for (const card of run.pickedCards) {
    mods = applyCard(mods, card);
  }
  for (const syn of SYNERGIES) {
    const count = run.pickedCards.filter((c) => c.tags.includes(syn.tag)).length;
    if (count >= syn.need) syn.apply(mods);
  }
  return mods;
}

/** Активные синергии забега (для UI) */
export function activeSynergies(run: HuntRunState): typeof SYNERGIES {
  return SYNERGIES.filter((syn) =>
    run.pickedCards.filter((c) => c.tags.includes(syn.tag)).length >= syn.need);
}

/** Шанс поимки после победы (клампится) */
export function captureChance(run: HuntRunState, petTeamBonus = 0): number {
  const mods = computeRunMods(run);
  const rarePenalty: Record<Rarity, number> = { common: 0, uncommon: -0.05, rare: -0.1, epic: -0.15, legendary: -0.2 };
  // вид 'capture' (Хранитель святилища) ловится лучше
  const speciesBonus = run.creature.rewardBias === 'capture' ? 0.1 : 0;
  const chance =
    BASE_CAPTURE_CHANCE + speciesBonus + mods.captureChance + run.extraCapture + petTeamBonus +
    rarePenalty[run.creatureRarity];
  return Math.max(0.15, Math.min(0.95, chance));
}

export interface HuntRewards {
  gold: number;
  food: number;
  keys: number;
  captured: boolean;
}

/** Награды за ПОБЕДУ: масштаб от силы игрока (золото ≈ 90с дохода) × редкость × бейсы существа */
export const KEY_CHANCE_CAP = 0.95;

export function victoryRewards(
  run: HuntRunState,
  playerIncomePerSec: number,
  rng: () => number = Math.random,
  keyBonus = 0, // суммарный бонус keyChance (питомцы + артефакты), в долях
): HuntRewards {
  const r = run.creatureRarity;
  const mods = computeRunMods(run); // карточки реально влияют на золото
  const goldBase = playerIncomePerSec * 90;
  const gold = Math.floor(goldBase * mods.goldMult * (0.2 + CREATURE_HP_RARITY_MULT[r]));
  let food = 2 + Math.floor(2 * CREATURE_HP_RARITY_MULT[r]) + run.foodFound; // найденное на шагах сохраняется
  let keys = run.keysFound;
  const keyChance = Math.min(KEY_CHANCE_CAP, 0.3 + keyBonus);
  if (rng() < keyChance) keys += 1;
  switch (run.creature.rewardBias) {
    case 'food': food += 3; break;
    case 'keys':
      if (rng() < Math.min(KEY_CHANCE_CAP, 0.4 + keyBonus)) keys += 1;
      break;
    case 'gold': break;
    case 'capture': food += 1; break;
  }
  return { gold, food, keys, captured: false };
}

/** Лечение вампиризмом: ровно lifesteal-доля урона (раньше ошибочно ×0.01) */
export function lifestealHeal(dmg: number, mods: RunMods): number {
  return dmg * mods.lifesteal;
}

/** Утешительные награды за ПОРАЖЕНИЕ (существо ушло) */
export function defeatRewards(run: HuntRunState): HuntRewards {
  return { gold: 0, food: 1 + run.foodFound, keys: run.keysFound, captured: false };
}
