import { describe, expect, it } from 'vitest';
import {
  CASE_COST_KEYS,
  MAX_ACTIVE_PETS,
  PET_SPECIES,
  Pet,
  openPetCase,
  petBonus,
  petFeedCost,
  petFromCapture,
  petTeamTotals,
  rollCaseRarity,
} from '../src/core/pets';
import { GameState } from '../src/core/gameState';

describe('pets core', () => {
  it('bonus scales with level and rarity', () => {
    const base: Pet = { uid: 'a', species: 'wolfpup', rarity: 'common', level: 1, name: 'W' };
    const b1 = petBonus(base);
    expect(b1.stat).toBe('dps');
    expect(b1.value).toBe(8);
    const leveled: Pet = { ...base, level: 5, rarity: 'epic' };
    const b2 = petBonus(leveled);
    expect(b2.value).toBeGreaterThan(b1.value * 2);
  });

  it('team totals sum actives', () => {
    const team: Pet[] = [
      { uid: '1', species: 'wolfpup', rarity: 'common', level: 1, name: '' },
      { uid: '2', species: 'drakeling', rarity: 'common', level: 1, name: '' },
    ];
    const t = petTeamTotals(team);
    expect(t.dps).toBe(8);
    expect(t.income).toBe(8);
  });

  it('case opening: valid species + rarity, deterministic roll', () => {
    const pet = openPetCase(seqRng());
    expect(PET_SPECIES.some((s) => s.id === pet.species)).toBe(true);
    expect(pet.level).toBe(1);
    // legendary на верхнем ролле
    const legend = openPetCase(() => 0.999);
    expect(legend.rarity).toBe('legendary');
    expect(rollCaseRarity(() => 0.01)).toBe('common');
  });

  it('petFromCapture keeps creature rarity and species', () => {
    const pet = petFromCapture('batling', 'legendary', () => 0.5);
    expect(pet.species).toBe('batling');
    expect(pet.rarity).toBe('legendary');
  });

  it('feed cost grows with level', () => {
    expect(petFeedCost(1)).toBe(2);
    expect(petFeedCost(5)).toBe(10);
  });
});

describe('pets + GameState', () => {
  it('active pet team boosts economy multiplicatively', () => {
    const s = new GameState();
    s.data.grid = [{ branch: 'sword', tier: 3 }];
    const baseDps = s.totalDps();
    s.data.pets = [{ uid: 'w', species: 'wolfpup', rarity: 'common', level: 1, name: '' }];
    // неактивен — не влияет
    expect(s.totalDps()).toBeCloseTo(baseDps);
    s.data.activePetIds = ['w'];
    expect(s.totalDps()).toBeCloseTo(baseDps * 1.08, 3);
  });

  it('petEfficiency secret affix amplifies pet bonuses', () => {
    const s = new GameState();
    s.data.grid = [{ branch: 'sword', tier: 3 }];
    s.data.pets = [{ uid: 'd', species: 'drakeling', rarity: 'common', level: 1, name: '' }];
    s.data.activePetIds = ['d'];
    s.data.artifacts = [
      { id: 'e', name: '', rarity: 'epic', createdAt: 0, affixes: [{ stat: 'petEfficiency', value: 50, secret: true }] },
    ];
    s.data.equippedIds = ['e'];
    const base = s.incomePerSec();
    s.data.artifacts = [];
    s.data.equippedIds = [];
    const without = s.incomePerSec();
    // с petEfficiency бонус питомца ×1.5 → доход выше
    expect(base).toBeGreaterThan(without);
  });

  it('openCase spends keys and adds pet; cap of active team enforced', () => {
    const s = new GameState();
    s.data.keys = CASE_COST_KEYS;
    const pet = s.openCase(() => 0.5)!;
    expect(pet).toBeTruthy();
    expect(s.data.keys).toBe(0);
    expect(s.openCase()).toBeNull();
    // команда: макс MAX_ACTIVE_PETS
    for (let i = 0; i < MAX_ACTIVE_PETS + 2; i++) {
      s.data.pets.push({ uid: `p${i}`, species: 'wolfpup', rarity: 'common', level: 1, name: '' });
      s.setActivePet(`p${i}`, true);
    }
    expect(s.data.activePetIds.length).toBe(MAX_ACTIVE_PETS);
  });

  it('feedPet spends food, levels up, caps at max', () => {
    const s = new GameState();
    s.data.pets = [{ uid: 'x', species: 'wolfpup', rarity: 'common', level: 1, name: '' }];
    s.data.petFood = 5;
    expect(s.feedPet('x')).toBe(true);
    expect(s.data.pets[0].level).toBe(2);
    expect(s.data.petFood).toBe(3);
    s.data.pets[0].level = 10;
    expect(s.feedPet('x')).toBe(false);
  });
});

function seqRng() {
  let n = 7;
  return () => ((n = (n * 16807 + 11) % 2147483647) / 2147483647);
}
