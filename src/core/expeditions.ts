/**
 * Разломы (Expeditions) — data-driven бесконечный idle-контент.
 * Одна система правил + определения разломов; глубина масштабируется формулами.
 * Чистая логика, тестируемо, rng инжектируем.
 */
import { StatId } from './artifacts';

// ---------- Типы ----------

export type RiftId = 'forge' | 'arcane' | 'mechanism' | 'chaos';

export type RoomType = 'combat' | 'treasure' | 'event' | 'elite' | 'mystery' | 'boss';

export interface RiftModifiers {
  enemyHpMult: number;
  playerDmgMult: number;
  shardMult: number;
  rarityBonus: number; // 0..1 сдвиг редкости артефактов
  secretBonus: number; // +к шансу secret-аффикса (капится craftArtifact до 2%)
  extraRooms: number;
  autoFarmSpeedMult: number;
}

export interface RiftDef {
  id: RiftId;
  name: string;
  icon: string;
  description: string;
  /** уникальная фишка геймплея */
  unique: string;
  color: number;
  modifiers: RiftModifiers;
  /** предпочтительные статы артефактов из этого разлома */
  affixBias: StatId[];
  /** сдвиг весов типов комнат (combat/treasure/event/elite/mystery) */
  roomBias?: Partial<Record<RoomType, number>>;
}

export interface RiftProgress {
  maxDepth: number; // максимальная пройденная глубина
  clears: number; // всего зачисток
  autoFarm: boolean; // включён ли автофарм
  autoFarmProgress: number; // 0..1 прогресс текущей зачистки (автофарм)
}

export interface RoomRun {
  type: RoomType;
  enemyHp: number; // 0 для небоевых
  rewards: RoomRewards;
}

export interface RoomRewards {
  shards: number;
  stabilizerChance: number; // 0..1
  artifactChance: number; // 0..1
  gold: number;
}

// ---------- Определения разломов ----------

const BASE_MODS: RiftModifiers = {
  enemyHpMult: 1,
  playerDmgMult: 1,
  shardMult: 1,
  rarityBonus: 0,
  secretBonus: 0,
  extraRooms: 0,
  autoFarmSpeedMult: 1,
};

export const RIFTS: RiftDef[] = [
  {
    id: 'forge',
    name: 'Разлом Кузнеца',
    icon: '🔨',
    description: 'Гнёздo оружейной мощи. Крепкие враги, богатые клинки.',
    unique: 'Враги +50% HP; выше редкость артефактов; уклон в ДПС-аффиксы.',
    color: 0xd86a3a,
    modifiers: { ...BASE_MODS, enemyHpMult: 1.5, rarityBonus: 0.15 },
    affixBias: ['dps', 'critChance', 'critMult', 'click'],
  },
  {
    id: 'arcane',
    name: 'Разлом Арканы',
    icon: '✨',
    description: 'Магическая аномалия. Слабее бьёшь — больше находишь.',
    unique: 'Ваш урон −30%; осколков ×1.5 и больше тайных комнат (стабилизаторы).',
    color: 0x9a5adf,
    modifiers: { ...BASE_MODS, playerDmgMult: 0.7, shardMult: 1.5 },
    affixBias: ['income', 'offlineRate', 'crystal', 'dungeonGold'],
    roomBias: { mystery: +8, event: +8, combat: -16 },
  },
  {
    id: 'mechanism',
    name: 'Разлом Механизма',
    icon: '⚙',
    description: 'Кузня-автомат. Длинные маршруты, безупречная механика.',
    unique: '+2 комнаты; автофарм в 2 раза быстрее; уклон в крит/скорость.',
    color: 0x4ac0d8,
    modifiers: { ...BASE_MODS, extraRooms: 2, autoFarmSpeedMult: 2 },
    affixBias: ['critMult', 'critChance', 'luckyMerge', 'spawnDiscount'],
  },
  {
    id: 'chaos',
    name: 'Разлом Хаоса',
    icon: '🌀',
    description: 'Правила меняются каждый заход. Велик риск, велика награда.',
    unique: 'Случайные модификаторы HP/урона; шанс secret-аффикса до капа 2%.',
    color: 0xff5a8a,
    modifiers: { ...BASE_MODS, secretBonus: 0.015, shardMult: 1.2 }, // 0.5%+1.5%=2% кап
    affixBias: [], // хаос не знает предпочтений
    roomBias: { elite: +6, mystery: +6, treasure: -6, combat: -6 },
  },
];

