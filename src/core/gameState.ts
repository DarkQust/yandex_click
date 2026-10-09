/**
 * Центральное состояние игры — единственный источник правды для сцен.
 */
import { CLICK_DAMAGE_RATIO, CRIT_BASE_MULT, CRIT_CHANCE_CAP, DOUBLE_INCOME_SECONDS, LUCKY_MERGE_CAP, OFFLINE_CAP_SECONDS } from './config';
import {
  Weapon,
  randomBranch,
  spawnCost,
  totalDps,
  totalIncomePerSec,
} from './economy';
import { pendingSouls, prestigeMultiplier } from './prestige';
import { SaveData, createDefaultSave, loadLocal, sanitizeSave, saveLocal } from './saveSystem';
import { computeSkillEffects, SkillEffects } from './skills';
import {
  Artifact,
  CRAFT_COST_SHARDS,
  MAX_EQUIPPED,
  MAX_INVENTORY,
  RARITY_INFO,
  REROLL_COST_STABILIZERS,
  StatId,
  artifactTotals,
  craftArtifact,
  rerollArtifact,
} from './artifacts';

export interface TickEvents {
  goldGained: number;
  autoSpawned: number;
}

export class GameState {
  data: SaveData = createDefaultSave();
  effects: SkillEffects = computeSkillEffects({});

  /** Версия сетки — инкрементится при изменении, UI следит и перерисовывает */
  gridVersion = 0;

  private saveTimer: ReturnType<typeof setInterval> | null = null;
  /** wall-clock последнего тика движка (не сериализуется) */
  private lastTickMs = 0;
  /** накопитель авто-спауна (секунды) */
  private autoSpawnAcc = 0;

  /**
   * Глобальный wall-clock тик экономики.
   * Вызывается EngineScene каждый кадр — работает независимо от того,
   * какая игровая сцена активна/перекрыта. Это фундамент idle-игры:
   * доход идёт всегда, даже когда открыт данж/навыки/другие оверлеи.
   */
  tick(now: number = Date.now()): TickEvents {
    if (this.lastTickMs === 0) this.lastTickMs = now;
    const dtSec = (now - this.lastTickMs) / 1000;
    this.lastTickMs = now;
    if (dtSec <= 0) return { goldGained: 0, autoSpawned: 0 };
    // защита от скачков (devtools, throttle вкладки) — кап 5 минут за тик
    const cappedDt = Math.min(dtSec, 300);

    const goldGained = this.incomePerSec(now) * cappedDt;
    this.addGold(goldGained);

    // авто-спавн (навык "Магнетизм")
    let autoSpawned = 0;
    if (this.effects.autoSpawn) {
      this.autoSpawnAcc += cappedDt;
      while (this.autoSpawnAcc >= 12) {
        const slot = this.data.grid.indexOf(null);
        if (slot < 0) {
          this.autoSpawnAcc = 0;
          break;
        }
        this.autoSpawnAcc -= 12;
        this.data.grid[slot] = { branch: randomBranch(), tier: 1 };
        this.gridVersion++;
        autoSpawned++;
      }
    } else {
      this.autoSpawnAcc = 0;
    }

    return { goldGained, autoSpawned };
  }

  /** Экипированные артефакты */
  equippedArtifacts(): Artifact[] {
    const ids = new Set(this.data.equippedIds);
    return this.data.artifacts.filter((a) => ids.has(a.id));
  }

  /** Суммарные статы экипированных артефактов (в процентах) */
  artifactTotals(): Record<StatId, number> {
    return artifactTotals(this.equippedArtifacts());
  }

  /** Итоговый множитель дохода (навыки × престиж × артефакты × ×2-реклама) */
  incomeMult(now = Date.now()): number {
    const doubleActive = this.data.doubleIncomeUntil > now ? 2 : 1;
    const art = 1 + (this.artifactTotals().income ?? 0) / 100;
    return this.effects.incomeMult * prestigeMultiplier(this.data.souls) * art * doubleActive;
  }

