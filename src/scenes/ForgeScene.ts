import Phaser from 'phaser';
import { GRID_COLS, GRID_SIZE, LUCKY_MERGE_BASE_CHANCE, MAX_TIER } from '../core/config';
import {
  Weapon,
  canMerge,
  firstEmptySlot,
  formatNumber,
  merge,
  randomBranch,
} from '../core/economy';
import { GameState } from '../core/gameState';
import { ya } from '../platform/yandex';

const CELL = 112;
const GRID_X = (720 - GRID_COLS * CELL) / 2;
const GRID_Y = 430;

/** Основная сцена: сетка слияния, спавнер, HUD. */
export class ForgeScene extends Phaser.Scene {
  private state!: GameState;
  private weaponSprites: (Phaser.GameObjects.Container | null)[] = new Array(GRID_SIZE).fill(null);
  private hudGold!: Phaser.GameObjects.Text;
  private hudIncome!: Phaser.GameObjects.Text;
  private hudDps!: Phaser.GameObjects.Text;
  private hudCrystals!: Phaser.GameObjects.Text;
  private spawnBtnText!: Phaser.GameObjects.Text;
  private doubleText!: Phaser.GameObjects.Text;
  private lastGridVersion = -1;

  constructor() {
    super('Forge');
  }

  create(): void {
    this.state = this.registry.get('state') as GameState;

    this.add.rectangle(360, 640, 720, 1280, 0x1a120c);
    this.add.rectangle(360, 200, 720, 400, 0x241812);
    this.drawHeader();
    this.drawGrid();
    this.renderAllWeapons();
    this.drawBottomBar();
    this.refreshHud();

    // HUD обновляем ежесекундно; экономику начисляет EngineScene (не зависит от этой сцены)
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.hudTick() });
  }

  private drawHeader(): void {
    this.add
      .text(360, 40, '⚒ Кузница Героев', { fontSize: '40px', color: '#d8b24a' })
      .setOrigin(0.5);

    this.hudGold = this.add.text(30, 90, '', { fontSize: '32px', color: '#ffd24a' });
    this.hudCrystals = this.add.text(30, 135, '', { fontSize: '28px', color: '#9adcff' });
    this.hudIncome = this.add.text(30, 180, '', { fontSize: '26px', color: '#b8ffc0' });
    this.hudDps = this.add.text(30, 215, '', { fontSize: '26px', color: '#ffb0a0' });
    this.doubleText = this.add.text(30, 250, '', { fontSize: '24px', color: '#ffe66e' });

    this.makeButton(560, 100, '🏰 В ДАНЖ', () => {
      this.scene.launch('Dungeon');
    }, 280, 70, 'btn', 24);

    this.makeButton(560, 185, '🔮 Навыки', () => {
      this.scene.launch('SkillTree');
    }, 280, 70, 'btn', 24);

    this.makeButton(560, 290, '📺 Доход ×2 (5 мин)', () => {
      void ya.showRewarded().then((ok) => {
        if (ok) {
          this.state.activateDoubleIncome();
          this.refreshHud();
          this.showToast('⚡ Доход удвоен на 5 минут!');
        }
      });
    }, 280, 64, 'btn_green', 22);

    this.makeButton(560, 365, '♻ Перековка', () => {
      const gained = this.state.doPrestige();
      if (gained > 0) {
        this.renderAllWeapons();
        this.refreshHud();
        this.showToast(`Перековка! +${gained} душ`);
      } else {
        this.showToast('Рано: нужно 1M+ накопленного золота');
      }
    }, 280, 64, 'btn', 22);
  }

  private drawGrid(): void {
    for (let i = 0; i < GRID_SIZE; i++) {
      const x = GRID_X + (i % GRID_COLS) * CELL + CELL / 2;
      const y = GRID_Y + Math.floor(i / GRID_COLS) * CELL + CELL / 2;
      this.add.image(x, y, 'cell');
    }
  }

  private drawBottomBar(): void {
    const bar = this.add.rectangle(360, 1180, 720, 200, 0x241812);
    bar.setDepth(-1);
    const btn = this.add.image(200, 1170, 'btn').setInteractive({ useHandCursor: true });
    btn.setDisplaySize(320, 86);
    this.spawnBtnText = this.add
      .text(200, 1170, '', { fontSize: '26px', color: '#ffe6a0' })
      .setOrigin(0.5);
    btn.on('pointerdown', () => this.spawnWeapon());

    this.add
      .text(360, 1080, 'Перетащите два одинаковых оружия для слияния', {
        fontSize: '20px',
        color: '#c8b090',
      })
      .setOrigin(0.5);

    this.makeButton(170, 1135, '🌀 Разломы', () => {
      this.scene.launch('Expedition');
    }, 200, 52, 'btn', 18);
    this.makeButton(390, 1135, '📦 Артефакты', () => {
      this.scene.launch('Artifact');
    }, 200, 52, 'btn', 18);
    this.makeButton(600, 1135, '🏹 Охота', () => {
      this.scene.launch('Hunt');
    }, 190, 52, 'btn', 18);
    this.makeButton(160, 1210, '🏰 Данж', () => {
      this.scene.launch('Dungeon');
    }, 190, 52, 'btn', 18);
    this.makeButton(480, 1210, '🐾 Питомцы', () => {
      this.scene.launch('Pet');
    }, 240, 52, 'btn', 18);
  }

  /** Сцена больше не начисляет экономику (это делает EngineScene). Только обновление UI. */
  private hudTick(): void {
    if (this.state.gridVersion !== this.lastGridVersion) {
      this.lastGridVersion = this.state.gridVersion;
      this.renderAllWeapons();
    }
    this.refreshHud();
  }

  private spawnWeapon(free = false): void {
    const cost = this.state.spawnCostNow();
    const slot = firstEmptySlot(this.state.data.grid);
    if (slot < 0) {
      this.showToast('Сетка заполнена — сливайте оружие!');
      return;
    }
    if (!free) {
      this.state.data.spawnCount += 1;
      if (!this.state.spendGold(cost)) {
        this.state.data.spawnCount -= 1;
        this.showToast('Не хватает золота!');
        return;
      }
    }
    let tier = 1;
    if (Math.random() < this.state.effects.tier2SpawnChance) tier = 2;
    // тир-прыжок от питомцев/скиллов: оружие ковается тиром выше (кап MAX_TIER)
    if (Math.random() < this.state.forgeTierJumpChance() && tier < MAX_TIER) tier += 1;
    this.state.data.grid[slot] = { branch: randomBranch(), tier };
    this.state.gridVersion++;

    // дополнительная генерация: навык «Щедрый очаг» + модификаторы питомцев
    if (Math.random() < this.state.forgeExtraSpawnChance()) {
      const extra = firstEmptySlot(this.state.data.grid);
      if (extra >= 0) {
        let extraTier = 1;
        if (Math.random() < this.state.forgeTierJumpChance() && extraTier < MAX_TIER) extraTier += 1;
        this.state.data.grid[extra] = { branch: randomBranch(), tier: extraTier };
        this.state.gridVersion++;
      }
    }
    this.renderAllWeapons();
    this.refreshHud();
  }

  private renderAllWeapons(): void {
    for (const c of this.weaponSprites) c?.destroy(true);
    this.weaponSprites = new Array(GRID_SIZE).fill(null);
    this.state.data.grid.forEach((w, i) => {
      if (w) this.weaponSprites[i] = this.createWeaponSprite(i, w);
    });
  }

  private cellXY(index: number): [number, number] {
    return [
      GRID_X + (index % GRID_COLS) * CELL + CELL / 2,
      GRID_Y + Math.floor(index / GRID_COLS) * CELL + CELL / 2,
    ];
  }

  private createWeaponSprite(index: number, w: Weapon): Phaser.GameObjects.Container {
    const [x, y] = this.cellXY(index);
    const container = this.add.container(x, y);
    const img = this.add.image(0, 0, `w_${w.branch}_${w.tier}`);
    const label = this.add
      .text(0, 40, `Т${w.tier}`, {
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    container.add([img, label]);
    container.setSize(CELL, CELL);
    container.setInteractive({ draggable: true, useHandCursor: true });
    this.input.setDraggable(container);

    container.on('dragstart', () => {
      this.children.bringToTop(container);
      img.setAlpha(0.7);
    });
    container.on('drag', (_p: unknown, dragX: number, dragY: number) => {
      container.x = dragX;
      container.y = dragY;
    });
    container.on('dragend', () => {
      img.setAlpha(1);
      this.handleDrop(index, container);
    });
    return container;
  }

  private handleDrop(fromIndex: number, container: Phaser.GameObjects.Container): void {
    const targetIndex = this.slotAt(container.x, container.y);
    if (targetIndex >= 0 && targetIndex !== fromIndex) {
      const a = this.state.getWeapon(fromIndex);
      const b = this.state.getWeapon(targetIndex);
      if (a && !b) {
        this.state.data.grid[targetIndex] = a;
        this.state.data.grid[fromIndex] = null;
        this.state.gridVersion++;
        this.renderAllWeapons();
        this.refreshHud();
        return;
      }
      if (a && b && canMerge(a, b)) {
        const luckyChance = LUCKY_MERGE_BASE_CHANCE + this.state.totalLuckyMergeChance();
        const res = merge(a, b, luckyChance);
        if (res) {
          this.state.data.grid[fromIndex] = null;
          this.state.data.grid[targetIndex] = res.result;
          this.state.gridVersion++;
          this.renderAllWeapons();
          if (res.lucky) this.showToast('🍀 Удачное слияние! Тир +2!');
          this.refreshHud();
          return;
        }
      }
    }
    const [x, y] = this.cellXY(fromIndex);
    this.tweens.add({ targets: container, x, y, duration: 150 });
  }

  private slotAt(x: number, y: number): number {
    for (let i = 0; i < GRID_SIZE; i++) {
      const [cx, cy] = this.cellXY(i);
      if (Math.abs(x - cx) < CELL / 2 && Math.abs(y - cy) < CELL / 2) return i;
    }
    return -1;
  }

  private refreshHud(): void {
    const d = this.state.data;
    this.hudGold.setText(`🪙 ${formatNumber(d.gold)}`);
    this.hudCrystals.setText(`💎 ${formatNumber(d.crystals)}   💠 ${d.shards}   🔩 ${d.stabilizers}   🎣 ${d.bait}   🗝 ${d.keys}`);
    this.hudIncome.setText(`Доход: ${formatNumber(this.state.incomePerSec())}/с`);
    this.hudDps.setText(`ДПС: ${formatNumber(this.state.totalDps())}   Волна: ${d.wave}`);
    const rem = this.state.doubleIncomeRemaining();
    this.doubleText.setText(rem > 0 ? `⚡ ×2 доход: ${rem}с` : '');
    this.spawnBtnText.setText(`⚒ Наковать (${formatNumber(this.state.spawnCostNow())} 🪙)`);
  }

  private showToast(text: string): void {
    const t = this.add
      .text(360, 640, text, {
        fontSize: '28px',
        color: '#ffe6a0',
        backgroundColor: '#000000aa',
        padding: { x: 16, y: 10 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(100);
    this.tweens.add({ targets: t, alpha: 0, y: 560, duration: 1600, onComplete: () => t.destroy() });
  }

  private makeButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    w = 300,
    h = 80,
    texture = 'btn',
    fontSize = 26,
  ): void {
    const img = this.add.image(x, y, texture).setInteractive({ useHandCursor: true });
    img.setDisplaySize(w, h);
    const txt = this.add
      .text(x, y, label, { fontSize: `${fontSize}px`, color: '#ffe6a0' })
      .setOrigin(0.5);
    img.on('pointerdown', onClick);
    img.on('pointerover', () => txt.setScale(1.05));
    img.on('pointerout', () => txt.setScale(1));
  }
}

