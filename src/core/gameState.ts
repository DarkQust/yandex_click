/**
 * Центральное состояние игры — единственный источник правды для сцен.
 */
import { DOUBLE_INCOME_SECONDS } from './config';
import {
  Weapon,
  offlineEarnings,
  spawnCost,
  totalDps,
  totalIncomePerSec,
} from './economy';
import { pendingSouls, prestigeMultiplier } from './prestige';
import { SaveData, createDefaultSave, loadLocal, sanitizeSave, saveLocal } from './saveSystem';
import { computeSkillEffects, SkillEffects } from './skills';

export class GameState {
  data: SaveData = createDefaultSave();
  effects: SkillEffects = computeSkillEffects({});

  private saveTimer: ReturnType<typeof setInterval> | null = null;

  /** Итоговый множитель дохода (навыки × престиж × ×2-реклама) */
  incomeMult(now = Date.now()): number {
    const doubleActive = this.data.doubleIncomeUntil > now ? 2 : 1;
    return this.effects.incomeMult * prestigeMultiplier(this.data.souls) * doubleActive;
  }

  dpsMult(): number {
    return this.effects.dpsMult * prestigeMultiplier(this.data.souls);
  }

  incomePerSec(now = Date.now()): number {
    return totalIncomePerSec(this.data.grid, this.incomeMult(now));
  }

  totalDps(): number {
    return totalDps(this.data.grid, this.dpsMult());
  }

  spawnCostNow(): number {
    return Math.floor(spawnCost(this.data.spawnCount) * (1 - this.effects.spawnDiscount));
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

  /** Оффлайн-доход при старте */
  applyOfflineEarnings(): number {
    const now = Date.now();
    const secondsAway = Math.floor((now - this.data.lastSeen) / 1000);
    if (secondsAway < 60) return 0; // меньше минуты — не считаем
    const rate = this.effects.offlineFullRate ? 1 : 0.5;
    // offlineEarnings уже имеет ×0.5 — при полном навыке удваиваем
    const base = offlineEarnings(totalIncomePerSec(this.data.grid, this.incomeMult(now)), secondsAway);
    const earned = rate === 1 ? base * 2 : base;
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
    this.data = fresh;
    this.refreshEffects();
    return gained;
  }

  save(): void {
    saveLocal(this.data);
  }

  /** Автосейв каждые N секунд + облако */
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
}
