import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { World } from './world';
import { Player } from './player';
import { Physics } from './physics';
import { setupUI } from './ui';

// Renderer setup
const renderer = new THREE.WebGLRenderer();
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x80a0e0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Camera setup
const orbitCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
orbitCamera.position.set(-32, 32, 32);

const controls = new OrbitControls(orbitCamera, renderer.domElement);
controls.target.set(32, 0, 32);
controls.update();

// Scene setup
const scene = new THREE.Scene();
const player = new Player(scene);
const physics = new Physics(scene);
const world = new World();
scene.add(world);

const sun = new THREE.DirectionalLight();
sun.intensity = 1.5;
sun.position.set(50, 50, 50);
sun.castShadow = true;

// Set the size of the sun's shadow box
sun.shadow.camera.left = -40;
sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40;
sun.shadow.camera.bottom = -40;
sun.shadow.camera.near = 0.1;
sun.shadow.camera.far = 200;
sun.shadow.bias = -0.0001;
sun.shadow.mapSize = new THREE.Vector2(2048, 2048);
scene.add(sun);
scene.add(sun.target);

const ambient = new THREE.AmbientLight();
ambient.intensity = 0.2;
scene.add(ambient);

scene.fog = new THREE.Fog(0x80a0e0, 50, 100);

// Events
window.addEventListener('resize', () => {
  // Resize camera aspect ratio and renderer size to the new window size
  orbitCamera.aspect = window.innerWidth / window.innerHeight;
  orbitCamera.updateProjectionMatrix();
  player.camera.aspect = window.innerWidth / window.innerHeight;
  player.camera.updateProjectionMatrix();
  
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// UI Setup
const stats = new Stats();
document.body.appendChild(stats.dom);

// Render loop
let previousTime = performance.now();
function animate() {
  requestAnimationFrame(animate);

  const currentTime = performance.now();
  const dt = (currentTime - previousTime) / 1000;

  // Position the sun relative to the player. Need to adjust both the
  // position and target of the sun to keep the same sun angle
  sun.position.copy(player.camera.position);
  sun.position.sub(new THREE.Vector3(-50, -50, -50));
  sun.target.position.copy(player.camera.position);

  physics.update(dt, player, world);
  world.update(player);
  renderer.render(scene, player.controls.isLocked ? player.camera : orbitCamera);
  stats.update();

  previousTime = currentTime;
}

setupUI(world, player, physics, scene);
animate();