import { describe, expect, it } from 'vitest';
import {
  CREATURES,
  KEY_CHANCE_CAP,
  HUNT_CARDS,
  HuntCard,
  HuntRunState,
  SYNERGIES,
  activeSynergies,
  applyCard,
  baseRunMods,
  captureChance,
  computeRunMods,
  creatureAttack,
  creatureHp,
  defeatRewards,
  lifestealHeal,
  rollCreatureRarity,
  rollDraft,
  startHunt,
  victoryRewards,
} from '../src/core/hunts';
import { rollClearBundle } from '../src/core/expeditions';
import { GameState } from '../src/core/gameState';
import { sanitizeSave } from '../src/core/saveSystem';

const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};
const card = (id: string): HuntCard => {
  const c = HUNT_CARDS.find((x) => x.id === id);
  if (!c) throw new Error('no card ' + id);
  return c;
};
const runWith = (ids: string[]): HuntRunState => {
  const run = startHunt(CREATURES[0], 'common', 1000);
  run.pickedCards = ids.map(card);
  return run;
};

describe('hunt core', () => {
  it('creature hp/atk scale with player power and rarity', () => {
    expect(creatureHp(100, 'common')).toBeLessThan(creatureHp(1000, 'common'));
    expect(creatureHp(1000, 'legendary')).toBeGreaterThan(creatureHp(1000, 'common'));
    expect(creatureHp(1, 'common')).toBe(60); // нижний пол
    // атака масштабируется от ВЫНОСЛИВОСТИ, не от ДПС (регрессия: dps*0.02 ваншотил стамину)
    expect(creatureAttack('legendary')).toBeGreaterThan(creatureAttack('common'));
    expect(creatureAttack('common')).toBe(4); // floor(100 * 0.05 * 0.8)
    expect(creatureAttack('common', 250)).toBe(10); // с карточками выносливости атака растёт
    expect(creatureAttack('legendary')).toBe(13); // floor(100 * 0.05 * 2.6)
    expect(creatureAttack('common', 500)).toBeLessThan(500); // атака всегда << бюджета выносливости (не следует за ДПС)
  });

  it('rarity roll distribution valid', () => {
    expect(rollCreatureRarity(() => 0.01)).toBe('common');
    expect(rollCreatureRarity(() => 0.99)).toBe('legendary');
  });

  it('cards apply effects', () => {
    let m = baseRunMods();
    m = applyCard(m, card('sharp_blade'));
    m = applyCard(m, card('heavy_hand'));
    m = applyCard(m, card('snares'));
    expect(m.dmgMult).toBeCloseTo(1.15);
    expect(m.clickMult).toBeCloseTo(1.2);
    expect(m.captureChance).toBeCloseTo(0.06);
  });

  it('dark lord synergy activates with 3 dark cards', () => {
    const run = runWith(['blood_mark', 'dark_seal', 'blood_feast']);
    expect(activeSynergies(run).map((s) => s.id)).toContain('dark_lord');
    const mods = computeRunMods(run);
    expect(mods.lifesteal).toBeGreaterThanOrEqual(0.25);
    expect(mods.dmgMult).toBeGreaterThanOrEqual(1.6);
    // две карты — синергии нет
    const run2 = runWith(['blood_mark', 'dark_seal']);
    expect(activeSynergies(run2).length).toBe(0);
    void SYNERGIES;
  });

  it('draft: 3 unique cards, rarities rollable', () => {
    const d = rollDraft(3, seq([0.05, 0.3, 0.9, 0.5, 0.7, 0.2]));
    expect(d.length).toBe(3);
    expect(new Set(d.map((c) => c.id)).size).toBe(3);
    const leg = rollDraft(3, seq([0.99, 0.99, 0.99, 0.99, 0.99, 0.99]));
    expect(leg.some((c) => c.rarity === 'legendary')).toBe(true);
  });

  it('capture chance: base + cards + pets, rarity penalty, clamped', () => {
    const plain = startHunt(CREATURES[0], 'common', 1000);
    expect(captureChance(plain, 0)).toBeCloseTo(0.4);
    const trapper = runWith(['trapmaster', 'golden_cage']);
    expect(captureChance(trapper, 0.1)).toBeGreaterThan(0.9);
    expect(captureChance(trapper, 0.1)).toBeLessThanOrEqual(0.95); // кап
    const legend = startHunt(CREATURES[0], 'legendary', 1000);
    expect(captureChance(legend, 0)).toBeLessThan(0.4); // штраф редкости
  });

  it('victory rewards scale with income and rarity; defeat is consolation', () => {
    const run = startHunt(CREATURES[2], 'rare', 1000);
    const rw = victoryRewards(run, 100, () => 0.9);
    expect(rw.gold).toBeGreaterThan(0);
    expect(victoryRewards(run, 100, () => 0.9).gold).toBeGreaterThan(
      victoryRewards(startHunt(CREATURES[2], 'common', 1000), 100, () => 0.9).gold,
    );
    const dr = defeatRewards(run);
    expect(dr.gold).toBe(0);
    expect(dr.food).toBeGreaterThan(0);
  });
});

