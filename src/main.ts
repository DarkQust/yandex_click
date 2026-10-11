import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { EngineScene } from './scenes/EngineScene';
import { ForgeScene } from './scenes/ForgeScene';
import { DungeonScene } from './scenes/DungeonScene';
import { SkillTreeScene } from './scenes/SkillTreeScene';
import { ExpeditionScene } from './scenes/ExpeditionScene';
import { ArtifactScene } from './scenes/ArtifactScene';

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
  scene: [BootScene, EngineScene, ForgeScene, DungeonScene, SkillTreeScene, ExpeditionScene, ArtifactScene],
};

new Phaser.Game(config);
