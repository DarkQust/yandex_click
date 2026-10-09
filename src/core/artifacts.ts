/**
 * Ядро системы артефактов: редкости, аффиксы, крафт, рерoll, распыл.
 * Чистая логика без Phaser. Все роллы через инжектируемый rng (тестируемо).
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const RARITY_INFO: Record<
  Rarity,
  { ru: string; affixes: number; valueMult: number; color: number; salvageShards: number }
> = {
  common: { ru: 'Кованый', affixes: 1, valueMult: 1, color: 0xb0b0b0, salvageShards: 5 },
  uncommon: { ru: 'Искусный', affixes: 2, valueMult: 1.3, color: 0x5ad27a, salvageShards: 12 },
  rare: { ru: 'Рунический', affixes: 3, valueMult: 1.7, color: 0x4ab0ff, salvageShards: 30 },
  epic: { ru: 'Героический', affixes: 4, valueMult: 2.3, color: 0xb05aff, salvageShards: 80 },
  legendary: { ru: 'Легендарный', affixes: 5, valueMult: 3, color: 0xffa53a, salvageShards: 200 },
};

/** Веса редкости при крафте (из 100) */
export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 50,
  uncommon: 28,
  rare: 14,
  epic: 6,
  legendary: 2,
};

/** Статистики аффиксов — покрывают все idle-механики */
export type StatId =
  | 'income'
  | 'dps'
  | 'click'
  | 'critChance'
  | 'critMult'
  | 'spawnDiscount'
  | 'offlineRate'
  | 'luckyMerge'
  | 'dungeonGold'
  | 'crystal'
  | 'petEfficiency'
  | 'shardBonus'
  | 'keyChance'
  | 'offlineCap';

export interface AffixDef {
  stat: StatId;
  ru: string;
  weight: number;
  min: number;
  max: number;
  secret: boolean;
}

export const AFFIX_POOL: AffixDef[] = [
  { stat: 'income', ru: '+% к доходу', weight: 18, min: 5, max: 15, secret: false },
  { stat: 'dps', ru: '+% к ДПС', weight: 16, min: 6, max: 18, secret: false },
  { stat: 'click', ru: '+% к урону клика', weight: 12, min: 10, max: 30, secret: false },
  { stat: 'critChance', ru: '+% шанс крита', weight: 10, min: 2, max: 5, secret: false },
  { stat: 'critMult', ru: '+% сила крита', weight: 8, min: 15, max: 40, secret: false },
  { stat: 'spawnDiscount', ru: '-% цена ковки', weight: 8, min: 3, max: 8, secret: false },
  { stat: 'offlineRate', ru: '+% оффлайн-доход', weight: 6, min: 10, max: 25, secret: false },
  { stat: 'luckyMerge', ru: '+% удача слияния', weight: 6, min: 2, max: 6, secret: false },
  { stat: 'dungeonGold', ru: '+% золото данжа', weight: 10, min: 8, max: 20, secret: false },
  { stat: 'crystal', ru: '+% кристаллы боссов', weight: 6, min: 5, max: 15, secret: false },
  { stat: 'petEfficiency', ru: '+% эффективность питомцев', weight: 25, min: 8, max: 14, secret: true },
  { stat: 'shardBonus', ru: '+% осколки разломов', weight: 25, min: 10, max: 25, secret: true },
  { stat: 'keyChance', ru: '+% шанс ключа на охоте', weight: 25, min: 15, max: 30, secret: true },
  { stat: 'offlineCap', ru: '+ч к лимиту оффлайна', weight: 25, min: 1, max: 3, secret: true },
];

export interface Affix {
  stat: StatId;
  value: number;
  secret: boolean;
}

export interface Artifact {
  id: string;
  name: string;
  rarity: Rarity;
  affixes: Affix[];
  createdAt: number;
}

// ---------- Экономика артефактов ----------
export const CRAFT_COST_SHARDS = 25;
export const REROLL_COST_STABILIZERS = 1;
export const BASE_SECRET_CHANCE = 0.005; // 0.5%
export const MAX_SECRET_CHANCE = 0.02; // 2% — жёсткий кап
/**
 * Правило Разлома Хаоса (и любых других источников): бонус к secret-шансу
 * складывается с базовым, но итог никогда не превышает MAX_SECRET_CHANCE.
 * Т.е. Хаос поднимает шанс максимум с 0.5% до 2%.
 */
export const MAX_EQUIPPED = 5;
export const MAX_INVENTORY = 30;