export function getRift(id: RiftId): RiftDef {
  const r = RIFTS.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown rift: ${id}`);
  return r;
}

// ---------- Формулы масштабирования глубины (баланс: A7) ----------

export const RIFT_BASE_HP = 30;
export const RIFT_HP_GROWTH = 1.35;
export const RIFT_BASE_SHARDS = 2;
export const RIFT_SHARDS_PER_DEPTH = 0.6;
export const RIFT_GOLD_BASE = 20;
export const RIFT_GOLD_GROWTH = 1.3;
/** сколько секунд должна занимать полная зачистка при requiredDps */
export const RIFT_TARGET_CLEAR_SEC = 30;
/** эффективность оффлайна по разломам */
export const RIFT_OFFLINE_EFFICIENCY = 0.75;

/** HP обычного врага глубины d (elite ×3, boss ×6) */
export function riftEnemyHp(depth: number, type: RoomType, hpMult = 1): number {
  const base = RIFT_BASE_HP * Math.pow(RIFT_HP_GROWTH, depth - 1);
  const mult = type === 'elite' ? 3 : type === 'boss' ? 6 : 1;
  return Math.floor(base * mult * hpMult);
}

/** Количество комнат в заходе (без босса): 3 + floor(d/5), кап 7, + модификатор разлома */
export function riftRoomCount(depth: number, rift: RiftDef): number {
  return 3 + Math.min(4, Math.floor(depth / 5)) + rift.modifiers.extraRooms;
}

/** Награды за комнату типа type на глубине d */
export function roomRewards(depth: number, type: RoomType, rift: RiftDef): RoomRewards {
  const m = rift.modifiers;
  const shards = Math.floor((RIFT_BASE_SHARDS + depth * RIFT_SHARDS_PER_DEPTH) * m.shardMult);
  const gold = Math.floor(RIFT_GOLD_BASE * Math.pow(RIFT_GOLD_GROWTH, depth - 1));
  switch (type) {
    case 'combat':
      return { shards, stabilizerChance: 0, artifactChance: 0, gold };
    case 'elite':
      return { shards: shards * 2, stabilizerChance: 0.25, artifactChance: 0.05, gold: gold * 2 };
    case 'treasure':
      return { shards: shards * 3, stabilizerChance: 0.1, artifactChance: 0, gold: gold };
    case 'event':
      return { shards, stabilizerChance: 0.15, artifactChance: 0.03, gold: Math.floor(gold * 1.5) };
    case 'mystery':
      return { shards: Math.floor(shards * 1.5), stabilizerChance: 0.2, artifactChance: 0.05, gold };
    case 'boss':
      return {
        shards: shards * 3,
        stabilizerChance: 0.5,
        artifactChance: 0.15 + Math.min(0.25, depth * 0.005),
        gold: gold * 4,
      };
  }
}

/** Веса типов комнат с учётом смещений разлома */
export function roomTypeWeights(rift: RiftDef): Record<Exclude<RoomType, 'boss'>, number> {
  const base = { combat: 50, treasure: 15, event: 15, elite: 12, mystery: 8 };
  if (rift.roomBias) {
    for (const [k, v] of Object.entries(rift.roomBias)) {
      const key = k as keyof typeof base;
      base[key] = Math.max(1, base[key] + (v ?? 0));
    }
  }
  return base;
}

/** Генерация маршрута захода: комнаты + финальный босс */
export function generateRooms(depth: number, rift: RiftDef, rng: () => number): RoomRun[] {
  const weights = roomTypeWeights(rift);
  const pool = (Object.entries(weights) as [Exclude<RoomType, 'boss'>, number][])
    .map(([type, weight]) => ({ type, weight }));
  const total = pool.reduce((s, p) => s + p.weight, 0);
  const rooms: RoomRun[] = [];
  const n = riftRoomCount(depth, rift);
  for (let i = 0; i < n; i++) {
    let roll = rng() * total;
    let type: RoomType = 'combat';
    for (const p of pool) {
      roll -= p.weight;
      if (roll <= 0) { type = p.type; break; }
    }
    const hp = type === 'combat' || type === 'elite' ? riftEnemyHp(depth, type, rift.modifiers.enemyHpMult) : 0;
    rooms.push({ type, enemyHp: hp, rewards: roomRewards(depth, type, rift) });
  }
  rooms.push({
    type: 'boss',
    enemyHp: riftEnemyHp(depth, 'boss', rift.modifiers.enemyHpMult),
    rewards: roomRewards(depth, 'boss', rift),
  });
  return rooms;
}

/** Суммарный HP-тотал захода (для автофарма/оффлайна) */
export function totalRiftHp(depth: number, rift: RiftDef): number {
  // ожидаемое распределение комнат (без boss): средний hp-mult
  const w = roomTypeWeights(rift);
  const total = w.combat + w.treasure + w.event + w.elite + w.mystery;
  const combatShare = (w.combat + w.elite * 3) / total; // elite считаем как ×3
  const n = riftRoomCount(depth, rift);
  const base = RIFT_BASE_HP * Math.pow(RIFT_HP_GROWTH, depth - 1) * rift.modifiers.enemyHpMult;
  return base * (n * combatShare + 6); // + босс ×6
}

/** Требуемый ДПС для автофарма глубины (очистка за RIFT_TARGET_CLEAR_SEC) */
export function requiredDps(depth: number, rift: RiftDef): number {
  return totalRiftHp(depth, rift) / (RIFT_TARGET_CLEAR_SEC * rift.modifiers.playerDmgMult);
}

/** Время полной зачистки при данном ДПС (для автофарма) */
export function clearTime(depth: number, rift: RiftDef, playerDps: number): number {
  const effDps = Math.max(1, playerDps * rift.modifiers.playerDmgMult);
  const t = totalRiftHp(depth, rift) / effDps;
  return Math.max(20, t); // не быстрее 20с даже на освоенных глубинах
}

/** Бандл наград за ПОЛНУЮ зачистку (для автофарма/оффлайна, агрегированно) */
export function fullClearRewards(depth: number, rift: RiftDef): RoomRewards {
  const w = roomTypeWeights(rift);
  const total = w.combat + w.treasure + w.event + w.elite + w.mystery;
  const n = riftRoomCount(depth, rift);
  // средняя награда на комнату
  const avg = (['combat', 'treasure', 'event', 'elite', 'mystery'] as const).reduce(
    (acc, t) => {
      const r = roomRewards(depth, t, rift);
      const share = w[t] / total;
      acc.shards += r.shards * share;
      acc.stabilizerChance += r.stabilizerChance * share;
      acc.artifactChance += r.artifactChance * share;
      acc.gold += r.gold * share;
      return acc;
    },
    { shards: 0, stabilizerChance: 0, artifactChance: 0, gold: 0 },
  );
  const boss = roomRewards(depth, 'boss', rift);
  return {
    shards: Math.floor(avg.shards * n) + boss.shards,
    stabilizerChance: Math.min(1, (avg.stabilizerChance * n) + boss.stabilizerChance),
    artifactChance: Math.min(0.6, (avg.artifactChance * n) + boss.artifactChance),
    gold: Math.floor(avg.gold * n) + boss.gold,
  };
}

// ---------- Прогресс и автофарм ----------

export function defaultRiftProgress(): Record<RiftId, RiftProgress> {
  const out = {} as Record<RiftId, RiftProgress>;
  for (const r of RIFTS) {
    out[r.id] = { maxDepth: 0, clears: 0, autoFarm: false, autoFarmProgress: 0 };
  }
  return out;
}

export interface ClearGrant {
  shards: number;
  stabilizers: number;
  artifacts: number; // количество артефактов-дропов (редкость по rift при выдаче)
  gold: number;
}

/** Ролл бандла одной зачистки (активный автoфарм) */
export function rollClearBundle(rewards: RoomRewards, rng: () => number): ClearGrant {
  return {
    shards: rewards.shards,
    stabilizers: rng() < rewards.stabilizerChance ? 1 : 0,
    artifacts: rng() < rewards.artifactChance ? 1 : 0,
    gold: rewards.gold,
  };
}

/** floor + вероятностный остаток: floor(x) + (rng < frac ? 1 : 0). Сохраняет матожидание. */
export function probabilisticFloor(x: number, rng: () => number): number {
  const f = Math.floor(x);
  return f + (rng() < x - f ? 1 : 0);
}

/**
 * Aggregated бандл для оффлайна (без посимвольной симуляции каждого боя).
 * Вероятностные выпадения НЕ теряются: floor + вероятностный остаток
 * (матожидание = chance * clears).
 */
export function offlineClearBundle(rewards: RoomRewards, clears: number, rng: () => number = Math.random): ClearGrant {
  return {
    shards: rewards.shards * clears,
    stabilizers: probabilisticFloor(rewards.stabilizerChance * clears, rng),
    artifacts: probabilisticFloor(rewards.artifactChance * clears, rng),
    gold: rewards.gold * clears,
  };
}

/**
 * Шаг автофарма: накопление прогресса зачистки.
 * @returns [новый прогресс, сколько полных зачисток завершено]
 */
export function tickAutoFarm(
  progress: RiftProgress,
  rift: RiftDef,
  playerDps: number,
  dtSec: number,
): [RiftProgress, number] {
  // фармим максимально освоенную глубину; если не пройдено ничего — глубину 1
  const depth = Math.max(1, progress.maxDepth);
  if (playerDps < requiredDps(depth, rift)) return [progress, 0]; // слабоваты — фарм в паузе
  const t = clearTime(depth, rift, playerDps);
  const add = (dtSec * rift.modifiers.autoFarmSpeedMult) / t;
  let p = progress.autoFarmProgress + add;
  const clears = Math.floor(p);
  p -= clears;
  return [{ ...progress, autoFarmProgress: p }, clears];
}

/** Оффлайн-награды разломов: агрегированно, кап по времени, эффективность 75% */
export function offlineRiftGrants(
  progress: RiftProgress,
  rift: RiftDef,
  playerDps: number,
  secondsAway: number,
  capSeconds: number,
): { depth: number; grant: ClearGrant } | null {
  if (!progress.autoFarm) return null;
  const depth = Math.max(1, progress.maxDepth);
  if (playerDps < requiredDps(depth, rift)) return null;
  const capped = Math.min(secondsAway, capSeconds) * RIFT_OFFLINE_EFFICIENCY;
  const clears = Math.floor((capped * rift.modifiers.autoFarmSpeedMult) / clearTime(depth, rift, playerDps));
  if (clears <= 0) return null;
  return { depth, grant: offlineClearBundle(fullClearRewards(depth, rift), clears) };
}
