import Phaser from 'phaser';
import { VashnikScene } from './bosses/vashnik/VashnikScene';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from './game/config';
import { BossSelectScene } from './scenes/BossSelectScene';
import { ClassSelectScene } from './scenes/ClassSelectScene';
import { RangeSelectScene } from './scenes/RangeSelectScene';
import { RoleSelectScene } from './scenes/RoleSelectScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.background,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [RoleSelectScene, RangeSelectScene, ClassSelectScene, BossSelectScene, VashnikScene],
});
