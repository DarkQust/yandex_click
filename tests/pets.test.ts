import { describe, expect, it } from 'vitest';
import {
  CASE_COST_KEYS,
  MAX_ACTIVE_PETS,
  MAX_SKILL_STARS,
  PET_MOD_COUNT,
  PET_RARITY_MULT,
  PET_SKILLS,
  PET_SKILL_MIN_RARITY,
  PET_SPECIES,
  PET_STAT_BASE,
  Pet,
  PetMod,
  PetStat,
  genPetMods,
  innateBonus,
  openPetCase,
  petEffects,
  petFeedCost,
  petFromCapture,
  petMods,
  petSkillBonus,
  petTeamTotals,
  rollCaseRarity,
  stableRng,
} from '../src/core/pets';
import { CRIT_CHANCE_CAP, CRIT_BASE_MULT } from '../src/core/config';
import { GameState } from '../src/core/gameState';
import { sanitizeSave } from '../src/core/saveSystem';

const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const mkPet = (species: Pet['species'], rarity: Pet['rarity'], level = 1): Pet => ({
  uid: `u_${species}_${rarity}_${level}_${Math.random()}`,
  species, rarity, level, name: '', mods: [],
});

describe('pet mods generation (v5)', () => {
  it('slot count by rarity: 2/2/3/4/5', () => {
    const counts: [Pet['rarity'], number][] = [
      ['common', 2], ['uncommon', 2], ['rare', 3], ['epic', 4], ['legendary', 5],
    ];
    for (const [rarity, n] of counts) {
      expect(genPetMods(rarity, seq([0.5])).length).toBe(n);
      expect(PET_MOD_COUNT[rarity]).toBe(n);
    }
  });

  it('repeated stats are allowed; no primary-stat requirement, no uniqueness', () => {
    // rng 0 → всегда первый стат пула: 5 слотов легендарки = 5 одинаковых статов
    const five = genPetMods('legendary', seq([0.0]));
    expect(five.length).toBe(5);
    const stats = new Set(five.map((m) => m.stat));
    expect(stats.size).toBe(1); // повторы разрешены
    // вид НЕ навязывает первичный стат — генератор вообще не принимает вид:
    // в пуле есть captureChance и криты
    const all: PetStat[] = [];
    for (let n = 0, i = 0; i < 500; i++) {
      const r = ((n = (n * 16807 + 11) % 2147483647) / 2147483647);
      all.push(...genPetMods('legendary', () => r).map((m) => m.stat));
    }
    expect(all).toContain('captureChance');
    expect(all).toContain('critChance');
    expect(all).toContain('critMult');
  });

  it('values come from PET_STAT_BASE x rarity mult, not species baseBonus', () => {
    // fixed rng → value = base * mult * (0.6 + 0.8*rng)
    const one = genPetMods('common', seq([0.0]))[0];
    const poolFirst = (Object.keys(PET_STAT_BASE) as PetStat[])[0];
    expect(one.stat).toBe(poolFirst);
    expect(one.value).toBeCloseTo(PET_STAT_BASE[poolFirst] * PET_RARITY_MULT.common * 0.6, 1);
    // легендарка ×3 к тому же стату
    const leg = genPetMods('legendary', seq([0.0]))[0];
    expect(leg.value).toBeCloseTo(PET_STAT_BASE[poolFirst] * PET_RARITY_MULT.legendary * 0.6, 0);
  });
});

