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
    g.destroy();
  }

  async startGame(): Promise<void> {
    const loading = this.add
      .text(360, 640, 'Загрузка...', { fontSize: '40px', color: '#d8b24a' })
      .setOrigin(0.5);

    await ya.init();
    const cloud = await ya.cloudLoad();
    const state = GameState.load(cloud);
    const offline = state.applyOfflineEarnings();
    state.startAutosave((save) => ya.cloudSave(save));

    // сейв при закрытии вкладки
    window.addEventListener('beforeunload', () => state.save());

    this.registry.set('state', state);
    this.scene.launch('Engine'); // глобальный idle-движок, всегда активен
    loading.destroy();

    if (offline > 0) {
      this.add
        .text(360, 500, `Пока вас не было, кузница наковала:\n🪙 ${formatNumber(offline)} золота!`, {
          fontSize: '30px',
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
