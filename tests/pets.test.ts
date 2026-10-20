import { describe, expect, it } from 'vitest';
import {
  CASE_COST_KEYS,
  MAX_ACTIVE_PETS,
  MAX_SKILL_STARS,
  PET_MOD_COUNT,
  PET_SKILLS,
  PET_SKILL_MIN_RARITY,
  PET_SPECIES,
  Pet,
  PetMod,
  genPetMods,
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
import { GameState } from '../src/core/gameState';

const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

/** питомец-заготовка: mods пустые → синтез при первом обращении (легаси-миграция) */
const mkPet = (species: Pet['species'], rarity: Pet['rarity'], level = 1): Pet => ({
  uid: `u_${species}_${rarity}_${level}_${Math.random()}`,
  species, rarity, level, name: '', mods: [],
});

describe('pet modifiers (A5.1)', () => {
  it('mod count by rarity: 2/2/3/4/5', () => {
    const counts: [Pet['rarity'], number][] = [
      ['common', 2], ['uncommon', 2], ['rare', 3], ['epic', 4], ['legendary', 5],
    ];
    for (const [rarity, n] of counts) {
      const mods = genPetMods('wolfpup', rarity, seq([0.5]));
      expect(mods.length).toBe(n);
      expect(PET_MOD_COUNT[rarity]).toBe(n);
    }
  });

  it('primary species stat always first, all stats distinct', () => {
    const mods = genPetMods('drakeling', 'legendary', seq([0.3, 0.7, 0.1, 0.9]));
    expect(mods[0].stat).toBe('income'); // первичка вида
    const stats = mods.map((m) => m.stat);
    expect(new Set(stats).size).toBe(stats.length); // без дублей
  });

  it('values scale with rarity mult and level', () => {
    const common = genPetMods('wolfpup', 'common', seq([0.5]))[0].value;
    const legendary = genPetMods('wolfpup', 'legendary', seq([0.5]))[0].value;
    expect(legendary).toBeGreaterThan(common);
    const pet = mkPet('wolfpup', 'common', 5);
    const leveled = petMods(pet).map((m) => m.value);
    const base = petMods({ ...pet, level: 1 }).map((m) => m.value);
    expect(leveled[0]).toBeCloseTo(base[0] * 1.8, 1); // 1 + 0.2*(5-1)
  });

  it('legacy pet without mods: deterministic synth from uid', () => {
    const a = mkPet('wolfpup', 'rare');
    const b: Pet = { ...a, uid: a.uid };
    const modsA = petMods(a);
    const modsB = petMods(b);
    expect(modsA).toEqual(modsB); // стабильный rng
    expect(modsA.length).toBe(PET_MOD_COUNT.rare);
    expect(modsA[0].stat).toBe('dps');
    void stableRng;
  });

  it('unique passive: only epic/legendary, star-scaled, capped stars', () => {
    const commonPet = mkPet('phoenix', 'common');
    expect(petSkillBonus(commonPet)).toBeNull();
    expect(PET_SKILL_MIN_RARITY).toEqual(['epic', 'legendary']);
    const epic = { ...mkPet('phoenix', 'epic'), skill: { id: 'rebirth', stars: 3 } };
    const bonus = petSkillBonus(epic)!;
    expect(bonus.stat).toBe('offlineRate');
    expect(bonus.value).toBeCloseTo(PET_SKILLS.phoenix.perStar * 3, 1);
    // звёзды клампятся 1..5
    const over = { ...epic, skill: { id: 'rebirth', stars: 99 } };
    expect(petSkillBonus(over)!.value).toBeCloseTo(PET_SKILLS.phoenix.perStar * MAX_SKILL_STARS, 1);
    // чужой id скилла не даёт бонуса
    const wrong = { ...epic, skill: { id: 'nope', stars: 3 } };
    expect(petSkillBonus(wrong)).toBeNull();
  });

  it('petEffects = mods + skill; team totals sum all', () => {
    const pet = {
      ...mkPet('wolfpup', 'epic'),
      mods: [{ stat: 'dps', value: 10 } as PetMod, { stat: 'tierJump', value: 5 } as PetMod],
      skill: { id: 'pack_leader', stars: 2 },
    };
    const eff = petEffects(pet);
    expect(eff.length).toBe(3); // 2 мода + скилл
    const t = petTeamTotals([pet]);
    expect(t.dps).toBe(10 + PET_SKILLS.wolfpup.perStar * 2);
    expect(t.tierJump).toBe(5);
  });

  it('case/capture pets get full mods and skills for top rarities', () => {
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

  it('feed cost grows', () => {
    expect(petFeedCost(1)).toBe(2);
    expect(petFeedCost(5)).toBe(10);
  });
});

describe('pets + GameState aggregates (A5.1)', () => {
  it('team boosts economy multiplicatively (mods, not legacy single stat)', () => {
    const s = new GameState();
    s.data.grid = [{ branch: 'sword', tier: 3 }];
    const baseDps = s.totalDps();
    const pet = { ...mkPet('wolfpup', 'common'), mods: [{ stat: 'dps', value: 20 } as PetMod] };
    s.data.pets = [pet];
    expect(s.totalDps()).toBeCloseTo(baseDps); // неактивен
    s.data.activePetIds = [pet.uid];
    expect(s.totalDps()).toBeCloseTo(baseDps * 1.2, 3);
  });

  it('petEfficiency secret affix amplifies pet bonuses', () => {
    const s = new GameState();
    s.data.grid = [{ branch: 'sword', tier: 3 }];
    const pet = { ...mkPet('drakeling', 'common'), mods: [{ stat: 'income', value: 20 } as PetMod] };
    s.data.pets = [pet];
    s.data.activePetIds = [pet.uid];
    s.data.artifacts = [
      { id: 'e', name: '', rarity: 'epic', createdAt: 0, affixes: [{ stat: 'petEfficiency', value: 50, secret: true }] },
    ];
    s.data.equippedIds = ['e'];
    const withAffix = s.incomePerSec();
    s.data.artifacts = [];
    s.data.equippedIds = [];
    expect(withAffix).toBeGreaterThan(s.incomePerSec());
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
    expect(s.forgeTierJumpChance()).toBe(0);
    expect(s.forgeExtraSpawnChance()).toBe(0); // без навыка luck2
    const pet = {
      ...mkPet('emberlion', 'legendary'),
      mods: [
        { stat: 'tierJump', value: 30 } as PetMod,
        { stat: 'extraSpawn', value: 20 } as PetMod,
        { stat: 'spawnDiscount', value: 90 } as PetMod, // заведомо выше капа
        { stat: 'ultraCritChance', value: 80 } as PetMod, // выше капа 50%
        { stat: 'ultraCritMult', value: 100 } as PetMod,
      ],
    };
    s.data.pets = [pet];
    s.data.activePetIds = [pet.uid];
    expect(s.forgeTierJumpChance()).toBe(0.3);
    expect(s.forgeExtraSpawnChance()).toBe(0.2);
    expect(s.forgeSpawnDiscount()).toBe(0.6); // кап 60%
    expect(s.ultraCritChance()).toBe(0.5); // кап 50%
    expect(s.ultraCritMult()).toBeCloseTo(10, 3); // 5 * (1+100%)
  });

  it('offlineRate from pets multiplies offline efficiency', () => {
    const s = new GameState();
    const pet = { ...mkPet('phoenix', 'common'), mods: [{ stat: 'offlineRate', value: 50 } as PetMod] };
    s.data.pets = [pet];
    s.data.activePetIds = [pet.uid];
    expect(s.offlineEfficiency()).toBeCloseTo(0.5 * 1.5, 5);
  });
});
