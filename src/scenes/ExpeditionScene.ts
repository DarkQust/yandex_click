import Phaser from 'phaser';
import { RIFTS, RiftDef, RiftId, RoomRun, generateRooms, getRift, requiredDps } from '../core/expeditions';
import { GameState } from '../core/gameState';
import { formatNumber } from '../core/economy';

const ATTACK_MS = 700;

/**
 * Разломы: выбор разлома + data-driven заход по комнатам.
 * Боёвка переиспользует механику данжа (авто-атака + активный клик).
 * Автофарм и idle не зависят от этой сцены (core/expeditions + EngineScene).
 */
export class ExpeditionScene extends Phaser.Scene {
  private state!: GameState;
  private inRun = false;
  private rift!: RiftDef;
  private depth = 1;
  private rooms: RoomRun[] = [];
  private roomIndex = 0;
  private enemyHp = 0;
  private runLoot = { shards: 0, stabilizers: 0, artifacts: 0, gold: 0 };
  private enemy?: Phaser.GameObjects.Image;
  private hpBar?: Phaser.GameObjects.Image;
  private statusText!: Phaser.GameObjects.Text;
  private lootText!: Phaser.GameObjects.Text;
  private routeText!: Phaser.GameObjects.Text;
  private attackTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super('Expedition');
  }

  create(): void {
    this.state = this.registry.get('state') as GameState;
    this.add.rectangle(360, 640, 720, 1280, 0x140a1c).setAlpha(0.98).setInteractive();
    this.showRiftSelect();
  }

  /** Снять таймер автоатаки (копится между заходами, если не чистить) */
  private clearAttackTimer(): void {
    if (this.attackTimer) {
      this.attackTimer.remove(false);
      this.attackTimer = undefined;
    }
  }

  // ---------- Выбор разлома ----------

  private showRiftSelect(): void {
    this.inRun = false;
    this.add.text(360, 60, '🌀 Разломы', { fontSize: '42px', color: '#c09aff' }).setOrigin(0.5);
    this.add
      .text(360, 120, 'Глубина бесконечна. Автофарм освоенных этажей работает всегда.', {
        fontSize: '20px', color: '#9a90b8',
      })
      .setOrigin(0.5);

    RIFTS.forEach((rift, i) => {
      const y = 250 + i * 220;
      const p = this.state.data.riftProgress[rift.id];
      const box = this.add.rectangle(360, y, 640, 190, 0x201530).setStrokeStyle(2, rift.color);
      box.setInteractive({ useHandCursor: true });
      this.add.text(70, y - 70, `${rift.icon} ${rift.name}`, { fontSize: '28px', color: '#ffffff' });
      this.add
        .text(70, y - 36, rift.description, { fontSize: '18px', color: '#b8b0d8', wordWrap: { width: 560 } });
      this.add
        .text(70, y + 2, rift.unique, { fontSize: '17px', color: '#ffe6a0', wordWrap: { width: 560 } });
      const req = requiredDps(Math.max(1, p.maxDepth), rift);
      const canFarm = this.state.totalDps() >= req;
      this.add.text(70, y + 46,
        `Глубина: ${p.maxDepth} пройдена | заход №${p.maxDepth + 1} | ДПС нужен: ${formatNumber(req)}`,
        { fontSize: '17px', color: canFarm ? '#b8ffc0' : '#ffb0a0' });

      // автофарм-тоггл
      const farmBtn = this.add
        .text(620, y + 66, p.autoFarm ? '⏸ Фарм ВКЛ' : '▶ Автофарм', {
          fontSize: '18px', color: p.autoFarm ? '#8aff5a' : '#ffffff',
          backgroundColor: '#3a2c50', padding: { x: 10, y: 6 },
        })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      farmBtn.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        ptr.event.stopPropagation();
        this.state.toggleAutoFarm(rift.id);
        this.refreshScene();
      });

      box.on('pointerdown', () => this.startRun(rift.id));
    });

    // ресурсы
    const d = this.state.data;
    this.add.text(360, 1150, `💠 Осколки: ${d.shards}   🔩 Стабилизаторы: ${d.stabilizers}`,
      { fontSize: '22px', color: '#9adcff' }).setOrigin(0.5);

    this.closeButton();
  }

  // ---------- Заход ----------

  private startRun(riftId: RiftId): void {
    this.children.removeAll(true);
    this.add.rectangle(360, 640, 720, 1280, 0x140a1c).setAlpha(0.98).setInteractive();
    this.rift = getRift(riftId);
    this.depth = this.state.nextRiftDepth(riftId);
    // Хаос: случайные модификаторы на заход
    if (riftId === 'chaos') {
      const r = Math.random();
      this.rift = {
        ...this.rift,
        modifiers: {
          ...this.rift.modifiers,
          enemyHpMult: r < 0.33 ? 0.7 : r < 0.66 ? 1.4 : 1,
          playerDmgMult: 1 + (Math.random() - 0.5) * 0.6,
        },
        unique: `Случайные модификаторы: HP врагов ×${r < 0.33 ? 0.7 : r < 0.66 ? 1.4 : 1}, урон ×${(1 + (Math.random() - 0.5) * 0.6).toFixed(1)}`,
      };
    }
    this.rooms = generateRooms(this.depth, this.rift, Math.random);
    this.roomIndex = 0;
    this.runLoot = { shards: 0, stabilizers: 0, artifacts: 0, gold: 0 };
    this.inRun = true;

    this.add.text(360, 50, `${this.rift.icon} ${this.rift.name} — глубина ${this.depth}`,
      { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);
    this.routeText = this.add.text(360, 100, '', { fontSize: '18px', color: '#9a90b8' }).setOrigin(0.5);
    this.statusText = this.add.text(360, 240, '', { fontSize: '24px', color: '#ffe6a0', align: 'center', wordWrap: { width: 640 } }).setOrigin(0.5);
    this.lootText = this.add.text(360, 1150, '', { fontSize: '20px', color: '#9adcff' }).setOrigin(0.5);

    const exit = this.add.text(360, 1225, '← Выйти (добыча сохраняется)', { fontSize: '26px', color: '#ffb0a0' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    exit.on('pointerdown', () => this.endRun(false));

    this.clearAttackTimer();
    this.attackTimer = this.time.addEvent({ delay: ATTACK_MS, loop: true, callback: () => this.autoAttack() });
    this.nextRoom();
  }

  private renderRoute(): void {
    const icons: Record<string, string> = {
      combat: '⚔', treasure: '💰', event: '❓', elite: '👹', mystery: '🎲', boss: '☠',
    };
    this.routeText.setText(this.rooms.map((r, i) => (i < this.roomIndex ? `·` : icons[r.type])).join(' '));
  }

  private nextRoom(): void {
    if (!this.inRun) return; // вышли из захода — устаревшие delayedCall не выполняем
    if (this.roomIndex >= this.rooms.length) {
      this.endRun(true);
      return;
    }
    this.renderRoute();
    const room = this.rooms[this.roomIndex];
    if (room.enemyHp > 0) {
      this.startCombat(room);
    } else {
      this.resolvePeaceful(room);
    }
  }

  private startCombat(room: RoomRun): void {
    this.statusText.setText(
      room.type === 'boss' ? '☠ БОСС разлома!' : room.type === 'elite' ? '👹 Элитный страж!' : '⚔ Враг разлома!');
    this.enemyHp = room.enemyHp;
    const tex = room.type === 'boss' ? 'boss' : 'monster';
    this.enemy = this.add.image(360, 640, tex).setInteractive({ useHandCursor: true });
    this.add.rectangle(360, 800, 400, 26, 0x333333);
    this.hpBar = this.add.image(360, 800, 'bar').setTint(0xdd3333).setDisplaySize(400, 26);
    this.enemy.on('pointerdown', () => {
      this.dealDamage(this.state.clickDamage() * this.rift.modifiers.playerDmgMult);
      this.cameras.main.shake(50, 0.003);
    });
  }

  private autoAttack(): void {
    if (!this.inRun || !this.enemy) return;
    let dmg = this.state.totalDps() * (ATTACK_MS / 1000) * this.rift.modifiers.playerDmgMult;
    if (Math.random() < this.state.totalCritChance()) dmg *= this.state.totalCritMult();
    this.dealDamage(dmg);
  }

  private dealDamage(dmg: number): void {
    if (!this.enemy) return;
    this.enemyHp -= dmg;
    const room = this.rooms[this.roomIndex];
    this.hpBar?.setDisplaySize(400 * Math.max(0, this.enemyHp / room.enemyHp), 26);
    this.enemy.x = 360 + Phaser.Math.Between(-4, 4);
    if (this.enemyHp <= 0) {
      this.enemy.destroy();
      this.hpBar?.destroy();
      this.enemy = undefined;
      this.collect(room);
      this.roomIndex++;
      this.time.delayedCall(500, () => this.nextRoom());
    }
  }

  private resolvePeaceful(room: RoomRun): void {
    const names: Record<string, string> = {
      treasure: '💰 Сокровищница!', event: '❓ Событие разлома', mystery: '🎲 Тайная комната',
    };
    this.statusText.setText(`${names[room.type] ?? room.type}\nНаграды собраны`);
    this.collect(room);
    this.roomIndex++;
    this.time.delayedCall(800, () => this.nextRoom());
  }

  /** Сбор наград комнаты в текущий заход */
  private collect(room: RoomRun): void {
    const r = room.rewards;
    this.runLoot.shards += r.shards;
    this.runLoot.gold += r.gold;
    if (Math.random() < r.stabilizerChance) this.runLoot.stabilizers += 1;
    if (Math.random() < r.artifactChance) this.runLoot.artifacts += 1;
    this.lootText.setText(
      `Добыча захода: 💠${this.runLoot.shards} 🔩${this.runLoot.stabilizers} 📦${this.runLoot.artifacts} 🪙${formatNumber(this.runLoot.gold)}`);
  }

  private endRun(completed: boolean): void {
    this.clearAttackTimer();
    this.inRun = false;
    // выдача накопленной добычи
    this.state.data.shards += this.runLoot.shards;
    this.state.data.stabilizers += this.runLoot.stabilizers;
    this.state.addGold(this.runLoot.gold);
    for (let i = 0; i < this.runLoot.artifacts; i++) {
      this.state.grantArtifactDrop(this.rift); // null если инвентарь полон
    }
    if (completed) {
      this.state.completeRiftRun(this.rift.id, this.depth);
    }
    this.state.save();
    this.refreshScene();
  }

  private refreshScene(): void {
    this.children.removeAll(true);
    this.add.rectangle(360, 640, 720, 1280, 0x140a1c).setAlpha(0.98).setInteractive();
    this.showRiftSelect();
  }

  private closeButton(): void {
    const close = this.add.text(360, 1210, '← Вернуться в кузницу', { fontSize: '30px', color: '#ffe6a0' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => {
      this.state.save();
      this.scene.stop();
    });
  }
}
