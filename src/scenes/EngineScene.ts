import Phaser from 'phaser';
import { GameState } from '../core/gameState';

/**
 * Тонкий runtime-слой: всегда активна (никогда не паузится и не перекрывается),
 * каждый кадр гоняет wall-clock тик экономики GameState.
 * НИКАКОЙ игровой логики здесь нет — только оркестрация.
 */
export class EngineScene extends Phaser.Scene {
  private state!: GameState;

  constructor() {
    // active: false — запускаем вручную из Boot после инициализации state
    super({ key: 'Engine', active: false, visible: false });
  }

  create(): void {
    this.state = this.registry.get('state') as GameState;
  }

  update(): void {
    if (this.state) this.state.tick();
  }
}
