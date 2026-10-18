import Phaser from 'phaser';
import { MAX_ACTIVE_PETS, Pet, petBonus, petFeedCost, getSpecies, CASE_COST_KEYS } from '../core/pets';
import { GameState } from '../core/gameState';
import { RARITY_INFO } from '../core/artifacts';

/** Коллекция питомцев: команда (до 3), прокачка кормом, кейсы за ключи. */
export class PetScene extends Phaser.Scene {
  private state!: GameState;
  private scroll = 0;

  constructor() {
    super('Pet');
  }

  create(): void {
    this.state = this.registry.get('state') as GameState;
    this.render();
  }

  private render(): void {
    this.children.removeAll(true);
    const d = this.state.data;
    const maxScroll = Math.max(0, d.pets.length - 6);
    this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));

    this.add.rectangle(360, 640, 720, 1280, 0x14100c).setAlpha(0.98).setInteractive();
    this.add.text(360, 50, '🐾 Питомцы', { fontSize: '40px', color: '#ffd24a' }).setOrigin(0.5);
    this.add
      .text(360, 105,
        `🗝 ${d.keys}   🍖 ${d.petFood}   Команда: ${d.activePetIds.length}/${MAX_ACTIVE_PETS}   Всего: ${d.pets.length}`,
        { fontSize: '22px', color: '#9adcff' })
      .setOrigin(0.5);

    // Кейс
    const caseBtn = this.add
      .text(360, 165, `📦 Открыть кейс (${CASE_COST_KEYS} 🗝)`, {
        fontSize: '26px', color: '#ffe6a0', backgroundColor: '#3a2c1f', padding: { x: 20, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    caseBtn.on('pointerdown', () => {
      const pet = this.state.openCase();
      this.toast(pet ? `🎉 ${getSpecies(pet.species).icon} ${pet.name} [${RARITY_INFO[pet.rarity].ru}]` : 'Нужно 3 ключа');
      this.state.save();
      this.render();
    });

    if (d.pets.length === 0) {
      this.add.text(360, 640, 'Питомцев нет.\nОткрывайте кейсы за ключи или побеждайте на Охоте.', {
        fontSize: '24px', color: '#b8b0d8', align: 'center',
      }).setOrigin(0.5);
    }

    const list = d.pets.slice(this.scroll, this.scroll + 6);
    list.forEach((pet, i) => this.renderPetRow(pet, 300 + i * 150));

    if (d.pets.length > 6) {
      const up = this.add.text(250, 1155, '▲', { fontSize: '30px', color: '#ffd24a' })
        .setInteractive({ useHandCursor: true });
      const down = this.add.text(470, 1155, '▼', { fontSize: '30px', color: '#ffd24a' })
        .setInteractive({ useHandCursor: true });
      up.on('pointerdown', () => { this.scroll = Math.max(0, this.scroll - 6); this.render(); });
      down.on('pointerdown', () => { this.scroll = Math.min(maxScroll, this.scroll + 6); this.render(); });
    }

    const close = this.add
      .text(360, 1235, '← Вернуться', { fontSize: '28px', color: '#ffe6a0' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => {
      this.state.save();
      this.scene.stop();
    });
  }

  private renderPetRow(pet: Pet, y: number): void {
    const d = this.state.data;
    const active = d.activePetIds.includes(pet.uid);
    const color = RARITY_INFO[pet.rarity].color;
    this.add.rectangle(360, y, 640, 130, 0x1c2018).setStrokeStyle(active ? 3 : 1, active ? 0xffd24a : color);
    const spec = getSpecies(pet.species);
    const bonus = petBonus(pet);
    const statRu: Record<string, string> = {
      income: 'доход', dps: 'ДПС', click: 'клик', dungeonGold: 'золото данжа',
      shardBonus: 'осколки', keyChance: 'шанс ключа', captureChance: 'шанс поимки',
    };
    this.add.text(70, y - 45,
      `${spec.icon} ${pet.name} [${RARITY_INFO[pet.rarity].ru}] Ур.${pet.level}${active ? ' ✅' : ''}`,
      { fontSize: '21px', color: '#' + color.toString(16).padStart(6, '0') });
    this.add.text(70, y - 10, `Пассив: +${bonus.value}% ${statRu[bonus.stat] ?? bonus.stat}`,
      { fontSize: '17px', color: '#c8d8b8' });

    const actBtn = this.add.text(70, y + 35, active ? 'Убрать' : 'В команду', {
      fontSize: '16px', color: '#8aff5a', backgroundColor: '#243020', padding: { x: 8, y: 4 },
    }).setInteractive({ useHandCursor: true });
    actBtn.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      ptr.event.stopPropagation();
      this.state.setActivePet(pet.uid, !active);
      this.state.save();
      this.render();
    });

    const feedCost = petFeedCost(pet.level);
    const feedBtn = this.add.text(230, y + 35, `🍖 Кормить (${feedCost})`, {
      fontSize: '16px', color: '#ffd24a', backgroundColor: '#302a1c', padding: { x: 8, y: 4 },
    }).setInteractive({ useHandCursor: true });
    feedBtn.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      ptr.event.stopPropagation();
      this.toast(this.state.feedPet(pet.uid) ? 'Питомец подрос!' : 'Не хватает корма / макс. уровень');
      this.state.save();
      this.render();
    });

    const releaseBtn = this.add.text(410, y + 35, 'Отпустить', {
      fontSize: '16px', color: '#ffb0a0', backgroundColor: '#302020', padding: { x: 8, y: 4 },
    }).setInteractive({ useHandCursor: true });
    releaseBtn.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      ptr.event.stopPropagation();
      const gained = this.state.releasePet(pet.uid);
      this.toast(gained > 0 ? `Отпущен: +${gained} 🍗` : 'Питомец не найден');
      this.state.save();
      this.render();
    });
  }

  private toast(text: string): void {
    const t = this.add
      .text(360, 230, text, {
        fontSize: '22px', color: '#ffe6a0', backgroundColor: '#000000aa', padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5).setDepth(100);
    this.tweens.add({ targets: t, alpha: 0, duration: 1500, onComplete: () => t.destroy() });
  }
}