describe('innate species bonus (layer 1)', () => {
  it('guaranteed for every pet, scales with rarity and level, independent of mods', () => {
    const pet = mkPet('wolfpup', 'common');
    pet.mods = [{ stat: 'income', value: 99 } as PetMod];
    const innate = innateBonus(pet);
    expect(innate.stat).toBe('dps'); // специализация вида
    expect(innate.value).toBe(8); // 8 * 1 * 1
    // независим от модов: уровень 5 легендарки → 8*3*1.8
    const leveled = { ...pet, rarity: 'legendary' as const, level: 5, mods: [] };
    expect(innateBonus(leveled).value).toBeCloseTo(8 * 3 * 1.8, 1);
  });

  it('petEffects = innate + mods + skill (three layers)', () => {
    const pet = {
      ...mkPet('wolfpup', 'epic'),
      mods: [{ stat: 'click', value: 10 } as PetMod, { stat: 'click', value: 5 } as PetMod,
        { stat: 'critChance', value: 4 } as PetMod, { stat: 'critMult', value: 20 } as PetMod],
      skill: { id: 'pack_leader', stars: 2 },
    };
    const eff = petEffects(pet);
    expect(eff.length).toBe(6); // 1 врождённый + 4 мода + 1 скилл
    expect(eff[0].stat).toBe('dps'); // слой 1 — специализация
    const t = petTeamTotals([pet]);
    expect(t.click).toBe(15); // повторы суммируются
    expect(t.critChance).toBe(4);
    expect(t.critMult).toBe(20);
    expect(t.dps).toBe(8 * PET_RARITY_MULT.epic + PET_SKILLS.wolfpup.perStar * 2);
  });
});

describe('crit mods affect real damage via GameState aggregates', () => {
  it('multiple crit mods: chance capped, mult multiplies, ultra unaffected', () => {
    const s = new GameState();
    s.data.grid = [{ branch: 'sword', tier: 3 }];
    const baseChance = s.totalCritChance();
    const baseMult = s.totalCritMult();
    const pet = {
      ...mkPet('golem', 'legendary'),
      mods: [
        { stat: 'critChance', value: 40 } as PetMod,
        { stat: 'critChance', value: 80 } as PetMod, // повтор → сумма 120%
        { stat: 'critMult', value: 100 } as PetMod,
        { stat: 'critMult', value: 50 } as PetMod,
      ],
    };
    s.data.pets = [pet];
    s.data.activePetIds = [pet.uid];
    expect(s.totalCritChance()).toBeCloseTo(Math.min(CRIT_CHANCE_CAP, baseChance + 1.2), 5); // кап 75%
    expect(s.totalCritMult()).toBeCloseTo(CRIT_BASE_MULT * (1 + 1.5 + (baseMult / CRIT_BASE_MULT - 1)), 3);
    // фактический урон: крит бьёт по totalCritMult — множитель вырос
    expect(s.totalCritMult()).toBeGreaterThan(baseMult);
    // ультра-крит от крит-модов не зависит
    expect(s.ultraCritChance()).toBe(0);
  });
});

describe('unique passive (layer 3)', () => {
  it('only epic/legendary, star-scaled, capped stars', () => {
    expect(petSkillBonus(mkPet('phoenix', 'common'))).toBeNull();
    expect(PET_SKILL_MIN_RARITY).toEqual(['epic', 'legendary']);
    const epic = { ...mkPet('phoenix', 'epic'), skill: { id: 'rebirth', stars: 3 } };
    expect(petSkillBonus(epic)!.stat).toBe('offlineRate');
    expect(petSkillBonus(epic)!.value).toBeCloseTo(PET_SKILLS.phoenix.perStar * 3, 1);
    const over = { ...epic, skill: { id: 'rebirth', stars: 99 } };
    expect(petSkillBonus(over)!.value).toBeCloseTo(PET_SKILLS.phoenix.perStar * MAX_SKILL_STARS, 1);
  });
});

describe('case/capture pets', () => {
  it('full mods by rarity; skill for top rarities', () => {
    const legend = openPetCase(() => 0.999);
    expect(legend.rarity).toBe('legendary');
    expect(legend.mods.length).toBe(5);
    expect(legend.skill!.id).toBe(PET_SKILLS[legend.species].id);
    const captured = petFromCapture('spirit', 'common', () => 0.5);
    expect(captured.mods.length).toBe(2);
    expect(captured.skill).toBeUndefined();
    expect(rollCaseRarity(() => 0.01)).toBe('common');
    void PET_SPECIES;
  });

  it('legacy pet without mods: deterministic synth via stableRng(uid)', () => {
    const a = mkPet('wolfpup', 'rare');
    const b: Pet = { ...a };
    expect(petMods(a)).toEqual(petMods(b));
    expect(petMods(a).length).toBe(3);
    void stableRng;
  });

  it('feed cost grows', () => {
    expect(petFeedCost(1)).toBe(2);
    expect(petFeedCost(5)).toBe(10);
  });
});

