import Phaser from 'phaser';
import { INTERSTITIAL_BOSS_INTERVAL } from '../core/config';
import {
  bossCrystalReward,
  formatNumber,
  isBossWave,
  monsterGoldReward,
  monsterHp,
} from '../core/economy';
import { GameState } from '../core/gameState';
import { ya } from '../platform/yandex';

const ATTACK_INTERVAL_MS = 700; // авто-атака героя
const ENEMY_SPEED = 150; // px/с наезд врага
const HERO_X = 150;
const FIGHT_X = 330; // где враг встречается с героем
const GROUND_Y = 830;

interface Enemy {
  sprite: Phaser.GameObjects.Image;
  hp: number;
  maxHp: number;
  wave: number;
  engaged: boolean;
}

/**
 * Данж-раннер: герой бежит на месте, параллакс-фон, враги наезжают справа.
 * Активный клик по врагу = урон (15% ДПС). Авто-атака по таймеру.
 */
export class DungeonScene extends Phaser.Scene {
  private state!: GameState;
  private bgFar!: Phaser.GameObjects.TileSprite;
  private bgMid!: Phaser.GameObjects.TileSprite;
  private bgGround!: Phaser.GameObjects.TileSprite;
  private hero!: Phaser.GameObjects.Image;
  private enemy: Enemy | null = null;
  private hpBar!: Phaser.GameObjects.Image;
  private waveText!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private log: string[] = [];
  private running = false;
  private heroFrame = 0;

  constructor() {
    super('Dungeon');
  }

