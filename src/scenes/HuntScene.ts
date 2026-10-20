import Phaser from 'phaser';
import {
  CREATURES,
  CreatureDef,
  HUNT_RANKS,
  HuntCard,
  HuntRunState,
  TRACK_STEPS,
  CREATURE_ATTACK_MS,
  activeSynergies,
  captureChance,
  computeRunMods,
  defeatRewards,
  lifestealHeal,
  rollDraft,
  victoryRewards,
} from '../core/hunts';
import { GameState } from '../core/gameState';
import { formatNumber } from '../core/economy';
import { RARITY_INFO, Rarity } from '../core/artifacts';

const CARD_COLORS: Record<Rarity, number> = {
  common: 0x777777,
  uncommon: 0x5ad27a,
  rare: 0x4ab0ff,
  epic: 0xb05aff,
  legendary: 0xffa53a,
};

/**
 * Охота: roguelite-забег. Драфт 1-из-3 на каждом шаге выслеживания,
 * события, элитная стычка, финальный бой с существом.
 * Временные карточки живут только в забеге (HuntRunState в core).
 */
export class HuntScene extends Phaser.Scene {
  private state!: GameState;
  private run: HuntRunState | null = null;
  private busy = false; // защита от двойных кликов
  private statusText!: Phaser.GameObjects.Text;
  private hint2Text!: Phaser.GameObjects.Text;
  private modText!: Phaser.GameObjects.Text;
  private creatureTimer?: Phaser.Time.TimerEvent;
  private dpsTimer?: Phaser.Time.TimerEvent;
  private eliteDone = false; // элита проходится ОДИН раз за забег
  private runRef: HuntRunState | null = null; // защита callbacks от старого забега

  constructor() {
    super('Hunt');
  }

  create(): void {
    this.state = this.registry.get('state') as GameState;
    this.showSelect();
  }

  // ---------- Выбор цели ----------

