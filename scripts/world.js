import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { RNG } from './rng';
import { blocks } from './blocks.js';

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshLambertMaterial();

export class World extends THREE.Group {
  size = {
    width: 32,
    height: 16
  }

  /**
   * Parameters for terrain generation
   */
  params = {
    seed: 0,
    terrain: {
      scale: 30,
      magnitude: 0.2,
      offset: 0.5
    }
  }

  /**
   * @type {{
   *  id: number,
   *  instanceId: number
   * }[][][]}
   */
  data = [];

  threshold = 0.5;

  /**
   * Generates the world data and meshes
   */
  generate() {
    const rng = new RNG(this.params.seed);
    this.initialize();
    this.generateTerrain(rng);
    this.generateMeshes();
  }

  /**
   * Initializes an empty world
   */
  initialize() {
    this.data = [];
    for (let x = 0; x < this.size.width; x++) {
      const slice = [];
      for (let y = 0; y < this.size.height; y++) {
        const row = [];
        for (let z = 0; z < this.size.width; z++) {
          row.push({
            id: blocks.empty.id,
            instanceId: null
          });
        }
        slice.push(row);
      }
      this.data.push(slice);
    }
  }

  /**
   * Generates the world terrain data
   */
  generateTerrain(rng) {
    const noiseGenerator = new SimplexNoise(rng);
    for (let x = 0; x < this.size.width; x++) {
      for (let z = 0; z < this.size.width; z++) {

        // Compute noise value at this x-z location
        const value = noiseGenerator.noise(
          x / this.params.terrain.scale,
          z / this.params.terrain.scale
        );

        // Scale noise based on the magnitude and add in the offset
        const scaledNoise = this.params.terrain.offset + this.params.terrain.magnitude * value;

        // Compute final height of terrain at this location
        let height = this.size.height * scaledNoise;

        // Clamp between 0 and max height
        height = Math.max(0, Math.min(Math.floor(height), this.size.height - 1));
        
        // Starting at the terrain height, fill in all the blocks below that height
        for (let y = 0; y < this.size.height; y++) {
          if (y === height) {
            this.setBlockId(x, y, z, blocks.grass.id);
          // Fill in everything below with dirt
          } else if (y < height) {
            this.setBlockId(x, y, z, blocks.dirt.id);
          // Clear everything above
          } else if (y > height) {
            this.setBlockId(x, y, z, blocks.empty.id);
          }
        }
      }
    }
  }

  /**
   * Generates the meshes from the world data
   */
  generateMeshes() {
    this.disposeChildren();
    
    // Initialize instanced mesh to total size of world
    const maxCount = this.size.width * this.size.width * this.size.height;
    const mesh = new THREE.InstancedMesh(geometry, material, maxCount);
    mesh.count = 0;
  
    // Add instances for each non-empty block
    const matrix = new THREE.Matrix4();
    for (let x = 0; x < this.size.width; x++) {
      for (let y = 0; y < this.size.height; y++) {
        for (let z = 0; z < this.size.width; z++) {
          const blockId = this.getBlock(x, y, z).id;
          const blockType = Object.values(blocks).find(x => x.id === blockId);
          const instanceId = mesh.count;

          // Create a new instance if
          // 1) There is a block at this location
          // 2) It is not obscured by other blocks
          if (blockId !== blocks.empty.id && !this.isBlockObscured(x, y, z)) {
            matrix.setPosition(x, y, z);
            mesh.setMatrixAt(instanceId, matrix);
            mesh.setColorAt(instanceId, new THREE.Color(blockType.color));
            this.setBlockInstanceId(x, y, z, instanceId);
            mesh.count++;
          }
        }
      }
    }

    this.add(mesh);
  }

  /**
   * Gets the block data at (x, y, z)
   * @param {number} x 
   * @param {number} y 
   * @param {number} z 
   * @returns {{id: number, instanceId: number}}
   */
  getBlock(x, y, z) {
    if (this.inBounds(x, y, z)) {
      return this.data[x][y][z];
    } else {
      return null;
    }
  }
  

  /**
   * Sets the block id for the block at (x, y, z)
   * @param {number} x 
   * @param {number} y 
   * @param {number} z 
   * @param {number} id
   */
  setBlockId(x, y, z, id) {
    if (this.inBounds(x, y, z)) {
      this.data[x][y][z].id = id;
    }
  }
  

  /**
   * Sets the block instance id for the block at (x, y, z)
   * @param {number} x 
   * @param {number} y 
   * @param {number} z 
   * @param {number} instanceId
   */
  setBlockInstanceId(x, y, z, instanceId) {
    if (this.inBounds(x, y, z)) {
      this.data[x][y][z].instanceId = instanceId;
    }
  }
  
  /**
   * Checks if the (x, y, z) coordinates are within bounds
   * @param {number} x 
   * @param {number} y 
   * @param {number} z 
   * @returns {boolean}
   */
  inBounds(x, y, z) {
    if (x >= 0 && x < this.size.width &&
      y >= 0 && y < this.size.height &&
      z >= 0 && z < this.size.width) {
      return true; 
    } else {
      return false;
    }
  }

  /**
   * Returns true if this block is completely hidden by other blocks
   * @param {number} x 
   * @param {number} y 
   * @param {number} z 
   * @returns {boolean}
   */
  isBlockObscured(x, y, z) {
    const up = this.getBlock(x, y + 1, z)?.id ?? blocks.empty.id;
    const down = this.getBlock(x, y - 1, z)?.id ?? blocks.empty.id;
    const left = this.getBlock(x + 1, y, z)?.id ?? blocks.empty.id;
    const right = this.getBlock(x - 1, y, z)?.id ?? blocks.empty.id;
    const forward = this.getBlock(x, y, z + 1)?.id ?? blocks.empty.id;
    const back = this.getBlock(x, y, z - 1)?.id ?? blocks.empty.id;
  
    // If any of the block's sides is exposed, it is not obscured
    if (up === blocks.empty.id ||
        down === blocks.empty.id || 
        left === blocks.empty.id || 
        right === blocks.empty.id || 
        forward === blocks.empty.id || 
        back === blocks.empty.id) {
      return false;
    } else {
      return true;
    }
  }

  disposeChildren() {
    this.traverse(obj => {
      if (obj.dispose) obj.dispose();
    })
    this.clear();
  }
}