import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { World } from './world';
import { resources } from './blocks';

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

  const resourcesFolder = gui.addFolder('Resources');
  for (const resource of resources) {
    const resourceFolder = resourcesFolder.addFolder(resource.name);
    resourceFolder.add(resource, 'scarcity', 0, 1).name('Scarcity');
    const scaleFolder = resourceFolder.addFolder('Scale').close();
    scaleFolder.add(resource.scale, 'x', 10, 100).name('X Scale');
    scaleFolder.add(resource.scale, 'y', 10, 100).name('Y Scale');
    scaleFolder.add(resource.scale, 'z', 10, 100).name('Z Scale');
  }

  gui.onChange((event) => {
    world.generate();
  });
}