describe('GameState integration (v5)', () => {
  it('team boosts economy multiplicatively (innate + mods)', () => {
    const s = new GameState();
    s.data.grid = [{ branch: 'sword', tier: 3 }];
    const baseDps = s.totalDps();
    const pet = { ...mkPet('wolfpup', 'common'), mods: [{ stat: 'dps', value: 20 } as PetMod] };
    s.data.pets = [pet];
    expect(s.totalDps()).toBeCloseTo(baseDps); // неактивен
    s.data.activePetIds = [pet.uid];
    // врождённый 8% + мод 20% = ×1.28
    expect(s.totalDps()).toBeCloseTo(baseDps * 1.28, 3);
  });

  it('openCase spends keys; active team capped', () => {
    const s = new GameState();
    s.data.keys = CASE_COST_KEYS;
    expect(s.openCase(() => 0.5)).toBeTruthy();
    expect(s.data.keys).toBe(0);
    expect(s.openCase()).toBeNull();
    for (let i = 0; i < MAX_ACTIVE_PETS + 2; i++) {
      const p = mkPet('wolfpup', 'common');
      s.data.pets.push(p);
      s.setActivePet(p.uid, true);
    }
    expect(s.data.activePetIds.length).toBe(MAX_ACTIVE_PETS);
  });

  it('feedPet levels up, caps at max', () => {
    const s = new GameState();
    const p = mkPet('wolfpup', 'common');
    s.data.pets = [p];
    s.data.petFood = 5;
    expect(s.feedPet(p.uid)).toBe(true);
    expect(s.data.pets[0].level).toBe(2);
    (s.data.pets[0] as Pet).level = 10;
    expect(s.feedPet(p.uid)).toBe(false);
  });

  it('forge bonuses: tierJump/extraSpawn/spawnDiscount from pets, clamped', () => {
    const s = new GameState();
    const pet = {
      ...mkPet('emberlion', 'legendary'),
      mods: [
        { stat: 'tierJump', value: 30 } as PetMod,
        { stat: 'extraSpawn', value: 20 } as PetMod,
        { stat: 'spawnDiscount', value: 90 } as PetMod,
        { stat: 'ultraCritChance', value: 80 } as PetMod,
        { stat: 'ultraCritMult', value: 100 } as PetMod,
      ],
    };
    s.data.pets = [pet];
    s.data.activePetIds = [pet.uid];
    expect(s.forgeTierJumpChance()).toBe(0.3);
    expect(s.forgeExtraSpawnChance()).toBe(0.2);
    expect(s.forgeSpawnDiscount()).toBe(0.6);
    expect(s.ultraCritChance()).toBe(0.5);
    expect(s.ultraCritMult()).toBeCloseTo(10, 3);
  });

  it('offlineRate from pets multiplies offline efficiency', () => {
    const s = new GameState();
    const pet = { ...mkPet('phoenix', 'common'), mods: [{ stat: 'offlineRate', value: 50 } as PetMod] };
    s.data.pets = [pet];
    s.data.activePetIds = [pet.uid];
    expect(s.offlineEfficiency()).toBeCloseTo(0.5 * 1.5, 5);
  });
});

