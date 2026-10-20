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
- [x] A5 Охота (roguelite) + питомцы
  - core/hunts.ts: 4 существа (вид/местность/rewardBias) × случайная редкость (определяет ЦЕНУ наград), сложность = f(ДПС игрока) — разделены
  - Roguelite-забег: 3 шага выслеживания с драфтом 1-из-3, элитная стычка (+1 карта), финальный бой (клик + авто-ДПС, выносливость)
  - 19 карточек 5 редкостей (серый→золотой), синергия «Тёмный лорд» (3 dark-карты: ×1.6 урона + вампиризм 25%), модификаторы видны в HUD забега
  - Поражение/отступление = утешительные награды; временные карты НЕ сохраняются (HuntRunState вне сейва)
  - core/pets.ts: 8 видов × 5 редкостей, пассивы (dps/income/click/dungeonGold/shardBonus/keyChance/capture), команда до 3, корм → уровень (макс 10)
  - Кейсы за 3 ключа (редкость своя); поимка даёт питомца редкости существа; petEfficiency (secret affix) усиливает команду
  - Источники: приманки/ключи из разломов (roomRewards), приманка 20% с босса данжа; стартовые 2 приманки/1 ключ
  - SaveData v4 (pets/activePetIds/keys/bait/petFood/huntsWon) + валидация
  - HuntScene + PetScene, кнопки в Forge (Разломы/Артефакты/Охота/Данж/Питомцы) + HUD ресурсы
  - 21 новый тест. Итого 94/94; tsc/lint/build зелёные
- [ ] A6 Адаптация престижа/навыков, ранний прогресс
- [ ] A7 Баланс
- [ ] B Визуал (pixellab анимации, image-gen ассеты)
- [ ] Ручной осмотр в браузере (пользователь): баланс, ощущения
- [ ] Геймплей: таверна героев? больше визуальной награды за слияние (частицы)
- [ ] Ежедневная награда, достижения
- [ ] Звуки (WebAudio-генерация или ассеты)

## A5-fix pass (принят)
- [x] элита зацикливала забег (eliteDone), оба таймера чистятся, stale-callback guard (runRef)
- [x] атака существа масштабируется от выносливости (не ДПС — ваншотила на late game)
- [x] вампиризм ×100 исправлен (lifestealHeal в core), карточки выносливости реально применяются (max+heal)
- [x] victoryRewards: карточки влияют на золото, найденное на шагах сохраняется, keyBonus с клампом 0.95
- [x] huntsWon только за победу; Хранитель святилища +10% поимки; двойной бонус питомцев убран
- [x] keyChance питомцев+аффиксов применяется к реальным шансам ключей (рифты/данж/охота), капы
- [x] shardBonus реально работает в applyRiftGrant (питомцы + secret-аффикс раздельно учтены в одном множителе)
- [x] pickCard уничтожает только объекты драфта (setData('draft')), дубликаты питомцев → Отпустить (корм)
- [x] +7 регрессионных тестов (итого 101/101), коммит fix(A5)

## A5.1 patch (принят)
- [x] Ранги охоты I-V: выбор игроком, разблокировка по huntsWon+душам; riskMult/rewardMult/rarityBoost/captureBonus
- [x] Модификаторы питомцев 2/2/3/4/5 по редкости: первичка вида + вторичный пул; миграция легаси через stableRng(uid)
- [x] Новые модификаторы кузницы: tierJump (спавн тиром выше, кап 50%), extraSpawn (доп. генерация, с навыком, кап 75%), spawnDiscount (единый forgeSpawnDiscount, кап 60%)
- [x] Ультра-крит: ultraCritChance (кап 50%) × ultraCritMult (база 5) поверх обычного крита — данж и охота
- [x] Уникальные пассивы epic/legendary: 8 скиллов по видам, звёздная градация 1-5 (stars=1 до A5.2), иконка-заглушка iconKey
- [x] PetScene: показ всех модов + скилла; HuntScene: селектор рангов, ранг в заголовке забега
- [x] SaveData: huntRank + Pet.mods/skill (миграция мягкая, save v4 совместим)
- [x] +10 тестов (итого 111/111); tsc/lint/build зелёные
- [x] A5.1-fix: selectHuntRank валидирует исходный ID (int, 0..4) ДО клампа — 99/2.5/-1/NaN отклоняются даже при открытом V
- [x] A5.1-fix: ensureHuntRankAvailable() — понижение залепленного закрытого ранга при откоте прогресса (будущие траты душ), startHunt использует согласованный ранг
- [x] A5.1-fix: HuntScene показывает требования закрытых рангов (победы · души, замок)
- [x] A5.1-fix: sanitizePets — whitelist VALID_PET_STATS, value > 0 и <= PET_MOD_VALUE_CAP, пересинтез при несоответствии количества редкости, skill-ID нормализуется к виду, звёзды 1..5 int, скилл стрипается у low-rarity; легаси-миграция сохранена
- [x] +7 регрессионных тестов (итого 118/118), коммит A5.1-fix
- [ ] A5.2 (запланировано): пазлы → звёзды скиллов, уровни питомцев до 100, перековка за эссенции

## Запланировано (итерации 2+)
- [ ] Балансировка и полировка UI
- [ ] Звуки/музыка
- [ ] Достижения, ежедневные награды
- [ ] Публикация драфта на Яндекс.Игры

## Блокеры
- Нет
