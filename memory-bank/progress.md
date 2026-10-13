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

## A4-fix pass (принят)
- [x] ExpeditionScene: таймер автоатаки снимается (clearAttackTimer при endRun/startRun), guard inRun в nextRoom vs stale delayedCall
- [x] Boot offline: applyOfflineEarnings + applyOfflineRifts используют один lastSeen (без двойного начисления) — подтверждено, без изменений
- [x] affixBias подключён: bias ×3 веса в rollAffix, craftArtifact(bias), дропы из разломов используют
- [x] offlineClearBundle: probabilisticFloor (матожидание сохраняется, дробные дропы не теряются)
- [x] sanitize riftProgress: safeNonNegInt vs NaN/Infinity/negatives
- [x] ArtifactScene: clamp скролла после изменения списка
- [x] Регрессионные тесты: +5 (итого 73/73), коммит A4-fix

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
- [x] A4 Разломы (data-driven ExpeditionScene + 4 разлома)
  - core/expeditions.ts: 4 разлома (Кузнец/Аркана/Механизм/Хаос) с уникальными модификаторами и affixBias
  - Бесконечная глубина: hp=30·1.35^d·mods, комнат 3+min(4,d/5)+bonus, награды растут с глубиной
  - Комнаты: combat/treasure/event/elite/mystery/boss, веса по разлому (data-driven)
  - Автофарм освоенных глубин в GameState.tick (без сцен), порог requiredDps, clearTime floor 20с, Механизм ×2
  - Оффлайн-разломы: агрегированный расчёт (offlineClearBundle, эфф. 75%, кап оффлайна), сводка в Boot
  - Хаос: случайные модификаторы HP/урона на заход; secretBonus 1.5% (кап 2% с базой 0.5%)
  - ExpeditionScene (выбор + заход, боёвка как в данже) + ArtifactScene (крафт/рерoll/распыл/экип)
  - SaveData v3 (riftProgress, мягкая миграция), 16 тестов экспедиций. Итого 68/68

## A3-fix pass (принят)
- [x] secret-аффиксы: веса 0→25 (weighted picker больше не возвращает только первый), тесты покрытия пула
- [x] secret chance: база 0.5%, жёсткий кап 2% (правило Разлома Хаоса: bonus добавляется, итог ≤ 2%)
- [x] оффлайн: offlineFullRate и offlineRate работают независимо (offlineEfficiency), offlineCap-аффикс расширяет кап, 4 комбо-теста
- [x] капы вероятностей: crit ≤ 75%, lucky merge ≤ 50%, rarityBonus clamp 0..1
- [x] sanitizeSave: валидация артефактов + очистка equippedIds (дубли/призраки/лимит)
- [x] усиленные тесты: редкости→аффиксы, миграция v1→v2, экип. бонусы. Итого 52/52
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
