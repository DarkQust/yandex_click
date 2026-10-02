/**
 * Дерево навыков: 3 ветки × 5 узлов. Покупается за кристаллы.
 */
export interface SkillNode {
  id: string;
  tree: 'midas' | 'might' | 'luck';
  name: string;
  description: string;
  maxLevel: number;
  /** стоимость уровня: base * costGrowth^(level) */
  baseCost: number;
  costGrowth: number;
}

export const SKILL_NODES: SkillNode[] = [
  // --- Мидас (доход) ---
  { id: 'midas1', tree: 'midas', name: 'Золотые руки', description: '+25% дохода', maxLevel: 5, baseCost: 1, costGrowth: 2 },
  { id: 'midas2', tree: 'midas', name: 'Торговые пути', description: 'Спавнер дешевле на 10%', maxLevel: 5, baseCost: 2, costGrowth: 2 },
  { id: 'midas3', tree: 'midas', name: 'Жадность дракона', description: '+50% награды за данжи', maxLevel: 3, baseCost: 3, costGrowth: 2 },
  { id: 'midas4', tree: 'midas', name: 'Звон монет', description: 'Оффлайн-доход 100% вместо 50%', maxLevel: 1, baseCost: 8, costGrowth: 1 },
  { id: 'midas5', tree: 'midas', name: 'Око Мидаса', description: '+100% дохода', maxLevel: 3, baseCost: 10, costGrowth: 3 },
  // --- Мощь (ДПС) ---
  { id: 'might1', tree: 'might', name: 'Заточка', description: '+30% ДПС', maxLevel: 5, baseCost: 1, costGrowth: 2 },
  { id: 'might2', tree: 'might', name: 'Военное дело', description: '+50% ДПС магии', maxLevel: 3, baseCost: 2, costGrowth: 2 },
  { id: 'might3', tree: 'might', name: 'Критический удар', description: '5%/уровень шанс крита ×3 в данже', maxLevel: 5, baseCost: 3, costGrowth: 2 },
  { id: 'might4', tree: 'might', name: 'Ярость кузни', description: '+100% ДПС', maxLevel: 3, baseCost: 10, costGrowth: 3 },
  { id: 'might5', tree: 'might', name: 'Каратель', description: 'Кристаллы с боссов ×2', maxLevel: 1, baseCost: 15, costGrowth: 1 },
  // --- Удача (слияние/спавн) ---
  { id: 'luck1', tree: 'luck', name: 'Удача слияния', description: '+5% шанс перепрыгнуть тир', maxLevel: 5, baseCost: 2, costGrowth: 2 },
  { id: 'luck2', tree: 'luck', name: 'Щедрый очаг', description: '10%/уровень шанс двойного спауна', maxLevel: 3, baseCost: 3, costGrowth: 2 },
  { id: 'luck3', tree: 'luck', name: 'Магнетизм', description: 'Авто-спавн каждые 12с (не ждёт покупки)', maxLevel: 1, baseCost: 5, costGrowth: 1 },
  { id: 'luck4', tree: 'luck', name: 'Дары небес', description: 'Спавн с шансом 20%/уровень тир 2', maxLevel: 3, baseCost: 4, costGrowth: 2 },
  { id: 'luck5', tree: 'luck', name: 'Колесо фортуны', description: 'Шанс крита и удачи слияния ×1.5', maxLevel: 1, baseCost: 20, costGrowth: 1 },
];

export function skillCost(node: SkillNode, currentLevel: number): number {
  return Math.floor(node.baseCost * Math.pow(node.costGrowth, currentLevel));
}

export function getNode(id: string): SkillNode {
  const node = SKILL_NODES.find((n) => n.id === id);
  if (!node) throw new Error(`Unknown skill: ${id}`);
  return node;
}

export interface SkillEffects {
  incomeMult: number;
  spawnDiscount: number; // 0..0.5
  dungeonGoldMult: number;
  offlineFullRate: boolean;
  dpsMult: number;
  magicDpsMult: number;
  critChance: number;
  crystalMult: number;
  luckyMergeChance: number; // доп. шанс (к базовому)
  doubleSpawnChance: number;
  autoSpawn: boolean;
  tier2SpawnChance: number;
}

/** Сводный эффект всех прокачанных навыков */
export function computeSkillEffects(skills: Record<string, number>): SkillEffects {
  const lvl = (id: string) => skills[id] ?? 0;
  const e: SkillEffects = {
    incomeMult: 1 + 0.25 * lvl('midas1') + 1.0 * lvl('midas5'),
    spawnDiscount: 0.1 * lvl('midas2'),
    dungeonGoldMult: 1 + 0.5 * lvl('midas3'),
    offlineFullRate: lvl('midas4') > 0,
    dpsMult: 1 + 0.3 * lvl('might1') + 1.0 * lvl('might4'),
    magicDpsMult: 1 + 0.5 * lvl('might2'),
    critChance: 0.05 * lvl('might3'),
    crystalMult: lvl('might5') > 0 ? 2 : 1,
    luckyMergeChance: 0.05 * lvl('luck1'),
    doubleSpawnChance: 0.1 * lvl('luck2'),
    autoSpawn: lvl('luck3') > 0,
    tier2SpawnChance: 0.2 * lvl('luck4'),
  };
  if (lvl('luck5') > 0) {
    e.critChance *= 1.5;
    e.luckyMergeChance *= 1.5;
  }
  return e;
}
