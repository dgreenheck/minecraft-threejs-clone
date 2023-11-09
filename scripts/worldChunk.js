import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { RNG } from './rng';
import { blocks, resources, getTextureIndex } from './blocks.js';

let texAtlas = new THREE.TextureLoader().load('textures/atlas.png');
texAtlas.colorSpace = THREE.SRGBColorSpace;
texAtlas.magFilter = THREE.NearestFilter;
texAtlas.minFilter = THREE.NearestFilter;

export class WorldChunk extends THREE.Group {
  /**
   * @type {{
   *  id: number,
   *  instanceId: number
   * }[][][]}
   */
  data = [];

  constructor(size, params, dataStore) {
    super();
    this.size = size;
    this.params = params;
    this.dataStore = dataStore;
    this.loaded = false;

    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.material = new THREE.MeshLambertMaterial({
      onBeforeCompile: shader => {
        shader.uniforms.texAtlas = { value: texAtlas };
        shader.vertexShader = `
    	attribute float texIdx;
    	varying float vTexIdx;
      ${shader.vertexShader}
    `.replace(
          `void main() {`,
          `void main() {
      	vTexIdx = texIdx;
      `
        );

        shader.fragmentShader = `
    	uniform sampler2D texAtlas;
    	varying float vTexIdx;
      ${shader.fragmentShader}
    `.replace(
          `#include <map_fragment>`,
          `#include <map_fragment>
      
        vec2 texOffset = vec2(
        	mod(vTexIdx, 16.0),
          floor(vTexIdx / 16.0)
        );
        
       	vec2 blockUv = vec2(
        	0.0625 * (texOffset.x + vUv.s), 
          1.0 - 0.0625 * (texOffset.y + vUv.t)
        ); 
        
        vec4 blockColor = texture(texAtlas, blockUv);
        diffuseColor *= blockColor;
      `
        );
      }
    });
    this.material.defines = { "USE_UV": "" };

    const maxCount = this.size.width * this.size.width * this.size.height;
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, maxCount);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    this.texIdx = new Float32Array(maxCount).fill(0);
    this.mesh.geometry.setAttribute("texIdx", new THREE.InstancedBufferAttribute(this.texIdx, 1));
  }

  /**
   * Generates the world data and meshes
   */
  generate() {
    const rng = new RNG(this.params.seed);
    this.initialize();
    this.generateResources(rng);
    this.generateTerrain(rng);
    this.generateClouds(rng);
    this.generateTrees(rng);
    this.loadPlayerChanges();
    this.generateBlockInstances();

    this.loaded = true;
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
          if (y <= this.params.terrain.waterHeight && y <= height) {
            this.setBlockId(x, y, z, blocks.sand.id);
          } else if (y === height) {
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
   * Populate the world with trees
   * @param {RNG} rng 
   */
  generateTrees(rng) {
    const simplex = new SimplexNoise(rng);
    const canopySize = this.params.trees.canopy.size.max;
    for (let baseX = canopySize; baseX < this.size.width - canopySize; baseX++) {
      for (let baseZ = canopySize; baseZ < this.size.width - canopySize; baseZ++) {
        const n = simplex.noise(
          this.position.x + baseX,
          this.position.z + baseZ) * 0.5 + 0.5;
        if (n < (1 - this.params.trees.frequency)) continue;

        // Find the grass tile
        for (let y = this.size.height - 1; y--; y >= 0) {
          if (this.getBlock(baseX, y, baseZ).id !== blocks.grass.id) continue;

          // We found grass, move one tile up
          const baseY = y + 1;

          // Create the trunk. First, determine the trunk height
          const minH = this.params.trees.trunkHeight.min;
          const maxH = this.params.trees.trunkHeight.max;
          const trunkHeight = Math.round(rng.random() * (maxH - minH)) + minH;
          const topY = baseY + trunkHeight;

          // Fill in the blocks for the trunk
          for (let y = baseY; y <= topY; y++) {
            this.setBlockId(baseX, y, baseZ, blocks.tree.id);
          }

          // Create the leaves. First, determine the canopy radius R
          const minR = this.params.trees.canopy.size.min;
          const maxR = this.params.trees.canopy.size.max;
          const R = Math.round(rng.random() * (maxR - minR)) + minR;

          for (let x = -R; x <= R; x++) {
            for (let y = -R; y <= R; y++) {
              for (let z = -R; z <= R; z++) {
                // Don't creates leaves outside the canopy radius
                if (x * x + y * y + z * z > R * R) continue;
                // Don't overwrite existing blocks
                if (this.getBlock(baseX + x, topY + y, baseZ + z)?.id !== blocks.empty.id) continue;
                // Add some randomness to break up the leaves a bit
                if (rng.random() > this.params.trees.canopy.density) {
                  this.setBlockId(baseX + x, topY + y, baseZ + z, blocks.leaves.id);
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Creates happy little clouds
   * @param {RNG} rng 
   */
  generateClouds(rng) {
    const simplex = new SimplexNoise(rng);
    for (let x = 0; x < this.size.width; x++) {
      for (let z = 0; z < this.size.width; z++) {
        const value = simplex.noise(
          (this.position.x + x) / this.params.clouds.scale,
          (this.position.z + z) / this.params.clouds.scale) * 0.5 + 0.5;

        if (value < this.params.clouds.density) {
          this.setBlockId(x, this.size.height - 1, z, blocks.cloud.id);
        }
      }
    }
  }

  /**
   * Pulls any changes from the data store and applies them to the data model
   */
  loadPlayerChanges() {
    for (let x = 0; x < this.size.width; x++) {
      for (let y = 0; y < this.size.height; y++) {
        for (let z = 0; z < this.size.width; z++) {
          // Overwrite with value in data store if it exists
          if (this.dataStore.contains(this.position.x, this.position.z, x, y, z)) {
            const blockId = this.dataStore.get(this.position.x, this.position.z, x, y, z);
            this.setBlockId(x, y, z, blockId);
          }
        }
      }
    }
  }

  /**
   * Generates the meshes from the world data
   */
  generateBlockInstances() {
    this.disposeChildren();
    this.generateWater();

    // Add instances for each non-empty block
    const matrix = new THREE.Matrix4();
    for (let x = 0; x < this.size.width; x++) {
      for (let y = 0; y < this.size.height; y++) {
        for (let z = 0; z < this.size.width; z++) {
          const blockId = this.getBlock(x, y, z).id;
          const block = Object.values(blocks).find(x => x.id === blockId);

          // Ignore empty blocks
          if (blockId === blocks.empty.id) continue;

          const instanceId = this.mesh.count;

          // Create a new instance if block is not obscured by other blocks
          if (!this.isBlockObscured(x, y, z)) {
            matrix.setPosition(x, y, z);
            this.texIdx[instanceId] = block.textureIndex;
            this.mesh.setMatrixAt(instanceId, matrix);
            this.setBlockInstanceId(x, y, z, instanceId);
            this.mesh.count++;
          }
        }
      }
    }

    this.add(this.mesh);
  }

  /**
   * Creates a plane of water
   */
  generateWater() {
    const waterMaterial = new THREE.MeshLambertMaterial({
      color: 0x9090e0,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    });
    const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(), waterMaterial);
    waterMesh.rotateX(-Math.PI / 2);
    waterMesh.position.set(
      this.size.width / 2,
      this.params.terrain.waterHeight + 0.4,
      this.size.width / 2
    );
    waterMesh.scale.set(this.size.width, this.size.width, 1);
    waterMesh.layers.set(1);

    this.add(waterMesh);
  }

  /**
   * Adds a new block at (x,y,z) of type `blockId`
   * @param {number} x 
   * @param {number} y 
   * @param {number} z 
   * @param {number} blockId 
   */
  addBlock(x, y, z, blockId) {
    // Safety check that we aren't adding a block for one that
    // already has an instance
    if (this.getBlock(x, y, z).id === blocks.empty.id) {
      this.setBlockId(x, y, z, blockId);
      this.addBlockInstance(x, y, z);
      this.dataStore.set(this.position.x, this.position.z, x, y, z, blockId);
    }
  }

  /**
   * Removes the block at (x, y, z)
   * @param {number} x 
   * @param {number} y 
   * @param {number} z 
   */
  removeBlock(x, y, z) {
    const block = this.getBlock(x, y, z);
    if (block && block.id !== blocks.empty.id) {
      console.log(`Removing block at X:${x} Y:${y} Z:${z}`);
      this.deleteBlockInstance(x, y, z);
      this.setBlockId(x, y, z, blocks.empty.id);
      this.dataStore.set(this.position.x, this.position.z, x, y, z, blocks.empty.id);
    }
  }

  /**
   * Create a new instance for the block at (x,y,z)
   * @param {number} x 
   * @param {number} y 
   * @param {number} z 
   */
  addBlockInstance(x, y, z) {
    const block = this.getBlock(x, y, z);

    // If this block is non-empty and does not already have an instance, create a new one
    if (block && block.id !== blocks.empty.id && !block.instanceId) {
      // Append a new instance to the end of our InstancedMesh
      const instanceId = this.mesh.count++;
      this.setBlockInstanceId(x, y, z, instanceId);

      // Update the appropriate instanced mesh
      // Also re-compute the bounding sphere so raycasting works
      const matrix = new THREE.Matrix4();
      matrix.setPosition(x, y, z);
      this.texIdx[instanceId] = getTextureIndex(block.id);
      this.mesh.setMatrixAt(instanceId, matrix);
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.computeBoundingSphere();
    }
  }

  /**
   * Removes the mesh instance associated with `block` by swapping it
   * with the last instance and decrementing the instance count.
   * @param {number} x 
   * @param {number} y 
   * @param {number} z 
   * @param {{ id: number, instanceId: number }} block 
   */
  deleteBlockInstance(x, y, z) {
    const block = this.getBlock(x, y, z);

    if (block.id === blocks.empty.id || !block.instanceId) return;

    const instanceId = block.instanceId;

    // We can't remove an instance directly, so we swap it with the last instance
    // and decrease the count by 1. We need to do two things:
    //   1. Swap the matrix of the last instance with the matrix at `instanceId`
    //   2. Set the instanceId for the last instance to `instanceId`
    const lastMatrix = new THREE.Matrix4();
    this.mesh.getMatrixAt(this.mesh.count - 1, lastMatrix);

    // Also need to get the block coordinates of the instance
    // to update the instance id for that block
    const v = new THREE.Vector3();
    v.setFromMatrixPosition(lastMatrix);
    this.setBlockInstanceId(v.x, v.y, v.z, instanceId);

    // Swap the transformation matrices
    this.mesh.setMatrixAt(instanceId, lastMatrix);

    this.texIdx[instanceId] = this.texIdx[this.mesh.count - 1];

    // Decrease the mesh count to "delete" the block
    this.mesh.count--;

    // Notify the instanced mesh we updated the instance matrix
    // Also re-compute the bounding sphere so raycasting works
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();

    this.setBlockInstanceId(x, y, z, undefined);
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