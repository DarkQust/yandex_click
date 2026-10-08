import Phaser from 'phaser';
import { GameState } from '../core/gameState';
import { SKILL_NODES, SkillNode, skillCost } from '../core/skills';
import { formatNumber } from '../core/economy';

const TREE_NAMES: Record<string, string> = {
  midas: '💰 Мидас',
  might: '⚔ Мощь',
  luck: '🍀 Удача',
};

/** Оверлей дерева навыков: 3 ветки × 5 узлов, покупка за кристаллы. */
export class SkillTreeScene extends Phaser.Scene {
  private state!: GameState;
  private crystalsText!: Phaser.GameObjects.Text;

  constructor() {
    super('SkillTree');
  }

  create(): void {
    this.state = this.registry.get('state') as GameState;

    this.add.rectangle(360, 640, 720, 1280, 0x101018).setAlpha(0.97).setInteractive(); // блокирует ввод к Forge под оверлеем
    this.add
      .text(360, 50, '🔮 Дерево Навыков', { fontSize: '40px', color: '#c09aff' })
      .setOrigin(0.5);
    this.crystalsText = this.add
      .text(360, 110, '', { fontSize: '28px', color: '#9adcff' })
      .setOrigin(0.5);

    const trees = ['midas', 'might', 'luck'];
    trees.forEach((tree, col) => {
      const x = 120 + col * 240;
      this.add
        .text(x, 165, TREE_NAMES[tree], { fontSize: '24px', color: '#ffe6a0' })
        .setOrigin(0.5);
      SKILL_NODES.filter((n) => n.tree === tree).forEach((node, row) => {
        this.drawNode(node, x, 230 + row * 175);
      });
    });

    const close = this.add
      .text(360, 1230, '← Назад', { fontSize: '30px', color: '#ffe6a0' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => {
      this.scene.stop(); // Forge не паузится — оверлей-модель
    });

    this.refreshCrystals();
  }

  private drawNode(node: SkillNode, x: number, y: number): void {
    const level = () => this.state.data.skills[node.id] ?? 0;

    const box = this.add
      .rectangle(x, y, 210, 150, 0x2a2438)
      .setStrokeStyle(2, 0x6a5adf)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(x, y - 52, node.name, { fontSize: '20px', color: '#ffffff' })
      .setOrigin(0.5);
    this.add
      .text(x, y - 8, node.description, {
        fontSize: '16px',
        color: '#b8b0d8',
        align: 'center',
        wordWrap: { width: 190 },
      })
      .setOrigin(0.5);
    const info = this.add.text(x, y + 50, '', { fontSize: '18px', color: '#9adcff' }).setOrigin(0.5);

    const refresh = () => {
      const lvl = level();
      if (lvl >= node.maxLevel) {
        info.setText(`Ур. ${lvl}/${node.maxLevel} — MAX`);
        box.setStrokeStyle(2, 0xffd24a);
      } else {
        info.setText(`Ур. ${lvl}/${node.maxLevel} | ${skillCost(node, lvl)} 💎`);
      }
    };
    refresh();

    box.on('pointerdown', () => {
      const lvl = level();
      if (lvl >= node.maxLevel) return;
      const cost = skillCost(node, lvl);
      if (!this.state.spendCrystals(cost)) {
        this.flash(box);
        return;
      }
      this.state.data.skills[node.id] = lvl + 1;
      this.state.refreshEffects();
      this.state.save();
      this.refreshCrystals();
      refresh();
    });
  }

  private flash(obj: Phaser.GameObjects.Rectangle): void {
    this.tweens.add({ targets: obj, alpha: 0.4, yoyo: true, duration: 120, repeat: 2 });
  }

  private refreshCrystals(): void {
    this.crystalsText.setText(`💎 Кристаллы: ${formatNumber(this.state.data.crystals)}`);
  }
}