describe('v4 -> v5 migration', () => {
  it('v4 save: mods resynthesized once with NEW generator, everything else preserved', () => {
    const v4Pet = {
      uid: 'oldpet', species: 'drakeling', rarity: 'rare', level: 4, name: 'Старик',
      mods: [
        { stat: 'income', value: 13.5 }, // v4-генератор: первичка вида
        { stat: 'dps', value: 10 },
        { stat: 'click', value: 12 },
      ],
      skill: { id: 'hoard', stars: 2 }, // у rare скилла не бывает — санитизируется
    };
    const s = sanitizeSave({
      version: 4,
      gold: 4321,
      pets: [v4Pet],
      activePetIds: ['oldpet'],
      huntsWon: 12,
      souls: 2,
      maxUnlockedHuntRank: 2,
      huntRank: 2,
    });
    const pet = s.pets[0];
    // вид/редкость/уровень/имя/команда сохранены
    expect(pet.species).toBe('drakeling');
    expect(pet.rarity).toBe('rare');
    expect(pet.level).toBe(4);
    expect(pet.name).toBe('Старик');
    expect(s.activePetIds).toEqual(['oldpet']);
    // игрок не тронут
    expect(s.gold).toBe(4321);
    expect(s.huntsWon).toBe(12);
    expect(s.maxUnlockedHuntRank).toBe(2); // постоянная разблокировка рангов цела
    expect(s.huntRank).toBe(2);
    // моды пересозданы v5-генератором: детерминированно, 3 слота rare
    expect(pet.mods.length).toBe(3);
    const fresh = genPetMods('rare', stableRng('oldpet'));
    expect(pet.mods).toEqual(fresh);
    // скилл у rare удалён
    expect(pet.skill).toBeUndefined();
  });

  it('v5 save with repeated stats: kept as-is, no resynth on load', () => {
    const mods = [
      { stat: 'dps', value: 12.5 },
      { stat: 'dps', value: 3.1 }, // повтор — валиден в v5
    ];
    const s1 = sanitizeSave({
      version: 5,
      pets: [{ uid: 'dupe', species: 'wolfpup', rarity: 'common', level: 1, name: '', mods }],
    });
    expect(s1.pets[0].mods).toEqual(mods); // сохранены как есть
    // повторная загрузка того же сейва — снова без изменений
    const s2 = sanitizeSave({
      version: 5,
      pets: [{ uid: 'dupe', species: 'wolfpup', rarity: 'common', level: 1, name: '', mods }],
    });
    expect(s2.pets[0].mods).toEqual(mods);
  });

  it('v5 invalid mod still forces full deterministic resynth', () => {
    const s = sanitizeSave({
      version: 5,
      pets: [{
        uid: 'bad5', species: 'wolfpup', rarity: 'common', level: 1, name: '',
        mods: [{ stat: 'dps', value: 10 }, { stat: 'hacked', value: 5 }],
      }],
    });
    const mods = s.pets[0].mods;
    expect(mods.length).toBe(2);
    expect(mods).toEqual(genPetMods('common', stableRng('bad5')));
    expect(mods).not.toContainEqual({ stat: 'dps', value: 10 }); // выживший не сохранён
  });

  it('v5 wrong count forces resynth even if all valid', () => {
    const s = sanitizeSave({
      version: 5,
      pets: [{
        uid: 'cnt5', species: 'wolfpup', rarity: 'epic', level: 1, name: '',
        mods: [{ stat: 'dps', value: 10 }, { stat: 'click', value: 10 }], // 2 вместо 4
      }],
    });
    expect(s.pets[0].mods.length).toBe(4);
    expect(s.pets[0].mods).toEqual(genPetMods('epic', stableRng('cnt5')));
  });
});