  private showSelect(): void {
    this.clearTimers();
    this.run = null;
    this.children.removeAll(true);
    this.add.rectangle(360, 640, 720, 1280, 0x0c1a12).setAlpha(0.98).setInteractive();
    this.add.text(360, 55, '🏹 Охота', { fontSize: '42px', color: '#8affc0' }).setOrigin(0.5);
    this.add
      .text(360, 115, 'Найдите след, выбирайте карточки улучшений и сразитесь с существом.\nРедкость существа определяет награду, сложность следует за вашей силой.',
        { fontSize: '19px', color: '#9ab8a8', align: 'center' })
      .setOrigin(0.5);
    const d = this.state.data;
    this.add.text(360, 165, `🎣 Приманки: ${d.bait}   🗝 Ключи: ${d.keys}   🍖 Корм: ${d.petFood}   Побед: ${d.huntsWon}`,
      { fontSize: '22px', color: '#9adcff' }).setOrigin(0.5);

    // выбор ранга охоты: риск/награды/редкости растут вместе с рангом
    const unlocked = new Set(this.state.unlockedHuntRanks());
    HUNT_RANKS.forEach((rank, i) => {
      const x = 90 + i * 135;
      const open = unlocked.has(rank.id);
      const selected = d.huntRank === rank.id;
      const label = open
        ? rank.name
        : `${rank.name}\n\u{1F512} ${rank.reqHuntsWon} побед${rank.reqSouls > 0 ? ` \u00b7 ${rank.reqSouls} ${rank.reqSouls === 1 ? 'душа' : 'душ'}` : ''}`;
      const btn = this.add.text(x, 215, label, {
        fontSize: '15px',
        color: open ? (selected ? '#8aff5a' : '#ffe6a0') : '#665f4d',
        backgroundColor: selected ? '#243020' : open ? '#1c2418' : '#141812',
        padding: { x: 8, y: 5 },
        align: 'center',
      }).setOrigin(0.5).setInteractive({ useHandCursor: open });
      btn.on('pointerdown', () => {
        if (!open) return;
        this.state.selectHuntRank(rank.id);
        this.state.save();
        this.showSelect();
      });
    });

    CREATURES.forEach((c, i) => {
      const y = 290 + i * 200;
      const box = this.add.rectangle(360, y, 620, 170, 0x14231a).setStrokeStyle(2, 0x3a6b4a);
      box.setInteractive({ useHandCursor: true });
      this.add.text(70, y - 55, `${c.icon} ${c.name}`, { fontSize: '28px', color: '#ffffff' });
      this.add.text(70, y - 15, `Место: ${c.terrain}`, { fontSize: '19px', color: '#b8d8c8' });
      const bias = { food: '🍖 больше корма', keys: '🗝 шанс ключа выше', gold: '🪙 больше золота', capture: '✨ выше шанс поимки' }[c.rewardBias];
      this.add.text(70, y + 20, `Особенность: ${bias}`, { fontSize: '18px', color: '#ffe6a0' });
      this.add.text(70, y + 55,
        d.bait > 0 ? 'Нажмите, чтобы отправиться (1 🎣)' : 'Нужна приманка (рифты/данж)',
        { fontSize: '17px', color: d.bait > 0 ? '#8aff5a' : '#ffb0a0' });
      box.on('pointerdown', () => this.beginHunt(c));
    });

    const close = this.add.text(360, 1235, '← Вернуться в кузницу', { fontSize: '28px', color: '#ffe6a0' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => {
      this.state.save();
      this.scene.stop();
    });
  }

  // ---------- Забег ----------

  private beginHunt(creature: CreatureDef): void {
    if (this.busy) return;
    const run = this.state.startHunt(creature); // ранг и редкость роллятся в GameState
    if (!run) return; // нет приманок
    this.run = run;
    this.runRef = run;
    this.eliteDone = false;
    this.clearTimers();
    this.children.removeAll(true);
    this.add.rectangle(360, 640, 720, 1280, 0x0c1a12).setAlpha(0.98).setInteractive();

    const rarity = run.creatureRarity;
    this.add.text(360, 50,
      `${creature.icon} ${creature.name} [${RARITY_INFO[rarity].ru}] — ранг ${run.rank.name}`,
      { fontSize: '30px', color: '#' + CARD_COLORS[rarity].toString(16) }).setOrigin(0.5);
    this.statusText = this.add.text(360, 120, '', { fontSize: '22px', color: '#ffe6a0', align: 'center', wordWrap: { width: 660 } }).setOrigin(0.5);
    this.hint2Text = this.add.text(360, 170, '', { fontSize: '17px', color: '#9ab8a8' }).setOrigin(0.5);
    this.modText = this.add.text(360, 1210, '', { fontSize: '17px', color: '#9adcff', align: 'center', wordWrap: { width: 680 } }).setOrigin(0.5);

    const quit = this.add.text(360, 1258, '← Отступить (добыча шагов сохранится)', { fontSize: '22px', color: '#ffb0a0' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    quit.on('pointerdown', () => this.retreat());

    this.refreshMods();
    this.nextTrackStep();
  }

  private retreat(): void {
    if (!this.run || this.run.phase === 'won' || this.run.phase === 'lost') return;
    const run = this.run;
    run.phase = 'lost'; // блокируем повторные завершения и stale-callbacks
    this.clearTimers();
    // отступление: забираем найденное на шагах, существо упущено
    const rw = defeatRewards(run);
    this.state.finishHunt(run, rw, false, false);
    this.state.save();
    this.showSelect();
  }

  /** Шаг выслеживания: событие + драфт 1 из 3 */
  private nextTrackStep(): void {
    const run = this.run!;
    if (run.trackStep >= TRACK_STEPS) {
      this.startElite();
      return;
    }
    run.trackStep++;
    // событие шага
    const roll = Math.random();
    if (roll < 0.35) {
      run.foodFound += 1;
      this.statusText.setText(`Шаг ${run.trackStep}/${TRACK_STEPS}: найден след! (+1 🍖)`);
    } else if (roll < 0.55) {
      run.keysFound += Math.random() < 0.15 ? 1 : 0;
      this.statusText.setText(`Шаг ${run.trackStep}/${TRACK_STEPS}: ловушка! Но вы неё не попали.`);
    } else {
      this.statusText.setText(`Шаг ${run.trackStep}/${TRACK_STEPS}: тропы сходятся...`);
    }
    this.hint2Text.setText('Выберите одну карточку улучшения:');
    this.showDraft();
  }

  private showDraft(): void {
    const run = this.run!;
    const exclude = new Set(run.pickedCards.map((c) => c.id));
    const cards = rollDraft(3, Math.random, exclude);
    cards.forEach((card, i) => {
      const x = 150 + i * 210;
      const y = 620;
      const color = CARD_COLORS[card.rarity];
      const box = this.add.rectangle(x, y, 190, 260, 0x14231a)
        .setStrokeStyle(3, color).setInteractive({ useHandCursor: true });
      box.setData('draft', true); // помечаем для точечной очистки
      // placeholder-рамка: сюда встанет арт карточки (этап B)
      this.add.rectangle(x, y - 70, 170, 120, 0x0e1a14).setStrokeStyle(1, color).setData('draft', true);
      this.add.text(x, y - 70, card.rarity === 'legendary' ? '★' : '', { fontSize: '30px', color: '#ffd24a' }).setOrigin(0.5).setData('draft', true);
      this.add.text(x, y + 5, card.name, { fontSize: '19px', color: '#ffffff', align: 'center', wordWrap: { width: 175 } }).setOrigin(0.5, 0.5).setData('draft', true);
      this.add.text(x, y + 60, card.description, { fontSize: '15px', color: '#c8d8c8', align: 'center', wordWrap: { width: 175 } }).setOrigin(0.5).setData('draft', true);
      box.on('pointerdown', () => this.pickCard(card, cards));
    });
  }

  private pickCard(card: HuntCard, cards: HuntCard[]): void {
    if (this.busy || !this.run) return;
    this.busy = true;
    const run = this.run;
    const beforeMax = computeRunMods(run).staminaMax;
    run.pickedCards.push(card);
    const mods = computeRunMods(run);
    // карточки выносливости: рост максимума поднимает текущую, лечение применяется сразу
    const delta = mods.staminaMax - beforeMax;
    if (delta > 0) run.stamina += delta;
    if (mods.staminaHeal > 0) run.stamina = Math.min(mods.staminaMax, run.stamina + mods.staminaHeal);
    run.stamina = Math.min(run.stamina, mods.staminaMax);
    this.refreshMods();
    // убрать ТОЛЬКО объекты драфта (не весь UI)
    this.children.list
      .filter((o) => o.getData && o.getData('draft') === true)
      .forEach((o) => o.destroy());
    void cards;
    this.tweens.addCounter({
      from: 0, to: 1, duration: 300,
      onComplete: () => {
        this.busy = false;
        this.nextTrackStep();
      },
    });
  }

  /** Элитная стычка: быстрая проверка выносливости, +награда и +1 карточка */
  private startElite(): void {
    const run = this.run!;
    if (this.eliteDone) {
      this.startFinal(); // элита уже пройдена — не зацикливаемся
      return;
    }
    this.eliteDone = true;
    this.statusText.setText('👹 Элитный зверь преградил путь!');
    const dmg = Math.max(5, Math.floor(run.creatureAtk * 0.8));
    const mods = computeRunMods(run);
    const survive = run.stamina > dmg * 0.5; // простая проверка с учётом карточек выносливости
    void mods;
    if (survive) {
      run.stamina -= Math.floor(dmg * 0.5);
      run.foodFound += 2;
      this.statusText.setText(`👹 Элитный зверь отогнан! (−${Math.floor(dmg / 2)} вын., +2 🍖)`);
      // наградная карточка
      this.hint2Text.setText('Трофей элиты — дополнительная карточка:');
      this.time.delayedCall(600, () => this.showDraft());
    } else {
      run.stamina = Math.max(0, run.stamina - dmg);
      this.hint2Text.setText('');
      this.time.delayedCall(600, () => this.startFinal());
    }
  }

  // ---------- Финальный бой ----------

  private startFinal(): void {
    const run = this.run!;
    run.phase = 'final';
    this.statusText.setText(
      `${run.creature.icon} Финальная схватка! Кликайте, чтобы атаковать.`);
    this.hint2Text.setText('');

    // существо
    const sprite = this.add.image(360, 640, 'monster').setDisplaySize(150, 150)
      .setInteractive({ useHandCursor: true });
    this.add.rectangle(360, 760, 420, 24, 0x333333);
    const hpBar = this.add.image(360, 760, 'bar').setTint(0xdd3333).setDisplaySize(420, 24);
    const stamText = this.add.text(360, 800, '', { fontSize: '22px', color: '#8aff5a' }).setOrigin(0.5);

    const updateBars = () => {
      hpBar.setDisplaySize(420 * Math.max(0, run.creatureHp / run.creatureMaxHp), 24);
      stamText.setText(`❤ Выносливость: ${Math.ceil(run.stamina)}`);
    };
    updateBars();

    // атака игрока по клику
    sprite.on('pointerdown', () => {
      if (this.runRef !== run || !this.run || this.run.phase !== 'final') return;
      const mods = computeRunMods(run);
      let dmg = this.state.clickDamage() * mods.clickMult * mods.dmgMult;
      if (Math.random() < mods.critChance) dmg *= 3;
      if (Math.random() < this.state.ultraCritChance()) dmg *= this.state.ultraCritMult(); // ультра поверх крита
      run.creatureHp -= dmg;
      this.applyLifesteal(run, dmg);
      sprite.x = 360 + Phaser.Math.Between(-4, 4);
      updateBars();
      if (run.creatureHp <= 0) this.victory();
    });

    // авто-ДПС игрока (клики ускоряют, но не обязательны)
    this.dpsTimer = this.time.addEvent({
      delay: 700,
      loop: true,
      callback: () => {
        if (this.runRef !== run || !this.run || this.run.phase !== 'final') return;
        const mods = computeRunMods(run);
        const dmg = this.state.totalDps() * 0.7 * mods.dmgMult;
        run.creatureHp -= dmg;
        this.applyLifesteal(run, dmg);
        updateBars();
        if (run.creatureHp <= 0) this.victory();
      },
    });

    // ответные удары существа по выносливости
    this.creatureTimer = this.time.addEvent({
      delay: CREATURE_ATTACK_MS,
      loop: true,
      callback: () => {
        if (this.runRef !== run || !this.run || this.run.phase !== 'final') return;
        run.stamina -= run.creatureAtk;
        updateBars();
        if (run.stamina <= 0) this.defeat();
      },
    });
  }

  private applyLifesteal(run: HuntRunState, dmg: number): void {
    const mods = computeRunMods(run);
    if (mods.lifesteal > 0) {
      run.stamina = Math.min(mods.staminaMax, run.stamina + lifestealHeal(dmg, mods));
    }
  }

  private victory(): void {
    if (!this.run || this.run.phase !== 'final') return; // защита от повторного вызова
    const run = this.run;
    run.phase = 'won';
    this.clearTimers();
    // extraCapture уже содержит бонус питомцев (startHunt) — не учитываем дважды
    const chance = captureChance(run);
    const captured = Math.random() < chance;
    const rw = victoryRewards(run, this.state.incomePerSec(), Math.random, this.state.totalKeyBonus());
    this.state.finishHunt(run, rw, captured, true);
    this.state.save();

    this.children.removeAll(true);
    this.add.rectangle(360, 640, 720, 1280, 0x0c1a12).setAlpha(0.98).setInteractive();
    const lines = [
      `🏆 Существо побеждено!`,
      captured
        ? `${run.creature.icon} Пойман питомец: [${RARITY_INFO[run.creatureRarity].ru}]`
        : `${run.creature.icon} Увы, существо вырвалось...`,
      `🪙 ${formatNumber(rw.gold)}   🍖 ${rw.food}   🗝 ${rw.keys}`,
      `Шанс поимки был: ${Math.round(chance * 100)}%`,
    ].join('\n');
    this.add.text(360, 500, lines, { fontSize: '26px', color: '#8affc0', align: 'center' }).setOrigin(0.5);
    const back = this.add.text(360, 700, 'Вернуться', { fontSize: '30px', color: '#ffe6a0' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.showSelect());
  }

  private defeat(): void {
    if (!this.run || this.run.phase !== 'final') return;
    const run = this.run;
    run.phase = 'lost';
    this.clearTimers();
    const rw = defeatRewards(run);
    this.state.finishHunt(run, rw, false, false);
    this.state.save();

    this.children.removeAll(true);
    this.add.rectangle(360, 640, 720, 1280, 0x0c1a12).setAlpha(0.98).setInteractive();
    this.add.text(360, 500,
      `💀 Выносливость иссякла — существо ушло.\n🍖 ${rw.food}   🗝 ${rw.keys}`,
      { fontSize: '26px', color: '#ffb0a0', align: 'center' }).setOrigin(0.5);
    const back = this.add.text(360, 700, 'Вернуться', { fontSize: '30px', color: '#ffe6a0' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.showSelect());
  }

  // ---------- HUD забега ----------

  private refreshMods(): void {
    if (!this.run) return;
    const mods = computeRunMods(this.run);
    const syn = activeSynergies(this.run);
    const cards = this.run.pickedCards.map((c) => c.name).join(', ');
    this.modText.setText(
      `⚔×${mods.dmgMult.toFixed(2)}  👆×${mods.clickMult.toFixed(2)}  ❤${Math.ceil(this.run.stamina)}/${mods.staminaMax}` +
      `  🪙×${mods.goldMult.toFixed(2)}  Крит+${Math.round(mods.critChance * 100)}%  🩸${Math.round(mods.lifesteal * 100)}%` +
      (syn.length ? `\n🔥 ${syn.map((s) => s.name).join(', ')}` : '') +
      (cards ? `\n🃏 ${cards}` : ''),
    );
  }

  private clearTimers(): void {
    for (const t of [this.creatureTimer, this.dpsTimer]) {
      if (t) t.remove(false);
    }
    this.creatureTimer = undefined;
    this.dpsTimer = undefined;
    this.runRef = null; // все callback'ы старого забега мертвы
  }
}
