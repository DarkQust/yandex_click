/**
 * Центральное состояние игры — единственный источник правды для сцен.
 */
import {
  CLICK_DAMAGE_RATIO, CRIT_BASE_MULT, CRIT_CHANCE_CAP, DOUBLE_INCOME_SECONDS,
  LUCKY_MERGE_CAP, OFFLINE_CAP_SECONDS, ULTRA_CRIT_CHANCE_CAP, ULTRA_CRIT_BASE_MULT,
} from './config';
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
import {
  RIFTS,
  RiftDef,
  RiftId,
  ClearGrant,
  fullClearRewards,
  getRift,
  offlineRiftGrants,
  rollClearBundle,
  tickAutoFarm,
} from './expeditions';
import {
  CreatureDef, HuntRewards, HuntRunState, HUNT_RANKS, getHuntRank, isRankUnlocked,
  rollCreatureRarity, startHunt,
} from './hunts';

import {
  CASE_COST_KEYS,
  MAX_ACTIVE_PETS,
  MAX_PET_LEVEL,
  Pet,
  PetStat,
  petFeedCost,
  petTeamTotals,
  petFromCapture,
  openPetCase,
} from './pets';

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

    // автофарм разломов (идёт в любом UI и вне сцен)
    for (const rift of RIFTS) {
      const prog = this.data.riftProgress[rift.id];
      if (!prog?.autoFarm) continue;
      const [next, clears] = tickAutoFarm(prog, rift, this.totalDps(), cappedDt);
      this.data.riftProgress[rift.id] = next;
      for (let i = 0; i < clears; i++) {
        this.grantRiftClear(rift, Math.max(1, prog.maxDepth));
      }
      if (clears > 0) {
        next.clears += clears;
      }
    }

    return { goldGained, autoSpawned };
  }

  /** Начисление бандла за полную зачистку разлома (роллы дропа) */
  private grantRiftClear(rift: RiftDef, depth: number, rng: () => number = Math.random): ClearGrant {
    const bundle = rollClearBundle(fullClearRewards(depth, rift), rng, this.totalKeyBonus());
    return this.applyRiftGrant(rift, bundle);
  }

  /** Применение aggregated-наград (общий путь для автофарма и оффлайна) */
  applyRiftGrant(rift: RiftDef, grant: ClearGrant): ClearGrant {
    // осколки: пассив shardBonus питомцев и secret-аффикс артефактов работают вместе
    this.data.shards += Math.round(grant.shards * this.shardBonusMult());
    this.data.stabilizers += grant.stabilizers;
    this.addGold(grant.gold);
    this.data.bait += grant.bait ?? 0;
    this.data.keys += grant.keys ?? 0; // кламп шанса уже применён на уровне ролла (rollClearBundle)
    for (let i = 0; i < grant.artifacts; i++) {
      if (this.data.artifacts.length >= MAX_INVENTORY) break;
        const art = craftArtifact(Math.random, rift.modifiers.rarityBonus, rift.modifiers.secretBonus, rift.affixBias);
      this.data.artifacts.push(art);
    }
    return grant;
  }

  /** Экипированные артефакты */
  equippedArtifacts(): Artifact[] {
    const ids = new Set(this.data.equippedIds);
    return this.data.artifacts.filter((a) => ids.has(a.id));
  }

  /** Команда активных питомцев */
  activePets(): Pet[] {
    const ids = new Set(this.data.activePetIds);
    return this.data.pets.filter((p) => ids.has(p.uid));
  }

  /** Суммарные бонусы команды питомцев с учётом petEfficiency артефактов */
  petTotals(): Record<PetStat, number> {
    const raw = petTeamTotals(this.activePets());
    const eff = 1 + (this.artifactTotals().petEfficiency ?? 0) / 100; // secret-аффикс
    for (const k of Object.keys(raw) as PetStat[]) {
      raw[k] = Math.round(raw[k] * eff * 10) / 10;
    }
    return raw;
  }

  /** Суммарные статы экипированных артефактов (в процентах) */
  artifactTotals(): Record<StatId, number> {
    return artifactTotals(this.equippedArtifacts());
  }

  /** Итоговый множитель дохода (навыки × престиж × артефакты × ×2-реклама) */
  incomeMult(now = Date.now()): number {
    const doubleActive = this.data.doubleIncomeUntil > now ? 2 : 1;
    const art = 1 + (this.artifactTotals().income ?? 0) / 100;
    const pet = 1 + (this.petTotals().income ?? 0) / 100;
    return this.effects.incomeMult * prestigeMultiplier(this.data.souls) * art * pet * doubleActive;
  }

  dpsMult(): number {
    const art = 1 + (this.artifactTotals().dps ?? 0) / 100;
    const pet = 1 + (this.petTotals().dps ?? 0) / 100;
    return this.effects.dpsMult * prestigeMultiplier(this.data.souls) * art * pet;
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
    const pet = 1 + (this.petTotals().dungeonGold ?? 0) / 100;
    return this.effects.dungeonGoldMult * (1 + (this.artifactTotals().dungeonGold ?? 0) / 100) * pet;
  }

  totalCrystalMult(): number {
    return this.effects.crystalMult * (1 + (this.artifactTotals().crystal ?? 0) / 100);
  }

  /** Бонус к шансу secret-аффикса (пока 0; бустится разломом Хаоса) */
  shardBonusMult(): number {
    const pet = 1 + (this.petTotals().shardBonus ?? 0) / 100;
    return (1 + (this.artifactTotals().shardBonus ?? 0) / 100) * pet;
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
    const pet = 1 + (this.petTotals().click ?? 0) / 100;
    return Math.max(1, this.totalDps() * CLICK_DAMAGE_RATIO * art * pet);
  }

  spawnCostNow(): number {
    return Math.floor(spawnCost(this.data.spawnCount) * (1 - this.forgeSpawnDiscount()));
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
    const art = (this.artifactTotals().offlineRate ?? 0) / 100;
    const pet = (this.petTotals().offlineRate ?? 0) / 100;
    const base = this.effects.offlineFullRate ? 1 : 0.5;
    return base * (1 + art) * (1 + pet);
  }

  /** Кап оффлайн-дохода в секундах: базовый 8ч + аффикс offlineCap (часы) */
  offlineCapSeconds(): number {
    return OFFLINE_CAP_SECONDS + (this.artifactTotals().offlineCap ?? 0) * 3600;
  }

  /** Следующая глубина для активного захода */
  nextRiftDepth(riftId: RiftId): number {
    return this.data.riftProgress[riftId].maxDepth + 1;
  }

  /** Завершение активного захода: фиксируем глубину */
  completeRiftRun(riftId: RiftId, depthReached: number): void {
    const p = this.data.riftProgress[riftId];
    p.maxDepth = Math.max(p.maxDepth, depthReached);
    p.clears += 1;
  }

  toggleAutoFarm(riftId: RiftId): boolean {
    const p = this.data.riftProgress[riftId];
    p.autoFarm = !p.autoFarm;
    if (!p.autoFarm) p.autoFarmProgress = 0;
    return p.autoFarm;
  }

  /** Оффлайн-награды разломов при старте; возвращает сводку для UI */
  applyOfflineRifts(now: number = Date.now()): { rift: string; depth: number; grant: ClearGrant }[] {
    const secondsAway = Math.floor((now - this.data.lastSeen) / 1000);
    if (secondsAway < 60) return [];
    const out: { rift: string; depth: number; grant: ClearGrant }[] = [];
    for (const rift of RIFTS) {
      const prog = this.data.riftProgress[rift.id];
      const res = offlineRiftGrants(prog, rift, this.totalDps(), secondsAway, this.offlineCapSeconds());
      if (!res) continue;
      const grant = this.applyRiftGrant(rift, res.grant);
      prog.clears += Math.floor(res.grant.shards / Math.max(1, fullClearRewards(res.depth, rift).shards));
      out.push({ rift: rift.name, depth: res.depth, grant });
    }
    return out;
  }

  getRiftDef(riftId: RiftId): RiftDef {
    return getRift(riftId);
  }

  // ---------- Охота и питомцы ----------

  /** Бонус команды к шансу поимки (для Hunts) */
  petCaptureBonus(): number {
    return (this.petTotals().captureChance ?? 0) / 100;
  }

  /** Бонус команды питомцев к шансу ключа */
  petKeyBonus(): number {
    return (this.petTotals().keyChance ?? 0) / 100;
  }

  /** Итоговый бонус к шансу ключа (питомцы + secret-аффикс артефактов), кап 0.95 */
  totalKeyBonus(): number {
    const raw = (this.artifactTotals().keyChance ?? 0) / 100 + this.petKeyBonus();
    return Math.min(0.95, Math.max(0, raw));
  }

  // ---------- Модификаторы кузницы и ультра-крит (питомцы/скиллы) ----------

  /** Шанс спавна оружия тиром выше (кап 50%) */
  forgeTierJumpChance(): number {
    const raw = (this.petTotals().tierJump ?? 0) / 100;
    return Math.min(0.5, Math.max(0, raw));
  }

  /** Шанс дополнительной генерации оружия при ковке: навык + питомцы (кап 75%) */
  forgeExtraSpawnChance(): number {
    const raw = this.effects.doubleSpawnChance + (this.petTotals().extraSpawn ?? 0) / 100;
    return Math.min(0.75, Math.max(0, raw));
  }

  /** Итоговая скидка на ковку: навыки + артефакты + питомцы (кап 60%) */
  forgeSpawnDiscount(): number {
    const raw =
      this.effects.spawnDiscount +
      (this.artifactTotals().spawnDiscount ?? 0) / 100 +
      (this.petTotals().spawnDiscount ?? 0) / 100;
    return Math.min(0.6, Math.max(0, raw));
  }

  /** Шанс ультра-крита поверх обычного (кап 50%) */
  ultraCritChance(): number {
    const raw = (this.petTotals().ultraCritChance ?? 0) / 100;
    return Math.min(ULTRA_CRIT_CHANCE_CAP, Math.max(0, raw));
  }

  /** Множитель ультра-крита (база 5, усиливается ultraCritMult) */
  ultraCritMult(): number {
    return ULTRA_CRIT_BASE_MULT * (1 + (this.petTotals().ultraCritMult ?? 0) / 100);
  }

  /** Доступные ранги по прогрессу (победы в охотах + души) */
  unlockedHuntRanks(): number[] {
    return HUNT_RANKS.filter((r) => isRankUnlocked(r, this.data.huntsWon, this.data.souls)).map((r) => r.id);
  }

  /**
   * Выбор ранга охоты. Валидируем ИСХОДНЫЙ ID до клампа:
   * нецелые, отрицательные и вне диапазона значения отклоняются,
   * даже если прогресс открывает ранг V (иначе 99 молча выбирал бы V).
   */
  selectHuntRank(rankId: number): boolean {
    if (!Number.isInteger(rankId) || rankId < 0 || rankId >= HUNT_RANKS.length) return false;
    const rank = getHuntRank(rankId);
    if (!isRankUnlocked(rank, this.data.huntsWon, this.data.souls)) return false;
    this.data.huntRank = rank.id;
    return true;
  }

  /**
   * Согласованность: выбранный ранг не должен «залипать» закрытым,
   * если прогресс откатился (например, души станут тратящимся ресурсом).
   * Понижаем до максимального доступного и фиксируем в сейве.
   */
  ensureHuntRankAvailable(): number {
    const current = getHuntRank(this.data.huntRank);
    if (isRankUnlocked(current, this.data.huntsWon, this.data.souls)) return current.id;
    let best = 0;
    for (const r of HUNT_RANKS) {
      if (isRankUnlocked(r, this.data.huntsWon, this.data.souls)) best = r.id;
    }
    this.data.huntRank = best;
    return best;
  }

  /** Начать охоту выбранного ранга: тратит приманку, роллит редкость с бустом ранга */
  startHunt(creature: CreatureDef, rng: () => number = Math.random): HuntRunState | null {
    if (this.data.bait < 1) return null;
    this.data.bait -= 1;
    const rank = getHuntRank(this.ensureHuntRankAvailable());
    const rarity = rollCreatureRarity(rng, rank.rarityBoost);
    return startHunt(creature, rarity, this.totalDps(), this.petCaptureBonus(), rng, rank.id);
  }

  /** Завершение охоты: выдача награды и (при поимке) питомца */
  finishHunt(run: HuntRunState, rewards: HuntRewards, captured: boolean, won = true, rng: () => number = Math.random): void {
    this.data.petFood += rewards.food;
    this.data.keys += rewards.keys;
    this.addGold(rewards.gold);
    if (captured) {
      const pet = petFromCapture(run.creature.species, run.creatureRarity, rng);
      this.data.pets.push(pet);
    }
    if (won) this.data.huntsWon += 1; // только победа над целью
  }

  /** Открыть кейс питомца за ключи */
  openCase(rng: () => number = Math.random): Pet | null {
    if (this.data.keys < CASE_COST_KEYS) return null;
    this.data.keys -= CASE_COST_KEYS;
    const pet = openPetCase(rng);
    this.data.pets.push(pet);
    return pet;
  }

  /** Покормить питомца (+уровень) */
  feedPet(uid: string): boolean {
    const pet = this.data.pets.find((x) => x.uid === uid);
    if (!pet || pet.level >= MAX_PET_LEVEL) return false;
    const cost = petFeedCost(pet.level);
    if (this.data.petFood < cost) return false;
    this.data.petFood -= cost;
    pet.level += 1;
    return true;
  }

  /** Отпустить питомца: корм по редкости (повторные питомцы не мусор) */
  releasePet(uid: string): number {
    const i = this.data.pets.findIndex((x) => x.uid === uid);
    if (i < 0) return 0;
    const pet = this.data.pets[i];
    const food: Record<string, number> = { common: 2, uncommon: 3, rare: 5, epic: 8, legendary: 14 };
    const gained = food[pet.rarity] ?? 2;
    this.data.pets.splice(i, 1);
    this.data.activePetIds = this.data.activePetIds.filter((x) => x !== uid);
    this.data.petFood += gained;
    return gained;
  }

  setActivePet(uid: string, active: boolean): void {
    if (active) {
      if (this.data.activePetIds.length >= MAX_ACTIVE_PETS) return;
      if (!this.data.activePetIds.includes(uid)) this.data.activePetIds.push(uid);
    } else {
      this.data.activePetIds = this.data.activePetIds.filter((x) => x !== uid);
    }
  }

  /** Прямой дроп артефакта (без цены крафта) — награда разломов */
  grantArtifactDrop(rift: RiftDef): Artifact | null {
    if (this.data.artifacts.length >= MAX_INVENTORY) return null;
    const art = craftArtifact(Math.random, rift.modifiers.rarityBonus, rift.modifiers.secretBonus, rift.affixBias);
    this.data.artifacts.push(art);
    return art;
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