  dpsMult(): number {
    const art = 1 + (this.artifactTotals().dps ?? 0) / 100;
    return this.effects.dpsMult * prestigeMultiplier(this.data.souls) * art;
  }

  totalCritChance(): number {
    const raw = this.effects.critChance + (this.artifactTotals().critChance ?? 0) / 100;
    return Math.min(CRIT_CHANCE_CAP, Math.max(0, raw));
  }

  totalCritMult(): number {
    return CRIT_BASE_MULT * (1 + (this.artifactTotals().critMult ?? 0) / 100);
  }

  totalLuckyMergeChance(): number {
    const raw = this.effects.luckyMergeChance + (this.artifactTotals().luckyMerge ?? 0) / 100;
    return Math.min(LUCKY_MERGE_CAP, Math.max(0, raw));
  }

  totalDungeonGoldMult(): number {
    return this.effects.dungeonGoldMult * (1 + (this.artifactTotals().dungeonGold ?? 0) / 100);
  }

  totalCrystalMult(): number {
    return this.effects.crystalMult * (1 + (this.artifactTotals().crystal ?? 0) / 100);
  }

  /** Бонус к шансу secret-аффикса (пока 0; бустится разломом Хаоса) */
  shardBonusMult(): number {
    return 1 + (this.artifactTotals().shardBonus ?? 0) / 100;
  }

  incomePerSec(now = Date.now()): number {
    return totalIncomePerSec(this.data.grid, this.incomeMult(now));
  }

  totalDps(): number {
    return totalDps(this.data.grid, this.dpsMult());
  }

  /** Урон активного клика в данже (минимум 1, артефакты усиливают) */
  clickDamage(): number {
    const art = 1 + (this.artifactTotals().click ?? 0) / 100;
    return Math.max(1, this.totalDps() * CLICK_DAMAGE_RATIO * art);
  }

  spawnCostNow(): number {
    const artDisc = (this.artifactTotals().spawnDiscount ?? 0) / 100;
    const totalDisc = Math.min(0.6, this.effects.spawnDiscount + artDisc);
    return Math.floor(spawnCost(this.data.spawnCount) * (1 - totalDisc));
  }

  /** Начисление золота с учётом lifetime-статистики */
  addGold(amount: number): void {
    if (amount <= 0) return;
    this.data.gold += amount;
    this.data.lifetimeGold += amount;
  }

  spendGold(amount: number): boolean {
    if (this.data.gold < amount) return false;
    this.data.gold -= amount;
    return true;
  }

  spendCrystals(amount: number): boolean {
    if (this.data.crystals < amount) return false;
    this.data.crystals -= amount;
    return true;
  }

  refreshEffects(): void {
    this.effects = computeSkillEffects(this.data.skills);
  }

  activateDoubleIncome(): void {
    this.data.doubleIncomeUntil = Date.now() + DOUBLE_INCOME_SECONDS * 1000;
  }

  doubleIncomeRemaining(now = Date.now()): number {
    return Math.max(0, Math.floor((this.data.doubleIncomeUntil - now) / 1000));
  }

  /** Эффективность оффлайн-дохода: навык (50%/100%) и аффикс offlineRate независимы */
  offlineEfficiency(): number {
    const tot = this.artifactTotals();
    const base = this.effects.offlineFullRate ? 1 : 0.5;
    return base * (1 + (tot.offlineRate ?? 0) / 100);
  }

  /** Кап оффлайн-дохода в секундах: базовый 8ч + аффикс offlineCap (часы) */
  offlineCapSeconds(): number {
    return OFFLINE_CAP_SECONDS + (this.artifactTotals().offlineCap ?? 0) * 3600;
  }

  /** Оффлайн-доход при старте (now инжектируем для тестов) */
  applyOfflineEarnings(now: number = Date.now()): number {
    const secondsAway = Math.floor((now - this.data.lastSeen) / 1000);
    if (secondsAway < 60) return 0; // меньше минуты — не считаем
    const capped = Math.min(secondsAway, this.offlineCapSeconds());
    const income = totalIncomePerSec(this.data.grid, this.incomeMult(now));
    const earned = Math.floor(income * capped * this.offlineEfficiency());
    if (earned > 0) this.addGold(earned);
    return earned;
  }