const NAME_PARTS: Record<Rarity, [string[], string[]]> = {
  common: [['Ржавый', 'Тупой', 'Простой'], ['перстень', 'амулет', 'окомен']],
  uncommon: [['Острый', 'Лёгкий', 'Тёплый'], ['клинок', 'талисман', 'печатка']],
  rare: [['Рунический', 'Ледяной', 'Грозовой'], ['жезл', 'оберег', 'разрез']],
  epic: [['Героический', 'Пепельный', 'Кровавый'], ['венец', 'молот', 'сфера']],
  legendary: [['Вечный', 'Забытый', 'Первозданный'], ['разлом', 'шторм', 'маятник']],
};

function genName(rarity: Rarity, rng: () => number): string {
  const [adj, noun] = NAME_PARTS[rarity];
  return `${adj[Math.floor(rng() * adj.length)]} ${noun[Math.floor(rng() * noun.length)]}`;
}

function pickWeighted<T extends { weight: number }>(pool: T[], rng: () => number): T {
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let roll = rng() * total;
  for (const item of pool) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return pool[pool.length - 1];
}

/** Ролл редкости; rarityBonus 0..1 сдвигает шансы в сторону редких */
export function rollRarity(rng: () => number, rarityBonus = 0): Rarity {
  // защита границ: бонус строго 0..1
  const bonus = Math.min(1, Math.max(0, rarityBonus));
  const w = { ...RARITY_WEIGHTS };
  if (bonus > 0) {
    w.common = 50 * (1 - bonus);
    w.rare = 14 * (1 + bonus);
    w.epic = 6 * (1 + bonus * 2);
    w.legendary = 2 * (1 + bonus * 3);
  }
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (const r of RARITIES) {
    roll -= w[r];
    if (roll <= 0) return r;
  }
  return 'common';
}

function rollAffix(rng: () => number, mult: number, taken: Set<StatId>, pool: AffixDef[]): Affix {
  const candidates = pool.filter((a) => !taken.has(a.stat));
  const def = pickWeighted(candidates, rng);
  const raw = def.min + rng() * (def.max - def.min);
  const value = Math.round(raw * mult * 10) / 10;
  taken.add(def.stat);
  return { stat: def.stat, value, secret: def.secret };
}

/**
 * Крафт артефакта.
 * @param rarityBonus сдвиг редкости (модификаторы разлома)
 * @param secretBonus добавка к шансу secret-аффикса
 */
export function craftArtifact(rng: () => number, rarityBonus = 0, secretBonus = 0): Artifact {
  const rarity = rollRarity(rng, rarityBonus);
  const info = RARITY_INFO[rarity];
  const regular = AFFIX_POOL.filter((a) => !a.secret);
  const taken = new Set<StatId>();
  const affixes: Affix[] = [];
  for (let i = 0; i < info.affixes; i++) {
    affixes.push(rollAffix(rng, info.valueMult, taken, regular));
  }
  // отдельный ролл secret-аффикса (добавляется сверх обычных)
  const secretChance = Math.min(MAX_SECRET_CHANCE, BASE_SECRET_CHANCE + Math.max(0, secretBonus));
  if (rng() < secretChance) {
    const secretPool = AFFIX_POOL.filter((a) => a.secret);
    affixes.push(rollAffix(rng, info.valueMult, taken, secretPool));
  }
  return {
    id: `art_${Date.now().toString(36)}_${Math.floor(rng() * 1e9).toString(36)}`,
    name: genName(rarity, rng),
    rarity,
    affixes,
    createdAt: Date.now(),
  };
}

/** Рерoll одного случайного обычного аффикса (secret не трогаем) */
export function rerollArtifact(artifact: Artifact, rng: () => number): Artifact {
  const regularIdx = artifact.affixes
    .map((a, i) => ({ a, i }))
    .filter((x) => !x.a.secret)
    .map((x) => x.i);
  if (regularIdx.length === 0) return artifact;
  const idx = regularIdx[Math.floor(rng() * regularIdx.length)];
  const taken = new Set(artifact.affixes.filter((_, i) => i !== idx).map((a) => a.stat));
  const regular = AFFIX_POOL.filter((a) => !a.secret);
  const mult = RARITY_INFO[artifact.rarity].valueMult;
  const next: Artifact = { ...artifact, affixes: artifact.affixes.slice() };
  next.affixes[idx] = rollAffix(rng, mult, taken, regular);
  return next;
}

/** Сумма всех статов артефактов (например, экипированных) */
export function artifactTotals(artifacts: Artifact[]): Record<StatId, number> {
  const totals = {} as Record<StatId, number>;
  for (const art of artifacts) {
    for (const affix of art.affixes) {
      totals[affix.stat] = (totals[affix.stat] ?? 0) + affix.value;
    }
  }
  for (const k of Object.keys(totals) as StatId[]) {
    totals[k] = Math.round(totals[k] * 10) / 10;
  }
  return totals;
}
