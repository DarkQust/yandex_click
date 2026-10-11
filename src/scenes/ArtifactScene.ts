import Phaser from 'phaser';
import { CRAFT_COST_SHARDS, MAX_EQUIPPED, RARITY_INFO } from '../core/artifacts';
import { GameState } from '../core/gameState';
import { AFFIX_POOL } from '../core/artifacts';

/**
 * Артефакты: инвентарь, крафт за Осколки, рерoll за Стабилизаторы,
 * экипировка (до 5), распыл. Placeholder-UI до визуального этапа B.
 */
export class ArtifactScene extends Phaser.Scene {
  private state!: GameState;
  private scroll = 0;

  constructor() {
    super('Artifact');
  }

  create(): void {
    this.state = this.registry.get('state') as GameState;
    this.render();
  }

  private render(): void {
    this.children.removeAll(true);
    const d = this.state.data;

    this.add.rectangle(360, 640, 720, 1280, 0x101a14).setAlpha(0.98).setInteractive();
    this.add.text(360, 50, '📦 Артефакты', { fontSize: '40px', color: '#8affc0' }).setOrigin(0.5);
    this.add
      .text(360, 105, `💠 ${d.shards}   🔩 ${d.stabilizers}   Экипировано: ${d.equippedIds.length}/${MAX_EQUIPPED}`,
        { fontSize: '24px', color: '#9adcff' })
      .setOrigin(0.5);

    // Крафт
    const craftBtn = this.add
      .text(360, 165, `⚒ Сковать артефакт (${CRAFT_COST_SHARDS} 💠)`, {
        fontSize: '26px', color: '#ffe6a0', backgroundColor: '#3a2c1f', padding: { x: 20, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    craftBtn.on('pointerdown', () => {
      const art = this.state.craftArtifact();
      if (!art) {
        this.toast('Не хватает Осколков (фармятся в Разломах) или инвентарь полон');
        return;
      }
      this.toast(`✨ ${art.name} [${RARITY_INFO[art.rarity].ru}]`);
      this.state.save();
      this.render();
    });

    // Список
    if (d.artifacts.length === 0) {
      this.add.text(360, 640, 'Инвентарь пуст.\nСковать первый артефакт?', {
        fontSize: '26px', color: '#b8b0d8', align: 'center',
      }).setOrigin(0.5);
    }
    const list = d.artifacts.slice(this.scroll, this.scroll + 6);
    list.forEach((art, i) => {
      const y = 300 + i * 150;
      const equipped = d.equippedIds.includes(art.id);
      const color = RARITY_INFO[art.rarity].color;
      const box = this.add
        .rectangle(360, y, 640, 130, 0x1c2818)
        .setStrokeStyle(equipped ? 3 : 1, equipped ? 0xffd24a : color);
      box.setInteractive({ useHandCursor: true });
      this.add.text(70, y - 50, `${art.name}${equipped ? ' ✅' : ''}`, {
        fontSize: '22px', color: '#' + color.toString(16).padStart(6, '0'),
      });
      const affixLines = art.affixes
        .map((a) => {
          const def = AFFIX_POOL.find((p) => p.stat === a.stat);
          return `${a.secret ? '🌟 ' : ''}${def?.ru ?? a.stat}: ${a.value}`;
        })
        .join('   ');
      this.add.text(70, y - 14, affixLines, {
        fontSize: '15px', color: '#c8d8b8', wordWrap: { width: 600 },
      });

      const eqBtn = this.add
        .text(70, y + 36, equipped ? 'Снять' : 'Надеть', {
          fontSize: '16px', color: '#8aff5a', backgroundColor: '#243020', padding: { x: 8, y: 4 },
        })
        .setInteractive({ useHandCursor: true });
      eqBtn.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        ptr.event.stopPropagation();
        if (equipped) this.state.unequipArtifact(art.id);
        else if (!this.state.equipArtifact(art.id)) this.toast('Слотов нет (макс 5)');
        this.state.save();
        this.render();
      });

      const rrBtn = this.add
        .text(190, y + 36, '🔩 Рерoll (1)', {
          fontSize: '16px', color: '#9adcff', backgroundColor: '#202830', padding: { x: 8, y: 4 },
        })
        .setInteractive({ useHandCursor: true });
      rrBtn.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        ptr.event.stopPropagation();
        const next = this.state.rerollArtifact(art.id);
        this.toast(next ? 'Аффикс перекован!' : 'Нужен Стабилизатор');
        this.state.save();
        this.render();
      });

      const salBtn = this.add
        .text(340, y + 36, `Распыл (+${RARITY_INFO[art.rarity].salvageShards}💠)`, {
          fontSize: '16px', color: '#ffb0a0', backgroundColor: '#302020', padding: { x: 8, y: 4 },
        })
        .setInteractive({ useHandCursor: true });
      salBtn.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        ptr.event.stopPropagation();
        const gained = this.state.salvageArtifact(art.id);
        this.toast(`Распылено: +${gained} 💠`);
        this.state.save();
        this.render();
      });
    });

    // скролл
    if (d.artifacts.length > 6) {
      const up = this.add.text(250, 1160, '▲', { fontSize: '32px', color: '#8affc0' })
        .setInteractive({ useHandCursor: true });
      const down = this.add.text(470, 1160, '▼', { fontSize: '32px', color: '#8affc0' })
        .setInteractive({ useHandCursor: true });
      up.on('pointerdown', () => { this.scroll = Math.max(0, this.scroll - 6); this.render(); });
      down.on('pointerdown', () => {
        this.scroll = Math.min(Math.max(0, d.artifacts.length - 6), this.scroll + 6);
        this.render();
      });
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

  private toast(text: string): void {
    const t = this.add
      .text(360, 230, text, {
        fontSize: '22px', color: '#ffe6a0', backgroundColor: '#000000aa', padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5).setDepth(100);
    this.tweens.add({ targets: t, alpha: 0, duration: 1400, onComplete: () => t.destroy() });
  }
}
