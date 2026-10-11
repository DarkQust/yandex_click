import Phaser from 'phaser';
import { ya } from '../platform/yandex';
import { GameState } from '../core/gameState';
import { BRANCH_INFO, BRANCHES } from '../core/config';
import { formatNumber } from '../core/economy';

/** Реестр глобальных данных игры */
export interface GameRegistry {
  state: GameState;
}

/**
 * Boot: генерация текстур кодом (без бинарных ассетов),
 * инициализация YaGames SDK, загрузка сейва, оффлайн-доход.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.generateTextures();
    void this.startGame();
  }

  private generateTextures(): void {
    const g = this.add.graphics();

    // Ячейка сетки (пустая)
    g.fillStyle(0x2a1d14, 1);
    g.fillRoundedRect(0, 0, 110, 110, 12);
    g.lineStyle(2, 0x5a4433, 1);
    g.strokeRoundedRect(0, 0, 110, 110, 12);
    g.generateTexture('cell', 112, 112);
    g.clear();

    // Оружие по веткам и тирам: свечение усиливается с тиром
    for (const branch of BRANCHES) {
      for (let tier = 1; tier <= 20; tier++) {
        g.clear();
        const info = BRANCH_INFO[branch];
        const glow = Math.min(1, tier / 14);
        // подложка-свечение
        g.fillStyle(info.color, 0.15 + glow * 0.35);
        g.fillCircle(55, 55, 20 + glow * 30);
        // клинок/жезл/модуль — простые силуэты из примитивов
        g.fillStyle(info.color, 1);
        if (branch === 'sword') {
          g.fillTriangle(55, 12, 44, 58, 66, 58); // лезвие
          g.fillRect(44, 58, 22, 6); // гарда
          g.fillRect(51, 64, 8, 22); // рукоять
        } else if (branch === 'magic') {
          g.fillRect(51, 40, 8, 44); // посох
          g.fillCircle(55, 30, 12 + glow * 4); // сфера
          g.fillStyle(0xffffff, 0.7);
          g.fillCircle(51, 26, 4);
        } else {
          g.fillRoundedRect(38, 38, 34, 34, 6); // модуль
          g.fillStyle(0xffffff, 0.8);
          g.fillCircle(55, 55, 8 + glow * 3);
        }
        g.generateTexture(`w_${branch}_${tier}`, 110, 110);
      }
    }

    // Кнопка
    g.clear();
    g.fillStyle(0x6b4a1f, 1);
    g.fillRoundedRect(0, 0, 300, 80, 14);
    g.lineStyle(3, 0xd8b24a, 1);
    g.strokeRoundedRect(0, 0, 300, 80, 14);
    g.generateTexture('btn', 302, 82);
    g.clear();

    g.fillStyle(0x3a6b1f, 1);
    g.fillRoundedRect(0, 0, 300, 80, 14);
    g.lineStyle(3, 0x8aff5a, 1);
    g.strokeRoundedRect(0, 0, 300, 80, 14);
    g.generateTexture('btn_green', 302, 82);
    g.clear();

    // Полоска HP
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 200, 18);
    g.generateTexture('bar', 200, 18);
    g.clear();

    // Монстр (силуэт) и босс
    g.fillStyle(0x8a2f2f, 1);
    g.fillCircle(60, 60, 48);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(42, 46, 8);
    g.fillCircle(78, 46, 8);
    g.fillStyle(0x111111, 1);
    g.fillCircle(42, 46, 4);
    g.fillCircle(78, 46, 4);
    g.generateTexture('monster', 120, 120);
    g.clear();

    g.fillStyle(0x5a1f8a, 1);
    g.fillCircle(90, 90, 80);
    g.fillStyle(0xffd24a, 1);
    g.fillCircle(62, 70, 12);
    g.fillCircle(118, 70, 12);
    g.fillStyle(0x111111, 1);
    g.fillCircle(62, 70, 6);
    g.fillCircle(118, 70, 6);
    g.generateTexture('boss', 180, 180);

    // --- Placeholder-визуал раннера (до этапа B: ассеты image-gen/pixellab) ---
    // Герой: 2 кадра бега (силуэт воина с мечом)
    for (let f = 0; f < 2; f++) {
      g.clear();
      const legOff = f === 0 ? 8 : -8;
      g.fillStyle(0x9a8a6a, 1);
      g.fillRect(52, 20, 16, 16); // голова
      g.fillStyle(0x6a5a4a, 1);
      g.fillRect(46, 36, 28, 26); // торс
      g.fillRect(46 + legOff, 62, 10, 18); // нога 1
      g.fillRect(64 - legOff, 62, 10, 18); // нога 2
      g.fillStyle(0xd8b24a, 1);
      g.fillRect(72, f === 0 ? 30 : 40, 26, 6); // меч
      g.generateTexture(`hero_run_${f}`, 120, 90);
    }
    // Параллакс-фоны (3 слоя, бесшовные по X)
    g.clear();
    g.fillStyle(0x0a1018, 1);
    g.fillRect(0, 0, 720, 400);
    g.fillStyle(0x1a2436, 1);
    for (let i = 0; i < 6; i++) g.fillTriangle(i * 120, 400, i * 120 + 70, 120, i * 120 + 140, 400); // горы
    g.generateTexture('bg_far', 720, 400);
    g.clear();
    g.fillStyle(0x141c28, 0);
    g.fillStyle(0x222016, 1);
    for (let i = 0; i < 9; i++) {
      g.fillRect(i * 90 + 10, 60, 26, 90); // колонны
      g.fillRect(i * 90 + 4, 48, 38, 14);
    }
    g.generateTexture('bg_mid', 720, 150);
    g.clear();
    g.fillStyle(0x2a2018, 1);
    g.fillRect(0, 0, 720, 60);
    g.fillStyle(0x3a2c20, 1);
    for (let i = 0; i < 18; i++) g.fillRect(i * 40, 8 + (i % 3) * 14, 30, 10); // камни
    g.generateTexture('bg_ground', 720, 60);

    g.destroy();
  }

  async startGame(): Promise<void> {
    const loading = this.add
      .text(360, 640, 'Загрузка...', { fontSize: '40px', color: '#d8b24a' })
      .setOrigin(0.5);

    await ya.init();
    const cloud = await ya.cloudLoad();
    const state = GameState.load(cloud);
    const now = Date.now();
    const offline = state.applyOfflineEarnings(now);
    const offlineRifts = state.applyOfflineRifts(now);
    state.startAutosave((save) => ya.cloudSave(save));

    // сейв при закрытии вкладки
    window.addEventListener('beforeunload', () => state.save());

    this.registry.set('state', state);
    this.scene.launch('Engine'); // глобальный idle-движок, всегда активен
    loading.destroy();

    if (offline > 0 || offlineRifts.length > 0) {
      const riftLines = offlineRifts
        .map((r) => `${r.rift}: 💠${r.grant.shards} 🔩${r.grant.stabilizers} 📦${r.grant.artifacts} 🪙${formatNumber(r.grant.gold)}`)
        .join('\n');
      this.add
        .text(360, 460, `Пока вас не было:\n🪙 ${formatNumber(offline)} золота${riftLines ? '\n' + riftLines : ''}`, {
          fontSize: '28px',
          color: '#ffe6a0',
          align: 'center',
        })
        .setOrigin(0.5);
      this.add
        .text(360, 640, 'Забрать', { fontSize: '36px', color: '#8aff5a' })
        .setOrigin(0.5)
        .setInteractive()
        .on('pointerdown', () => this.scene.start('Forge'));
    } else {
      this.scene.start('Forge');
    }
  }
}
