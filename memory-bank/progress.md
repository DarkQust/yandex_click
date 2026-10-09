# Progress

## Сделано (итерация 1, день 1)
- [x] Концепция игры и документация (GAME_IDEA.md, GAME_SPEC.md)
- [x] Memory-bank инициализирован
- [x] Каркас проекта: package.json, tsconfig, vite.config (base './'), ESLint, Prettier, index.html с YaGames SDK
- [x] npm install

- [x] Ядро: src/core (config, economy, skills, prestige, saveSystem, gameState)
- [x] Сцены Phaser: Boot (генерация текстур, SDK, оффлайн-доход), Forge (merge-сетка), Dungeon (автобитва), SkillTree
- [x] Обёртка YaGames SDK (src/platform/yandex.ts) с mock-fallback
- [x] Юнит-тесты Vitest: 18/18 зелёные
- [x] tsc √, eslint √, `npm run build` √ (dist 348KB gzip), dev-сервер smoke-test 200/200
- [x] Коммит MVP

## Проверено
- `npm run build` — успешно
- `npm run test` — 18 passed
- Dev-сервер отдаёт игру на :5199

## Итерация 2 — этап A1 (ГОТОВ)
- [x] EngineScene — тонкий runtime-слой, глобальный wall-clock tick экономики
- [x] GameState.tick(now) в core; авто-спавн (навык Магнетизм) перенесён в tick
- [x] Оверлей-модель: Forge больше НЕ паузится, Dungeon/SkillTree не resume, блок ввода под оверлеями
- [x] gridVersion — dirty-флаг для перерисовки HUD из любых источников изменений
- [x] tests/engine.test.ts: 5 тестов регрессии idle-фриза (все зелёные, итого 23/23)
- [x] tsc 0, eslint 0, build OK, smoke 200/200/200

## Следующая итерация (2)
- [x] A1 фундамент (idle-фикс)
- [x] A2 Раннер в данже + активный клик
  - параллакс 3 слоя (TileSprite), герой бежит на месте (2 кадра бега)
  - враги наезжают справа (150px/с), бой при контакте FIGHT_X=330
  - активный клик по врагу = 15% ДПС (CLICK_DAMAGE_RATIO), дамаг-числа, screen shake
  - авто-атака ДПС каждые 700мс, крит ×3 по навыку
  - награды/волны/боссы сохранены; engine idle работает пока открыт данж
  - placeholder-текстуры в Boot (hero_run_0/1, bg_far/mid/ground)
- [x] A3 Ядро артефактов (редкости/аффиксы/reroll/secret affix)
  - src/core/artifacts.ts: 5 редкостей (Кованый..Легендарный), 14 аффиксов (10 обычных + 4 secret), крафт за Осколки (25), рерoll за Стабилизатор (1), распыл по редкости
  - SaveData v2 (миграция мягкая: v1 получает дефолты, стартовые 30 осколков + 2 стабилизатора)
  - GameState: craftArtifact/rerollArtifact/salvageArtifact/equip/unequip (макс 5 экип, 30 инвентарь)
  - Артефакты мультипликативно усиливают income/dps/click + totalCritChance/totalCritMult/totalLuckyMerge/totalDungeonGold/totalCrystal
  - Престиж сохраняет артефакты/осколки/стабилизаторы
  - 13 новых тестов (итого 37/37)
- [ ] A4 Разломы (data-driven ExpeditionScene + 4 разлома)
- [ ] A5 Охота + питомцы (кейсы/ключи/корм)
- [ ] A6 Адаптация престижа/навыков, ранний прогресс
- [ ] A7 Баланс
- [ ] B Визуал (pixellab анимации, image-gen ассеты)
- [ ] Ручной осмотр в браузере (пользователь): баланс, ощущения
- [ ] Геймплей: таверна героев? больше визуальной награды за слияние (частицы)
- [ ] Ежедневная награда, достижения
- [ ] Звуки (WebAudio-генерация или ассеты)

## Запланировано (итерации 2+)
- [ ] Балансировка и полировка UI
- [ ] Звуки/музыка
- [ ] Достижения, ежедневные награды
- [ ] Публикация драфта на Яндекс.Игры

## Блокеры
- Нет
