import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { ForgeScene } from './scenes/ForgeScene';
import { DungeonScene } from './scenes/DungeonScene';
import { SkillTreeScene } from './scenes/SkillTreeScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 720,
  height: 1280,
  backgroundColor: '#120b08',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, ForgeScene, DungeonScene, SkillTreeScene],
};

new Phaser.Game(config);
