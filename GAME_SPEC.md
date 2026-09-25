# GAME_SPEC — Техническая спецификация

## Стек
- **TypeScript 5**, строгий режим
- **Phaser 3.90** (рендер, сцены, ввод)
- **Vite 5** (сборка/dev, base: './' для Яндекс.Игр iframe)
- **Vitest** — юнит-тесты игровой логики
- **ESLint + Prettier**

## Архитектура (модулизация)
```
src/
  main.ts            — точка входа, конфиг Phaser
  core/
    config.ts        — балансные константы (тиры, цены, формулы)
    economy.ts       — чистая логика: доход, ДПС, слияние, цены (тестируемо)
    skills.ts        — дерево навыков: узлы, эффекты, стоимость
    saveSystem.ts    — сериализация состояния, localStorage + YaGames cloud
    prestige.ts      — перековка души: формулы
  platform/
    yandex.ts        — обёртка YaGames SDK (safe-fallback для дев-режима)
  scenes/
    BootScene.ts     — генерация текстур кодом, инициализация SDK, загрузка сейва
    ForgeScene.ts    — основная сцена: сетка слияния, HUD, спавнер
    DungeonScene.ts  — автобитва волн/боссов
    SkillTreeScene.ts— оверлей дерева навыков
  ui/
    hud.ts, tooltip.ts — HUD-компоненты
tests/
  economy.test.ts, skills.test.ts — юнит-тесты чистой логики
```

## Данные (config.ts)
- 3 ветки: `sword`, `magic`, `tech`; по 20 тиров.
- Базовый доход оружия: `income = baseIncome[branch] * 2.6^(tier-1)`
- ДПС: `dps = baseDps[branch] * 2.2^(tier-1)`
- Цена спавна: `spawnCost = 10 * 1.35^spawnCount`
- Монстр волны n: `hp = 20 * 1.5^n`; награда `gold = 5 * 1.4^n`
- Босс (каждая 5-я волна): hp ×8, дроп кристаллов `crystals = 1 + floor(wave/10)`
- Престиж: множитель `1 + 0.1 * souls`, души = `floor(sqrt(totalGoldLifetime / 1e6))`

## Состояние игрока (SaveSystem)
```ts
interface SaveData {
  version: number;
  gold: number; crystals: number; souls: number;
  spawnCount: number; lifetimeGold: number;
  grid: (Weapon | null)[];      // 20 ячеек
  wave: number; bestWave: number;
  skills: Record<string, number>; // nodeId -> level
  doubleIncomeUntil: number;    // ts окончания ×2
  lastSeen: number;             // для оффлайн-дохода
}
interface Weapon { branch: 'sword'|'magic'|'tech'; tier: number; }
```

## Яндекс.Игры
- `<script src="https://yandex.ru/games/sdk/v2">` в index.html
- `ysdk.init()` → fallback на mock при недоступности
- `ysdk.getPlayer()` → cloud save (`setData/getData`), лидерборд `gold`
- `showRewardedVideo()` → ×2 доход 5 мин; `showFullscreenAdv()` на каждом 3-м боссе

## Тестирование
- Vitest: экономика (формулы), слияние, навыки, престиж, оффлайн-доход
- `npm run dev` — ручная проверка, `npm run build` — прод-билд

## Git
Коммит после каждой логической задачи. Коммит-месседжи на английском, conventional style.
