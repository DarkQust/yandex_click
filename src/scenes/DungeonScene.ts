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

const TICK_MS = 500; // бой тикает 2 раза в секунду

/** Автобитва данжа: суммарный ДПС кузницы против монстров. */
export class DungeonScene extends Phaser.Scene {
  private state!: GameState;
  private mobHp = 0;
  private mobMaxHp = 1;
  private mobSprite!: Phaser.GameObjects.Image;
  private hpBar!: Phaser.GameObjects.Image;
  private waveText!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private running = false;
  private log: string[] = [];

  constructor() {
    super('Dungeon');
  }

  create(): void {
    this.state = this.registry.get('state') as GameState;
    this.running = true;

    this.add.rectangle(360, 640, 720, 1280, 0x0c141c).setAlpha(0.97).setInteractive(); // блокирует ввод к Forge под оверлеем
    this.add
      .text(360, 60, '🏰 Подземелье Героев', { fontSize: '40px', color: '#9adcff' })
      .setOrigin(0.5);

    this.waveText = this.add.text(360, 130, '', { fontSize: '30px', color: '#ffffff' }).setOrigin(0.5);

    // монстр
    this.mobSprite = this.add.image(360, 500, 'monster');
    // полоска HP
    this.add.rectangle(360, 660, 420, 30, 0x333333);
    this.hpBar = this.add.image(360 - 210 + 100, 660, 'bar').setTint(0xdd3333);
    this.hpBar.setDisplaySize(420, 30);

    this.add
      .text(360, 760, '', { fontSize: '26px', color: '#ffb0a0' })
      .setOrigin(0.5)
      .setName('dpsText');

    this.logText = this.add
      .text(360, 960, '', { fontSize: '22px', color: '#c8d8e8', align: 'center' })
      .setOrigin(0.5);

    // кнопка назад
    const back = this.add
      .text(360, 1220, '← Вернуться в кузницу', { fontSize: '30px', color: '#ffe6a0' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.exit());

    this.spawnWave();
    this.time.addEvent({ delay: TICK_MS, loop: true, callback: () => this.combatTick() });
  }

  private spawnWave(): void {
    const wave = this.state.data.wave;
    this.mobMaxHp = monsterHp(wave);
    this.mobHp = this.mobMaxHp;
    const boss = isBossWave(wave);
    this.mobSprite.setTexture(boss ? 'boss' : 'monster');
    this.mobSprite.setAlpha(1);
    this.waveText.setText(
      boss ? `☠ БОСС — волна ${wave}` : `Волна ${wave}`,
    );
    this.pushLog(boss ? '⚠ Появился босс!' : `Волна ${wave} началась`);
  }

  private combatTick(): void {
    if (!this.running) return;

    let dmg = this.state.totalDps() * (TICK_MS / 1000);
    // крит
    if (Math.random() < this.state.effects.critChance) {
      dmg *= 3;
      this.pushLog('💥 Крит! ×3 урона');
    }
    this.mobHp -= dmg;

    const ratio = Math.max(0, this.mobHp / this.mobMaxHp);
    this.hpBar.setDisplaySize(420 * ratio, 30);
    this.hpBar.x = 360 - 210 + (420 * ratio) / 2;
    this.mobSprite.x = 360 + Phaser.Math.Between(-3, 3); // дрожание от ударов

    const dpsText = this.children.getByName('dpsText') as Phaser.GameObjects.Text;
    dpsText?.setText(`Ваш ДПС: ${formatNumber(this.state.totalDps())}   HP: ${formatNumber(Math.max(0, this.mobHp))}`);

    if (this.mobHp <= 0) {
      this.onKill();
    } else if (this.state.totalDps() <= 0) {
      this.pushLog('Нет урона! Скуйте оружие в кузнице.');
      this.mobHp = this.mobMaxHp; // монстр восстанавливается
    }
  }

  private onKill(): void {
    const wave = this.state.data.wave;
    const gold = Math.floor(monsterGoldReward(wave) * this.state.effects.dungeonGoldMult);
    this.state.addGold(gold);
    let msg = `+${formatNumber(gold)} 🪙`;

    if (isBossWave(wave)) {
      const crystals = bossCrystalReward(wave) * this.state.effects.crystalMult;
      this.state.data.crystals += crystals;
      this.state.data.bossesKilled += 1;
      msg += `, +${crystals} 💎`;
      if (this.state.data.bossesKilled % INTERSTITIAL_BOSS_INTERVAL === 0) {
        void ya.showInterstitial();
      }
      void ya.submitLeaderboard(this.state.data.lifetimeGold);
    }

    this.pushLog(`Волна ${wave} зачищена: ${msg}`);
    this.state.data.wave += 1;
    this.state.data.bestWave = Math.max(this.state.data.bestWave, wave);
    this.state.save();

    // небольшая пауза между волнами
    this.running = false;
    this.mobSprite.setAlpha(0.3);
    this.time.delayedCall(800, () => {
      this.spawnWave();
      this.running = true;
    });
  }

  private pushLog(text: string): void {
    this.log.push(text);
    if (this.log.length > 4) this.log.shift();
    this.logText.setText(this.log.join('\n'));
  }

  private exit(): void {
    this.running = false;
    this.state.save();
    this.scene.stop(); // Forge не паузится — оверлей-модель
  }
}
