import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { World } from './world';

/**
 * 
 * @param {World} world 
 */
export function setupUI(world) {
  const gui = new GUI();

  const worldFolder = gui.addFolder('World');
  worldFolder.add(world.size, 'width', 8, 128, 1).name('Width');
  worldFolder.add(world.size, 'height', 8, 32, 1).name('Height');
  
  const terrainFolder = worldFolder.addFolder('Terrain');
  terrainFolder.add(world.params, 'seed', 0, 10000, 1).name('Seed');
  terrainFolder.add(world.params.terrain, 'scale', 10, 100).name('Scale');
  terrainFolder.add(world.params.terrain, 'magnitude', 0, 1).name('Magnitude');
  terrainFolder.add(world.params.terrain, 'offset', 0, 1).name('Offset');

  gui.onChange((event) => {
    world.generate();
  });
}