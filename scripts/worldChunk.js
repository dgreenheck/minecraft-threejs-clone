import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { RNG } from './rng';
import { blocks, resources } from './blocks.js';

const geometry = new THREE.BoxGeometry(1, 1, 1);

export class WorldChunk extends THREE.Group {
  /**
   * @type {{
   *  id: number,
   *  instanceId: number
   * }[][][]}
   */
  data = [];

  constructor(size, params) {
    super();
    this.size = size;
    this.params = params;
    this.loaded = false;
  }

  /**
   * Generates the world data and meshes
   */
  generate() {
    const start = performance.now();

    const rng = new RNG(this.params.seed);
    this.initialize();
    this.generateResources(rng);
    this.generateTerrain(rng);
    this.generateMeshes();

    this.loaded = true;

    console.log(`Loaded chunk in ${performance.now() - start}ms`);
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
   * Generates resources within the world
   * @param {RNG} rng Random number generator
   */
  generateResources(rng) {
    for (const resource of resources) {
      const simplex = new SimplexNoise(rng);
      for (let x = 0; x < this.size.width; x++) {
        for (let y = 0; y < this.size.height; y++) {
          for (let z = 0; z < this.size.width; z++) {
            const n = simplex.noise3d(
              (this.position.x + x) / resource.scale.x, 
              (this.position.y + y) / resource.scale.y, 
              (this.position.z + z) / resource.scale.z);

            if (n > resource.scarcity) {
              this.setBlockId(x, y, z, resource.id);
            }
          }
        }
      }
    }
  }

  /**
   * Generates the world terrain data
   * @param {RNG} rng Random number generator
   */
  generateTerrain(rng) {
    const simplex = new SimplexNoise(rng);
    for (let x = 0; x < this.size.width; x++) {
      for (let z = 0; z < this.size.width; z++) {

        // Compute noise value at this x-z location
        const value = simplex.noise(
          (this.position.x + x) / this.params.terrain.scale,
          (this.position.z + z) / this.params.terrain.scale
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
          // Fill in blocks with dirt if they aren't already filled with something else
          } else if (y < height && this.getBlock(x, y, z).id === blocks.empty.id) {
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
    
    // Create lookup table of InstancedMesh's with the block id being the key
    const meshes = {};
    Object.values(blocks)
      .filter((blockType) => blockType.id !== blocks.empty.id)
      .forEach((blockType) => {
        const maxCount = this.size.width * this.size.width * this.size.height;
        const mesh = new THREE.InstancedMesh(geometry, blockType.material, maxCount);
        mesh.name = blockType.name;
        mesh.count = 0;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        meshes[blockType.id] = mesh;
    });

    // Add instances for each non-empty block
    const matrix = new THREE.Matrix4();
    for (let x = 0; x < this.size.width; x++) {
      for (let y = 0; y < this.size.height; y++) {
        for (let z = 0; z < this.size.width; z++) {
          const blockId = this.getBlock(x, y, z).id;

          // Ignore empty blocks
          if (blockId === blocks.empty.id) continue;

          const mesh = meshes[blockId];
          const instanceId = mesh.count;

          // Create a new instance if block is not obscured by other blocks
          if (!this.isBlockObscured(x, y, z)) {
            matrix.setPosition(x, y, z);
            mesh.setMatrixAt(instanceId, matrix);
            this.setBlockInstanceId(x, y, z, instanceId);
            mesh.count++;
          }
        }
      }
    }

    // Add all instanced meshes to the scene
    this.add(...Object.values(meshes));
  }

  /**
   * Gets the block data at (x, y, z)
   * @param {number} x 
   * @param {number} y 
   * @param {number} z 
   * @returns {{id: number, instanceId: number} | null}
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