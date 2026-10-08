import { describe, expect, it } from 'vitest';
import { GameState } from '../src/core/gameState';

/**
 * Фундаментальный тест Idle: экономика идёт по wall-clock и НЕ зависит от сцен.
 * Регрессия бага Iteration 1: при открытии оверлеев доход замирал.
 */
describe('engine tick', () => {
  it('accrues gold by wall-clock dt', () => {
    const s = new GameState();
    s.data.grid = [{ branch: 'sword', tier: 1 }];
    s.refreshEffects();
    const income = s.incomePerSec();

    const t0 = 1_000_000;
    s.tick(t0); // инициализация
    const ev = s.tick(t0 + 5000); // +5 секунд
    expect(ev.goldGained).toBeCloseTo(income * 5, 5);
    expect(s.data.gold).toBeCloseTo(25 + income * 5, 5);
  });

  it('works without any scene (pure core)', () => {
    const s = new GameState();
    s.data.grid = [{ branch: 'sword', tier: 1 }]; // иначе доход 0 и нечего начислять
    const t0 = Date.now();
    s.tick(t0);
    s.tick(t0 + 60_000); // минута простоя без сцен
    expect(s.data.gold).toBeGreaterThan(25);
  });

  it('caps huge dt jumps', () => {
    const s = new GameState();
    s.data.grid = [{ branch: 'sword', tier: 1 }];
    const income = s.incomePerSec();
    s.tick(1_000_000);
    const ev = s.tick(1_000_000 + 24 * 3600 * 1000); // скачок на сутки
    expect(ev.goldGained).toBeCloseTo(income * 300, 5); // кап 5 мин
  });

  it('auto-spawn works via tick when skill autoSpawn on', () => {
    const s = new GameState();
    s.data.skills = { luck3: 1 };
    s.refreshEffects();
    s.tick(1_000_000);
    const ev = s.tick(1_000_000 + 25_000); // 25 сек — 2 спауна
    expect(ev.autoSpawned).toBe(2);
    expect(s.data.grid.filter(Boolean).length).toBe(2);
    const v = s.gridVersion;
    expect(v).toBeGreaterThanOrEqual(2);
  });

  it('auto-spawn stops when grid full', () => {
    const s = new GameState();
    s.data.skills = { luck3: 1 };
    s.refreshEffects();
    s.data.grid = new Array(20).fill({ branch: 'sword', tier: 1 });
    s.tick(1_000_000);
    const ev = s.tick(1_000_000 + 60_000);
    expect(ev.autoSpawned).toBe(0);
  });
});