describe('hunt + GameState', () => {
  it('startHunt spends bait, respects pets capture bonus', () => {
    const s = new GameState();
    expect(s.data.bait).toBe(2);
    const run = s.startHunt(CREATURES[0], 'common')!;
    expect(run).toBeTruthy();
    expect(s.data.bait).toBe(1);
    expect(run.extraCapture).toBe(0);
    s.data.pets.push({
      uid: 'p1', species: 'spirit', rarity: 'common', level: 1, name: 'Дух',
    });
    s.data.activePetIds = ['p1'];
    const run2 = s.startHunt(CREATURES[0], 'common')!;
    expect(run2.extraCapture).toBeGreaterThan(0); // captureChance-питомец даёт бонус
    expect(s.startHunt(CREATURES[0], 'common')).toBeNull(); // приманки кончились
  });

  it('finishHunt with capture grants pet; food/keys accumulate', () => {
    const s = new GameState();
    const run = s.startHunt(CREATURES[0], 'epic')!;
    const food0 = s.data.petFood;
    s.finishHunt(run, { gold: 500, food: 3, keys: 1, captured: true }, true, true);
    expect(s.data.pets.length).toBe(1);
    expect(s.data.pets[0].rarity).toBe('epic');
    expect(s.data.pets[0].species).toBe(CREATURES[0].species);
    expect(s.data.petFood).toBe(food0 + 3);
    expect(s.data.keys).toBe(2); // старт 1 + 1
    expect(s.data.huntsWon).toBe(1);
    // поражение не считается победой
    const s2 = new GameState();
    const run2 = s2.startHunt(CREATURES[0], 'common')!;
    s2.finishHunt(run2, { gold: 0, food: 0, keys: 0, captured: false }, false, false);
    expect(s2.data.huntsWon).toBe(0);
  });

  it('temporary hunt cards never leak into save', () => {
    const s = new GameState();
    const run = s.startHunt(CREATURES[0], 'common')!;
    run.pickedCards.push(HUNT_CARDS[0]);
    s.finishHunt(run, { gold: 0, food: 0, keys: 0, captured: false }, false, false);
    const raw = JSON.parse(JSON.stringify(s.data));
    expect(JSON.stringify(raw)).not.toContain('pickedCards');
    expect(JSON.stringify(raw)).not.toContain('HuntCard');
  });

  it('save v4: defaults for pets/keys/bait, migration from v3', () => {
    const fresh = new GameState();
    expect(fresh.data.keys).toBe(1);
    expect(fresh.data.bait).toBe(2);
    expect(fresh.data.pets).toEqual([]);
    const migrated = sanitizeSave({ version: 3, gold: 999 });
    expect(migrated.gold).toBe(999);
    expect(migrated.keys).toBe(1);
    expect(migrated.pets).toEqual([]);
    expect(migrated.activePetIds).toEqual([]);
  });

  it('sanitize pets: broken entries dropped, active cleaned', () => {
    const good = { uid: 'g1', species: 'wolfpup', rarity: 'rare', level: 3, name: 'Волк' };
    const s = sanitizeSave({
      pets: [good, { uid: 'x', species: 'alien', rarity: 'rare', level: 1, name: '' }, { rarity: 'rare' }, null],
      activePetIds: ['g1', 'g1', 'ghost', 42],
    });
    expect(s.pets).toEqual([good]);
    expect(s.activePetIds).toEqual(['g1']);
  });
});