describe('A5.1-fix4: restored checks (v5 saves)', () => {
  // --- 1. petEfficiency усиливает ВСЕ эффекты активных питомцев, включая врождённый бонус ---
  it('petEfficiency secret affix amplifies innate bonus and mods together', () => {
    const s = new GameState();
    s.data.grid = [{ branch: 'sword', tier: 3 }];
    // база БЕЗ питомца: innate не должен учитываться дважды
    const bareDps = s.totalDps();
    const bareIncome = s.incomePerSec();

    const pet = {
      ...mkPet('wolfpup', 'common'), // врождённый: dps +8%
      mods: [{ stat: 'income', value: 20 } as PetMod], // мод: доход +20%
    };
    s.data.pets = [pet];
    s.data.activePetIds = [pet.uid];
    // без petEfficiency: innate 8% → ДПС ×1.08, мод 20% → доход ×1.2
    expect(s.totalDps()).toBeCloseTo(bareDps * 1.08, 3);
    expect(s.incomePerSec()).toBeCloseTo(bareIncome * 1.2, 3);

    // экипируем артефакт с secret-аффиксом petEfficiency +50%:
    // innate 8×1.5=12% → ДПС ×1.12; мод 20×1.5=30% → доход ×1.3
    s.data.artifacts = [
      { id: 'pe', name: '', rarity: 'epic', createdAt: 0,
        affixes: [{ stat: 'petEfficiency', value: 50, secret: true }] },
    ];
    s.data.equippedIds = ['pe'];
    expect(s.totalDps()).toBeCloseTo(bareDps * 1.12, 3);
    expect(s.incomePerSec()).toBeCloseTo(bareIncome * 1.3, 3);

    // сняли артефакт — эффекты вернулись к ×1.08 / ×1.2
    s.data.artifacts = [];
    s.data.equippedIds = [];
    expect(s.totalDps()).toBeCloseTo(bareDps * 1.08, 3);
    expect(s.incomePerSec()).toBeCloseTo(bareIncome * 1.2, 3);
  });

  // --- 2. Валидация модов: неизвестный стат / отрицательное / сверхкаповое значение ---
  it('v5 save: unknown stat rejected → full resynth', () => {
    const s = sanitizeSave({
      version: 5,
      pets: [{ uid: 'u1', species: 'wolfpup', rarity: 'common', level: 1, name: '',
        mods: [{ stat: 'hacked_stat', value: 50 }, { stat: 'dps', value: 10 }] }],
    });
    expect(s.pets[0].mods).toEqual(genPetMods('common', stableRng('u1'))); // пересинтез
    expect(s.pets[0].mods).not.toContainEqual({ stat: 'dps', value: 10 });
  });

  it('v5 save: negative value rejected → full resynth', () => {
    const s = sanitizeSave({
      version: 5,
      pets: [{ uid: 'u2', species: 'wolfpup', rarity: 'common', level: 1, name: '',
        mods: [{ stat: 'dps', value: -15 }, { stat: 'income', value: 10 }] }],
    });
    expect(s.pets[0].mods).toEqual(genPetMods('common', stableRng('u2')));
    expect(s.pets[0].mods.every((m) => m.value > 0)).toBe(true);
  });

  it('v5 save: over-cap value rejected → full resynth', () => {
    const s = sanitizeSave({
      version: 5,
      pets: [{ uid: 'u3', species: 'wolfpup', rarity: 'common', level: 1, name: '',
        mods: [{ stat: 'dps', value: 9999999 }, { stat: 'income', value: 10 }] }],
    });
    expect(s.pets[0].mods).toEqual(genPetMods('common', stableRng('u3')));
    expect(s.pets[0].mods.every((m) => m.value <= 10000)).toBe(true);
  });

  // --- 3. Валидация уникальных пассивов в сейвах v5 ---
  it('v5 save: skill id normalized, NaN/capped stars, valid stars kept, low-rarity stripped', () => {
    const s = sanitizeSave({
      version: 5,
      pets: [
        // легендарка: чужой ID → нормализован к виду, звёзды сброшены на 1
        { uid: 's1', species: 'phoenix', rarity: 'legendary', level: 1, name: '', mods: [],
          skill: { id: 'wrong_skill', stars: 3 } },
        // легендарка: верный ID, звёзды NaN → 1
        { uid: 's2', species: 'wolfpup', rarity: 'legendary', level: 1, name: '', mods: [],
          skill: { id: 'pack_leader', stars: Number.NaN } },
        // легендарка: верный ID, завышенные звёзды 99 → кап 5
        { uid: 's3', species: 'drakeling', rarity: 'legendary', level: 1, name: '', mods: [],
          skill: { id: 'hoard', stars: 99 } },
        // эпик: верный ID, валидные 3 звезды → сохранены
        { uid: 's4', species: 'golem', rarity: 'epic', level: 1, name: '', mods: [],
          skill: { id: 'living_anvil', stars: 3 } },
        // common: подложенный пассив → удалён
        { uid: 's5', species: 'spirit', rarity: 'common', level: 1, name: '', mods: [],
          skill: { id: 'radiance', stars: 5 } },
      ],
    });
    expect(s.pets[0].skill).toEqual({ id: 'rebirth', stars: 1 });
    expect(s.pets[1].skill).toEqual({ id: 'pack_leader', stars: 1 });
    expect(s.pets[2].skill).toEqual({ id: 'hoard', stars: 5 });
    expect(s.pets[3].skill).toEqual({ id: 'living_anvil', stars: 3 });
    expect(s.pets[4].skill).toBeUndefined();
    // бонус считается от нормализованных звёзд (не от 99)
    expect(petSkillBonus(s.pets[2] as Pet)!.value).toBeCloseTo(PET_SKILLS.drakeling.perStar * 5, 1);
  });
});
