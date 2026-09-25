# Tech Context

## Стек
- TypeScript 5 (strict), Phaser 3.90, Vite 5, Vitest, ESLint+Prettier
- Яндекс.Игры SDK v2 (`https://yandex.ru/games/sdk/v2`), обёртка `src/platform/yandex.ts` с mock-fallback

## Архитектура
- `src/core/` — чистая игровая логика без Phaser (экономика, навыки, престиж, сейвы) → юнит-тестируемо
- `src/scenes/` — Phaser-сцены: Boot → Forge (основная) → Dungeon / SkillTree (оверлей)
- `src/ui/` — HUD-компоненты
- Текстуры генерируются кодом в BootScene (без бинарных ассетов)

## Сборка
- `vite` dev server; `vite build` с `base: './'` (обязательно для Яндекс.Игр)
- Тесты: `npm run test` (vitest run)

## Безопасность
- Никаких секретов в коде; Яндекс SDK не требует ключей на клиенте