  create(): void {
    this.state = this.registry.get('state') as GameState;
    this.running = true;

    // фон-подложка оверлея (блокирует ввод к Forge)
    this.add.rectangle(360, 640, 720, 1280, 0x0c141c).setInteractive();

    // параллакс
    this.bgFar = this.add.tileSprite(360, 350, 720, 400, 'bg_far');
    this.bgMid = this.add.tileSprite(360, 700, 720, 150, 'bg_mid');
    this.bgGround = this.add.tileSprite(360, GROUND_Y + 30, 720, 60, 'bg_ground');

    this.add
      .text(360, 60, '🏰 Подземелье Героев', { fontSize: '40px', color: '#9adcff' })
      .setOrigin(0.5);
    this.waveText = this.add.text(360, 120, '', { fontSize: '30px', color: '#ffffff' }).setOrigin(0.5);

    // герой
    this.hero = this.add.image(HERO_X, GROUND_Y, 'hero_run_0');

    // HP-бар врага
    this.add.rectangle(500, 700, 400, 26, 0x333333);
    this.hpBar = this.add.image(500, 700, 'bar').setTint(0xdd3333).setDisplaySize(400, 26);

    this.statsText = this.add
      .text(360, 920, '', { fontSize: '24px', color: '#ffb0a0', align: 'center' })
      .setOrigin(0.5);
    this.logText = this.add
      .text(360, 1010, '', { fontSize: '21px', color: '#c8d8e8', align: 'center' })
      .setOrigin(0.5);

    this.add
      .text(360, 1100, '👆 Кликайте по врагу — активные удары!', {
        fontSize: '24px',
        color: '#ffe66e',
      })
      .setOrigin(0.5);

    const back = this.add
      .text(360, 1210, '← Вернуться в кузницу', { fontSize: '30px', color: '#ffe6a0' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => {
      this.running = false;
      this.state.save();
      this.scene.stop(); // оверлей-модель: Forge под нами не паузилась
    });

    this.spawnWave();

    // обновление строки статов
    this.time.addEvent({ delay: 500, loop: true, callback: () => this.updateStats() });
    // авто-атака героя (ДПС)
    this.time.addEvent({ delay: ATTACK_INTERVAL_MS, loop: true, callback: () => this.autoAttack() });
    // кадры бега
    this.time.addEvent({
      delay: 160,
      loop: true,
      callback: () => {
        this.heroFrame = 1 - this.heroFrame;
        this.hero.setTexture(`hero_run_${this.heroFrame}`);
      },
    });
  }

  update(_time: number, delta: number): void {
    if (!this.running) return;
    const dt = delta / 1000;
    const moving = this.enemy && !this.enemy.engaged;

    // параллакс: фон движется пока герой бежит к врагу
    const scroll = moving ? 1 : 0.25;
    this.bgFar.tilePositionX += 20 * dt * scroll;
    this.bgMid.tilePositionX += 60 * dt * scroll;
    this.bgGround.tilePositionX += ENEMY_SPEED * dt * scroll;

    if (this.enemy && !this.enemy.engaged) {
      this.enemy.sprite.x -= ENEMY_SPEED * dt;
      if (this.enemy.sprite.x <= FIGHT_X) {
        this.enemy.sprite.x = FIGHT_X;
        this.enemy.engaged = true;
      }
    }
  }

  private spawnWave(): void {
    const wave = this.state.data.wave;
    const maxHp = monsterHp(wave);
    const boss = isBossWave(wave);
    const texture = boss ? 'boss' : 'monster';
    const sprite = this.add.image(760, GROUND_Y, texture).setInteractive({ useHandCursor: true });
    if (boss) sprite.setDisplaySize(160, 160);
    this.enemy = { sprite, hp: maxHp, maxHp, wave, engaged: false };

    sprite.on('pointerdown', () => this.clickAttack());
    this.waveText.setText(boss ? `☠ БОСС — волна ${wave}` : `Волна ${wave}`);
    this.updateHpBar();
    if (boss) this.pushLog('⚠ Впереди босс!');
  }

  /** Активный клик по врагу */
  private clickAttack(): void {
    const e = this.enemy;
    if (!e || !this.running) return;
    const dmg = this.state.clickDamage();
    this.dealDamage(dmg, '👆');
    // кивок героя вперёд
    this.tweens.add({ targets: this.hero, x: HERO_X + 18, yoyo: true, duration: 90 });
    this.cameras.main.shake(60, 0.004);
  }

  /** Авто-атака ДПС */
  private autoAttack(): void {
    const e = this.enemy;
    if (!this.running || !e || !e.engaged) return;
    let dmg = this.state.totalDps() * (ATTACK_INTERVAL_MS / 1000);
    let tag = '⚔';
    if (Math.random() < this.state.totalCritChance()) {
      dmg *= this.state.totalCritMult();
      tag = '💥 КРИТ';
    }
    this.dealDamage(dmg, tag);
  }

  private dealDamage(dmg: number, tag: string): void {
    const e = this.enemy;
    if (!e) return;
    e.hp -= dmg;
    this.damageNumber(e.sprite.x, e.sprite.y - 60, dmg, tag);
    e.sprite.x += Phaser.Math.Between(-3, 3);
    this.updateHpBar();
    if (e.hp <= 0) this.onKill();
  }

  private updateHpBar(): void {
    const e = this.enemy;
    const ratio = e ? Math.max(0, e.hp / e.maxHp) : 0;
    this.hpBar.setDisplaySize(400 * ratio, 26);
  }

  private damageNumber(x: number, y: number, dmg: number, tag: string): void {
    const t = this.add
      .text(x, y, `${tag} ${formatNumber(dmg)}`, {
        fontSize: '24px',
        color: tag.includes('💥') ? '#ff6e4a' : '#ffd24a',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  private onKill(): void {
    const e = this.enemy!;
    const wave = e.wave;
    const gold = Math.floor(monsterGoldReward(wave) * this.state.totalDungeonGoldMult());
    this.state.addGold(gold);
    let msg = `+${formatNumber(gold)} 🪙`;

    if (isBossWave(wave)) {
      const crystals = bossCrystalReward(wave) * this.state.totalCrystalMult();
      this.state.data.crystals += crystals;
      this.state.data.bossesKilled += 1;
      msg += `, +${crystals} 💎`;
      // редкие ресурсы охоты: приманка и ключ
      if (Math.random() < 0.2) { this.state.data.bait += 1; msg += ', 🎣приманка'; }
      if (Math.random() < Math.min(0.95, 0.05 + this.state.totalKeyBonus())) { this.state.data.keys += 1; msg += ', 🗝ключ'; }
      if (this.state.data.bossesKilled % INTERSTITIAL_BOSS_INTERVAL === 0) void ya.showInterstitial();
      void ya.submitLeaderboard(this.state.data.lifetimeGold);
    }
    this.pushLog(`Волна ${wave}: ${msg}`);
    this.state.data.wave += 1;
    this.state.data.bestWave = Math.max(this.state.data.bestWave, wave);
    this.state.save();

    // враг убит — герой пробегает вперёд, спавним следующую волну
    this.enemy = null;
    this.tweens.add({
      targets: e.sprite,
      x: 800,
      alpha: 0,
      duration: 400,
      onComplete: () => e.sprite.destroy(),
    });
    this.time.delayedCall(700, () => {
      if (this.running) this.spawnWave();
    });
  }

  private pushLog(text: string): void {
    this.log.push(text);
    if (this.log.length > 3) this.log.shift();
    this.logText.setText(this.log.join('\n'));
  }

  updateStats(): void {
    this.statsText.setText(
      `ДПС: ${formatNumber(this.state.totalDps())}  |  Клик: ${formatNumber(this.state.clickDamage())}  |  Рекорд волн: ${this.state.data.bestWave}`,
    );
  }
}