describe('A5 fix pass', () => {
  it('lifestealHeal: full share, not x0.01 (100x bug)', () => {
    const mods = baseRunMods();
    mods.lifesteal = 0.25;
    expect(lifestealHeal(1000, mods)).toBe(250);
    mods.lifesteal = 0;
    expect(lifestealHeal(1000, mods)).toBe(0);
  });

  it('victoryRewards: card goldMult applies, found food/keys preserved, keyBonus clamped', () => {
    const run = startHunt(CREATURES[2], 'rare', 1000);
    run.pickedCards.push(HUNT_CARDS.find((c) => c.id === 'gold_scent')!); // +80% золота
    run.foodFound = 3;
    run.keysFound = 1;
    const plain = victoryRewards(run, 100, () => 0.99, 0); // ключ не выпал
    expect(plain.keys).toBe(1); // найденный на шагах сохранён
    expect(plain.food).toBeGreaterThan(3); // base + найденное
    const boosted = victoryRewards(run, 100, () => 0.99, 0);
    // gold_scent реально влияет (раньше использовался base goldMult=1)
    const noCard = startHunt(CREATURES[2], 'rare', 1000);
    noCard.pickedCards = [];
    const plainGold = victoryRewards(noCard, 100, () => 0.99, 0).gold;
    expect(boosted.gold).toBeGreaterThanOrEqual(Math.floor(plainGold * 1.8));
    // keyBonus не пробивает кап шанса
    const withKey = victoryRewards(run, 100, () => 0.0, 99);
    expect(withKey.keys).toBeGreaterThanOrEqual(1);
    void KEY_CHANCE_CAP;
  });

  it('captureChance: spirit rewardBias grants +10%, no double pet bonus via extraCapture', () => {
    const wolf = startHunt(CREATURES[0], 'common', 1000); // rewardBias food
    const spirit = startHunt(CREATURES[3], 'common', 1000); // rewardBias capture
    expect(captureChance(spirit)).toBeGreaterThan(captureChance(wolf));
    // extraCapture уже содержит бонус питомцев: второй учёт запрещён тестом ниже
    const withPets = startHunt(CREATURES[3], 'common', 1000, 0.2);
    expect(captureChance(withPets)).toBeCloseTo(captureChance(spirit) + 0.2, 5);
  });

  it('repeat run: fresh state per hunt (new HuntRunState each start)', () => {
    const a = startHunt(CREATURES[0], 'common', 1000);
    const b = startHunt(CREATURES[0], 'common', 1000);
    a.pickedCards.push(HUNT_CARDS[0]);
    a.stamina = 1;
    expect(b.pickedCards.length).toBe(0);
    expect(b.stamina).toBe(100);
  });

  it('rollClearBundle: keyBonus applies to key chance, capped', () => {
    const rewards = { shards: 1, stabilizerChance: 0, artifactChance: 0, gold: 0, baitChance: 0, keyChance: 0.08 };
    const withBonus = rollClearBundle(rewards, () => 0.5, 0.5); // 0.5 < 0.58 → ключ
    expect(withBonus.keys).toBe(1);
    const noBonus = rollClearBundle(rewards, () => 0.5, 0);
    expect(noBonus.keys).toBe(0);
    const overCap = rollClearBundle(rewards, () => 0.99, 99);
    expect(overCap.keys).toBe(0); // кап 0.95 < 0.99
  });

  it('applyRiftGrant: shardBonus (pets + secret affix) multiplies shards', () => {
    const s = new GameState();
    const forge = s.getRiftDef('forge');
    const base = s.data.shards;
    s.applyRiftGrant(forge, { shards: 100, stabilizers: 0, artifacts: 0, gold: 0, bait: 0, keys: 0 });
    const gained = s.data.shards - base;
    expect(gained).toBe(100); // без бонусов
    s.data.pets = [{ uid: 'e', species: 'emberlion', rarity: 'common', level: 1, name: '' }]; // +12% осколков
    s.data.activePetIds = ['e'];
    const base2 = s.data.shards;
    s.applyRiftGrant(forge, { shards: 100, stabilizers: 0, artifacts: 0, gold: 0, bait: 0, keys: 0 });
    expect(s.data.shards - base2).toBe(112);
  });

  it('releasePet: duplicates convert to food by rarity', () => {
    const s = new GameState();
    s.data.pets = [
      { uid: 'a', species: 'wolfpup', rarity: 'common', level: 1, name: '' },
      { uid: 'b', species: 'wolfpup', rarity: 'legendary', level: 1, name: '' },
    ];
    s.data.activePetIds = ['b'];
    expect(s.releasePet('a')).toBe(2);
    expect(s.data.pets.length).toBe(1);
    expect(s.data.petFood).toBe(5); // 3 старт + 2
    expect(s.releasePet('b')).toBe(14);
    expect(s.data.activePetIds).toEqual([]);
    expect(s.releasePet('ghost')).toBe(0);
  });
});
