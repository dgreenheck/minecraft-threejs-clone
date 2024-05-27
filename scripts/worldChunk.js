import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { RNG } from './rng';
import { blocks, resources } from './blocks';

const geometry = new THREE.BoxGeometry();

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
    this.loaded = false;
    this.size = size;
    this.params = params;
    this.dataStore = dataStore;
  }

  /**
    * Generates the world data and meshes
    */
  generate() {
    const start = performance.now();

    const rng = new RNG(this.params.seed);
    this.initializeTerrain();
    this.generateTerrain(rng);
    this.generateClouds(rng);
    this.loadPlayerChanges();
    this.generateMeshes();

    this.loaded = true;

    //console.log(`Loaded chunk in ${performance.now() - start}ms`);
  }

  /**
    * Initializes an empty world
    */
  initializeTerrain() {
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
   * Get the biome at the local chunk coordinates (x,z)
   * @param {SimplexNoise} simplex 
   * @param {number} x 
   * @param {number} z 
   */
  getBiome(simplex, x, z) {
    let noise = 0.5 * simplex.noise(
      (this.position.x + x) / this.params.biomes.scale,
      (this.position.z + z) / this.params.biomes.scale
    ) + 0.5;

    noise += this.params.biomes.variation.amplitude * (simplex.noise(
      (this.position.x + x) / this.params.biomes.variation.scale,
      (this.position.z + z) / this.params.biomes.variation.scale
    ));

    if (noise < this.params.biomes.tundraToTemperate) {
      return 'Tundra';
    } else if (noise < this.params.biomes.temperateToJungle) {
      return 'Temperate';
    } else if (noise < this.params.biomes.jungleToDesert) {
      return 'Jungle';
    } else {
      return 'Desert';
    }
  }

  /**
   * Generates the terrain data for the world
   */
  generateTerrain(rng) {
    const simplex = new SimplexNoise(rng);
    for (let x = 0; x < this.size.width; x++) {
      for (let z = 0; z < this.size.width; z++) {
        const biome = this.getBiome(simplex, x, z);

        // Compute the noise value at this x-z location
        const value = simplex.noise(
          (this.position.x + x) / this.params.terrain.scale,
          (this.position.z + z) / this.params.terrain.scale
        );

        // Scale the noise based on the magnitude/offset
        const scaledNoise = this.params.terrain.offset +
          this.params.terrain.magnitude * value;

        // Computing the height of the terrain at this x-z location
        let height = Math.floor(scaledNoise);

        // Clamping height between 0 and max height
        height = Math.max(0, Math.min(height, this.size.height - 1));

        // Fill in all blocks at or below the terrain height
        for (let y = this.size.height; y >= 0; y--) {
          if (y <= this.params.terrain.waterOffset && y === height) {
            this.setBlockId(x, y, z, blocks.sand.id);
          } else if (y === height) {
            let groundBlockType;
            if (biome === 'Desert') {
              groundBlockType = blocks.sand.id;
            } else if (biome === 'Temperate' || biome === 'Jungle') {
              groundBlockType = blocks.grass.id;
            } else if (biome === 'Tundra') {
              groundBlockType = blocks.snow.id;
            } else if (biome === 'Jungle') {
              groundBlockType = blocks.jungleGrass.id;
            }

            this.setBlockId(x, y, z, groundBlockType);

            // Randomly generate a tree
            if (rng.random() < this.params.trees.frequency) {
              this.generateTree(rng, biome, x, height + 1, z);
            }
          } else if (y < height && this.getBlock(x, y, z).id === blocks.empty.id) {
            this.generateResourceIfNeeded(simplex, x, y, z);
          }
        }
      }
    }
  }

  /**
   * Determines if a resource block should be generated at (x, y, z)
   * @param {SimplexNoise} simplex 
   * @param {number} x 
   * @param {number} y 
   * @param {number} z 
   */
  generateResourceIfNeeded(simplex, x, y, z) {
    this.setBlockId(x, y, z, blocks.dirt.id);
    resources.forEach(resource => {
      const value = simplex.noise3d(
        (this.position.x + x) / resource.scale.x,
        (this.position.y + y) / resource.scale.y,
        (this.position.z + z) / resource.scale.z);

      if (value > resource.scarcity) {
        this.setBlockId(x, y, z, resource.id);
      }
    });
  }

  /**
   * Creates a tree appropriate for the biome at (x, y, z)
   * @param {string} biome
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  generateTree(rng, biome, x, y, z) {
    const minH = this.params.trees.trunk.minHeight;
    const maxH = this.params.trees.trunk.maxHeight;
    const h = Math.round(minH + (maxH - minH) * rng.random());

    for (let treeY = y; treeY < y + h; treeY++) {
      if (biome === 'Temperate' || biome === 'Tundra') {
        this.setBlockId(x, treeY, z, blocks.tree.id);
      } else if (biome === 'Jungle') {
        this.setBlockId(x, treeY, z, blocks.jungleTree.id);
      } else if (biome === 'Desert') {
        this.setBlockId(x, treeY, z, blocks.cactus.id);
      }
    }

    // Generate canopy centered on the top of the tree
    if (biome === 'Temperate' || biome === 'Jungle') {
      this.generateTreeCanopy(biome, x, y + h, z, rng);
    }
  }

  generateTreeCanopy(biome, centerX, centerY, centerZ, rng) {
    const minR = this.params.trees.canopy.minRadius;
    const maxR = this.params.trees.canopy.maxRadius;
    const r = Math.round(minR + (maxR - minR) * rng.random());

    for (let x = -r; x <= r; x++) {
      for (let y = -r; y <= r; y++) {
        for (let z = -r; z <= r; z++) {
          const n = rng.random();

          // Make sure the block is within the canopy radius
          if (x * x + y * y + z * z > r * r) continue;
          // Don't overwrite an existing block
          const block = this.getBlock(centerX + x, centerY + y, centerZ + z);
          if (block && block.id !== blocks.empty.id) continue;
          // Fill in the tree canopy with leaves based on the density parameter
          if (n < this.params.trees.canopy.density) {
            if (biome === 'Temperate') {
              this.setBlockId(centerX + x, centerY + y, centerZ + z, blocks.leaves.id);
            } else if (biome === 'Jungle') {
              this.setBlockId(centerX + x, centerY + y, centerZ + z, blocks.jungleLeaves.id);
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
        const value = (simplex.noise(
          (this.position.x + x) / this.params.clouds.scale,
          (this.position.z + z) / this.params.clouds.scale
        ) + 1) * 0.5;

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
          if (this.dataStore.contains(this.position.x, this.position.z, x, y, z)) {
            const blockId = this.dataStore.get(this.position.x, this.position.z, x, y, z);
            this.setBlockId(x, y, z, blockId);
          }
        }
      }
    }
  }

  generateWater() {
    const material = new THREE.MeshLambertMaterial({
      color: 0x9090e0,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    });

    const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(), material);
    waterMesh.rotateX(-Math.PI / 2.0);
    waterMesh.position.set(
      this.size.width / 2,
      this.params.terrain.waterOffset + 0.4,
      this.size.width / 2
    );
    waterMesh.scale.set(this.size.width, this.size.width, 1);
    waterMesh.layers.set(1);

    this.add(waterMesh);
  }

  /**
    * Generates the 3D representation of the world from the world data
    */
  generateMeshes() {
    this.clear();

    this.generateWater();

    const maxCount = this.size.width * this.size.width * this.size.height;

    // Creating a lookup table where the key is the block id
    const meshes = {};
    Object.values(blocks)
      .filter(blockType => blockType.id !== blocks.empty.id)
      .forEach(blockType => {
        const mesh = new THREE.InstancedMesh(geometry, blockType.material, maxCount);
        mesh.name = blockType.id;
        mesh.count = 0;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        meshes[blockType.id] = mesh;
      });

    const matrix = new THREE.Matrix4();
    for (let x = 0; x < this.size.width; x++) {
      for (let y = 0; y < this.size.height; y++) {
        for (let z = 0; z < this.size.width; z++) {
          const blockId = this.getBlock(x, y, z).id;

          if (blockId === blocks.empty.id) continue;

          const mesh = meshes[blockId];
          const instanceId = mesh.count;

          if (!this.isBlockObscured(x, y, z)) {
            matrix.setPosition(x, y, z);
            mesh.setMatrixAt(instanceId, matrix);
            this.setBlockInstanceId(x, y, z, instanceId);
            mesh.count++;
          }
        }
      }
    }

    this.add(...Object.values(meshes));
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
   * Adds a new block at (x,y,z) of type `blockId`
   * @param {number} x 
   * @param {number} y 
   * @param {number} z 
   * @param {number} blockId 
   */
  addBlock(x, y, z, blockId) {
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
      this.deleteBlockInstance(x, y, z);
      this.setBlockId(x, y, z, blocks.empty.id);
      this.dataStore.set(this.position.x, this.position.z, x, y, z, blocks.empty.id);
    }
  }

  /**
   * Removes the mesh instance associated with `block` by swapping it
   * with the last instance and decrementing the instance count.
   * @param {number} x 
   * @param {number} y 
   * @param {number} z 
   */
  deleteBlockInstance(x, y, z) {
    const block = this.getBlock(x, y, z);

    if (block.id === blocks.empty.id || block.instanceId === null) return;

    // Get the mesh and instance id of the block
    const mesh = this.children.find((instanceMesh) => instanceMesh.name === block.id);
    const instanceId = block.instanceId;

    // Swapping the transformation matrix of the block in the last position
    // with the block that we are going to remove
    const lastMatrix = new THREE.Matrix4();
    mesh.getMatrixAt(mesh.count - 1, lastMatrix);

    // Updating the instance id of the block in the last position to its new instance id
    const v = new THREE.Vector3();
    v.applyMatrix4(lastMatrix);
    this.setBlockInstanceId(v.x, v.y, v.z, instanceId);

    // Swapping the transformation matrices
    mesh.setMatrixAt(instanceId, lastMatrix);

    // This effectively removes the last instance from the scene
    mesh.count--;

    // Notify the instanced mesh we updated the instance matrix
    // Also re-compute the bounding sphere so raycasting works
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();

    // Remove the instance associated with the block and update the data model
    this.setBlockInstanceId(x, y, z, null);
  }

  /**
   * Create a new instance for the block at (x,y,z)
   * @param {number} x 
   * @param {number} y 
   * @param {number} z 
   */
  addBlockInstance(x, y, z) {
    const block = this.getBlock(x, y, z);

    // Verify the block exists, it isn't an empty block type, and it doesn't already have an instance
    if (block && block.id !== blocks.empty.id && block.instanceId === null) {
      // Get the mesh and instance id of the block
      const mesh = this.children.find((instanceMesh) => instanceMesh.name === block.id);
      const instanceId = mesh.count++;
      this.setBlockInstanceId(x, y, z, instanceId);

      // Compute the transformation matrix for the new instance and update the instanced
      const matrix = new THREE.Matrix4();
      matrix.setPosition(x, y, z);
      mesh.setMatrixAt(instanceId, matrix);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
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

  disposeInstances() {
    this.traverse((obj) => {
      if (obj.dispose) obj.dispose();
    });
    this.clear();
  }
}