  /** Престиж: вернуть количество полученных душ (0 — рано) */
  doPrestige(): number {
    const gained = pendingSouls(this.data.lifetimeGold, this.data.souls);
    if (gained <= 0) return 0;
    const keepSouls = this.data.souls + gained;
    const fresh = createDefaultSave();
    fresh.souls = keepSouls;
    fresh.skills = { ...this.data.skills }; // навыки сохраняем — мягкий престиж
    fresh.bestWave = this.data.bestWave;
    // артефакты и их ресурсы переживают престиж (по дизайну Iteration 2)
    fresh.artifacts = this.data.artifacts;
    fresh.equippedIds = this.data.equippedIds;
    fresh.shards = this.data.shards;
    fresh.stabilizers = this.data.stabilizers;
    this.data = fresh;
    this.refreshEffects();
    this.gridVersion++;
    this.lastTickMs = 0;
    return gained;
  }

  save(): void {
    saveLocal(this.data);
  }

  /** Автосейв каждые N секунд + облако (setInterval — независим от сцен) */
  startAutosave(onCloudSave: (save: SaveData) => void, intervalSec = 15): void {
    this.saveTimer = setInterval(() => {
      this.save();
      onCloudSave({ ...this.data });
    }, intervalSec * 1000);
  }

  stopAutosave(): void {
    if (this.saveTimer) clearInterval(this.saveTimer);
    this.saveTimer = null;
  }

  /** Загрузка: локальная + облачная (берём свежее по lastSeen) */
  static load(cloud: unknown | null): GameState {
    const state = new GameState();
    const local = loadLocal();
    const cloudData = cloud ? sanitizeSave(cloud) : null;
    if (local && cloudData) {
      state.data = local.lastSeen >= cloudData.lastSeen ? local : cloudData;
    } else {
      state.data = local ?? cloudData ?? state.data;
    }
    state.refreshEffects();
    return state;
  }

  getWeapon(index: number): Weapon | null {
    return this.data.grid[index];
  }

  // ---------- Артефакты: действия ----------

  /** Ковка артефакта за Осколки. Возвращает артефакт или null. */
  craftArtifact(rng: () => number = Math.random, rarityBonus = 0, secretBonus = 0): Artifact | null {
    if (this.data.shards < CRAFT_COST_SHARDS) return null;
    if (this.data.artifacts.length >= MAX_INVENTORY) return null;
    this.data.shards -= CRAFT_COST_SHARDS;
    const art = craftArtifact(rng, rarityBonus, secretBonus);
    this.data.artifacts.push(art);
    return art;
  }

  /** Рерoll одного аффикса за Стабилизатор */
  rerollArtifact(id: string, rng: () => number = Math.random): Artifact | null {
    if (this.data.stabilizers < REROLL_COST_STABILIZERS) return null;
    const i = this.data.artifacts.findIndex((a) => a.id === id);
    if (i < 0) return null;
    this.data.stabilizers -= REROLL_COST_STABILIZERS;
    this.data.artifacts[i] = rerollArtifact(this.data.artifacts[i], rng);
    return this.data.artifacts[i];
  }

  /** Распыл в Осколки по редкости */
  salvageArtifact(id: string): number {
    const i = this.data.artifacts.findIndex((a) => a.id === id);
    if (i < 0) return 0;
    const art = this.data.artifacts[i];
    this.data.artifacts.splice(i, 1);
    this.unequipArtifact(id);
    const gained = RARITY_INFO[art.rarity].salvageShards;
    this.data.shards += gained;
    return gained;
  }

  equipArtifact(id: string): boolean {
    if (this.data.equippedIds.length >= MAX_EQUIPPED) return false;
    if (!this.data.artifacts.some((a) => a.id === id)) return false;
    if (this.data.equippedIds.includes(id)) return false;
    this.data.equippedIds.push(id);
    return true;
  }

  unequipArtifact(id: string): void {
    this.data.equippedIds = this.data.equippedIds.filter((x) => x !== id);
  }
}
