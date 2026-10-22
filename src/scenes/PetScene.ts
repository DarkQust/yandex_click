import Phaser from 'phaser';
import {
  MAX_ACTIVE_PETS,
  Pet,
  innateBonus,
  petFeedCost,
  petMods,
  getSpecies,
  CASE_COST_KEYS,
  PET_MOD_COUNT,
  PET_SKILLS,
} from '../core/pets';
import { GameState } from '../core/gameState';
import { RARITY_INFO } from '../core/artifacts';

const STAT_RU: Record<string, string> = {
  income: 'доход', dps: 'ДПС', click: 'клик', dungeonGold: 'золото данжа',
  shardBonus: 'осколки', keyChance: 'шанс ключа', captureChance: 'шанс поимки',
  tierJump: 'тир-прыжок', extraSpawn: 'доп. ковка', spawnDiscount: 'скидка ковки',
  ultraCritChance: 'ультра-крит шанс', ultraCritMult: 'ультра-крит сила',
  critChance: 'крит шанс', critMult: 'крит сила', offlineRate: 'оффлайн',
};

/**
 * Коллекция питомцев: три слоя эффектов на карточке —
 * 1) врождённая специализация вида (бейдж), 2) модификаторы N/N (повторы явно),
 * 3) уникальный пассив (эпик/легендарка). Фон/рамки — заглушки до этапа B (image-gen).
 */
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
    const maxScroll = Math.max(0, d.pets.length - 5);
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
      .text(360, 160, `📦 Открыть кейс (${CASE_COST_KEYS} 🗝)`, {
        fontSize: '25px', color: '#ffe6a0', backgroundColor: '#3a2c1f', padding: { x: 20, y: 12 },
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

    const list = d.pets.slice(this.scroll, this.scroll + 5);
    list.forEach((pet, i) => this.renderPetRow(pet, 330 + i * 185));

    if (d.pets.length > 5) {
      const up = this.add.text(250, 1210, '▲', { fontSize: '30px', color: '#ffd24a' })
        .setInteractive({ useHandCursor: true });
      const down = this.add.text(470, 1210, '▼', { fontSize: '30px', color: '#ffd24a' })
        .setInteractive({ useHandCursor: true });
      up.on('pointerdown', () => { this.scroll = Math.max(0, this.scroll - 5); this.render(); });
      down.on('pointerdown', () => { this.scroll = Math.min(maxScroll, this.scroll + 5); this.render(); });
    }

    const close = this.add
      .text(360, 1250, '← Вернуться', { fontSize: '26px', color: '#ffe6a0' })
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
    // фон карточки — ЗАГЛУШКА: на этапе B заменяется image-gen фоном/рамкой по редкости
    this.add.rectangle(360, y, 640, 170, 0x1c2018).setStrokeStyle(active ? 3 : 1, active ? 0xffd24a : color);
    const spec = getSpecies(pet.species);

    // Заголовок: имя [редкость] Ур.N ✅
    this.add.text(70, y - 70,
      `${spec.icon} ${pet.name} [${RARITY_INFO[pet.rarity].ru}] Ур.${pet.level}${active ? ' ✅' : ''}`,
      { fontSize: '21px', color: '#' + color.toString(16).padStart(6, '0') });

    // === Секция 1: ВРОЖДЁННАЯ СПЕЦИАЛИЗАЦИЯ (цветной бейдж) ===
    const innate = innateBonus(pet);
    this.add.text(70, y - 44,
      `⭐ ${spec.name}: ${STAT_RU[innate.stat] ?? innate.stat} +${innate.value}%`,
      { fontSize: '16px', color: '#0e1a12', backgroundColor: '#ffd24a', padding: { x: 8, y: 3 } });

    // === Секция 2: СЛУЧАЙНЫЕ МОДИФИКАТОРЫ N/N (повторы показываются явно) ===
    const mods = petMods(pet);
    const modsLine = mods.map((m) => `+${m.value}% ${STAT_RU[m.stat] ?? m.stat}`).join('  ·  ');
    this.add.text(70, y - 16,
      `⚙ Модификаторы ${mods.length}/${PET_MOD_COUNT[pet.rarity]}: ${modsLine}`,
      { fontSize: '14px', color: '#c8d8b8', wordWrap: { width: 600 } });

    // === Секция 3: УНИКАЛЬНЫЙ ПАССИВ (только эпик/легендарка) ===
    if (pet.skill) {
      const sk = PET_SKILLS[pet.species];
      this.add.text(70, y + 14,
        `[◈ 🖼 ${sk.name} ${'★'.repeat(pet.skill.stars)}] ${sk.description}`,
        { fontSize: '14px', color: '#ffd24a', backgroundColor: '#2a2410', padding: { x: 8, y: 3 } });
    }

    // Кнопки
    const actBtn = this.add.text(70, y + 55, active ? 'Убрать' : 'В команду', {
      fontSize: '16px', color: '#8aff5a', backgroundColor: '#243020', padding: { x: 8, y: 4 },
    }).setInteractive({ useHandCursor: true });
    actBtn.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      ptr.event.stopPropagation();
      this.state.setActivePet(pet.uid, !active);
      this.state.save();
      this.render();
    });

    const feedCost = petFeedCost(pet.level);
    const feedBtn = this.add.text(230, y + 55, `🍖 Кормить (${feedCost})`, {
      fontSize: '16px', color: '#ffd24a', backgroundColor: '#302a1c', padding: { x: 8, y: 4 },
    }).setInteractive({ useHandCursor: true });
    feedBtn.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      ptr.event.stopPropagation();
      this.toast(this.state.feedPet(pet.uid) ? 'Питомец подрос!' : 'Не хватает корма / макс. уровень');
      this.state.save();
      this.render();
    });

    const releaseBtn = this.add.text(410, y + 55, 'Отпустить', {
      fontSize: '16px', color: '#ffb0a0', backgroundColor: '#302020', padding: { x: 8, y: 4 },
    }).setInteractive({ useHandCursor: true });
    releaseBtn.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      ptr.event.stopPropagation();
      const gained = this.state.releasePet(pet.uid);
      this.toast(gained > 0 ? `Отпущен: +${gained} 🍖` : 'Питомец не найден');
      this.state.save();
      this.render();
    });
  }

  private toast(text: string): void {
    const t = this.add
      .text(360, 220, text, {
        fontSize: '22px', color: '#ffe6a0', backgroundColor: '#000000aa', padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5).setDepth(100);
    this.tweens.add({ targets: t, alpha: 0, duration: 1500, onComplete: () => t.destroy() });
  }
}
