import * as Phaser from 'phaser';
import './style.css';
import { BarracksPanelScene } from './scenes/barracks_panel_scene';
import { BootScene } from './scenes/boot_scene';
import { CampScene } from './scenes/camp_scene';
import { CampScreenScene } from './scenes/camp_screen_scene';
import { CombatScene } from './scenes/combat_scene';
import { ExplorerScene } from './scenes/dev/explorer_scene';
import { MainScene } from './scenes/dev/main_scene';
import { DungeonScene } from './scenes/dungeon_scene';
import { EquipPanelScene } from './scenes/equip_panel_scene';
import { HospitalPanelScene } from './scenes/hospital_panel_scene';
import { NoticeboardPanelScene } from './scenes/noticeboard_panel_scene';
import { PerkOverlayScene } from './scenes/perk_overlay_scene';
import { ShopOverlayScene } from './scenes/shop_overlay_scene';
import { TavernPanelScene } from './scenes/tavern_panel_scene';
import { installPwaPrompt } from './util/pwa_install_prompt';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#111111',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    BootScene,
    CampScene,
    TavernPanelScene,
    BarracksPanelScene,
    HospitalPanelScene,
    NoticeboardPanelScene,
    DungeonScene,
    CombatScene,
    CampScreenScene,
    EquipPanelScene,
    PerkOverlayScene,
    ShopOverlayScene,
    MainScene,
    ExplorerScene,
  ],
});

const fullscreenButton = document.getElementById('fullscreen-toggle');
const fsRoot = document.documentElement as HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
};
const fullscreenSupported = !!(fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen);
if (fullscreenButton && !fullscreenSupported) {
  fullscreenButton.style.display = 'none';
}
if (fullscreenButton && fullscreenSupported) {
  fullscreenButton.addEventListener('click', async () => {
    fullscreenButton.textContent = '…';
    try {
      const fsDoc = document as Document & {
        webkitFullscreenElement?: Element;
        webkitExitFullscreen?: () => Promise<void>;
      };
      const isFs = !!(document.fullscreenElement ?? fsDoc.webkitFullscreenElement);
      if (isFs) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (fsDoc.webkitExitFullscreen) await fsDoc.webkitExitFullscreen();
      } else {
        if (fsRoot.requestFullscreen) await fsRoot.requestFullscreen();
        else if (fsRoot.webkitRequestFullscreen) await fsRoot.webkitRequestFullscreen();
      }
      fullscreenButton.textContent = '⛶';
    } catch (err) {
      fullscreenButton.textContent = '⛶';
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Fullscreen failed: ${msg}`);
    }
  });
}

installPwaPrompt();
