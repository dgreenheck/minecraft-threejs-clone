import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { resources } from './blocks';
import { Physics } from './physics';

/**
 * Sets up the UI controls
 * @param {World} world 
 * @param {Player} player
 * @param {Physics} physics
 */
export function setupUI(world, player, physics, scene) {
  const gui = new GUI();

  const playerFolder = gui.addFolder('Player');
  playerFolder.add(player, 'maxSpeed', 1, 20, 0.1).name('Max Speed');
  playerFolder.add(player, 'jumpSpeed', 1, 10, 0.1).name('Jump Speed');
  playerFolder.add(player.boundsHelper, 'visible').name('Show Player Bounds');
  playerFolder.add(player.cameraHelper, 'visible').name('Show Camera Helper');

  const physicsFolder = gui.addFolder('Physics');
  physicsFolder.add(physics.helpers, 'visible').name('Visualize Collisions');
  physicsFolder.add(physics, 'simulationRate', 10, 1000).name('Sim Rate');

  const worldFolder = gui.addFolder('World');
  worldFolder.add(world, 'drawDistance', 0, 5, 1).name('Draw Distance');
  worldFolder.add(world, 'asyncLoading').name('Async Loading');
  worldFolder.add(scene.fog, 'near', 1, 200, 1).name('Fog Near');
  worldFolder.add(scene.fog, 'far', 1, 200, 1).name('Fog Far');

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

  terrainFolder.onFinishChange((event) => {
    world.regenerate(player);
  });
}