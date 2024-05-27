import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { World } from './world';
import { blocks } from './blocks';

const CENTER_SCREEN = new THREE.Vector2();

export class Player {
  height = 1.75;
  radius = 0.5;
  maxSpeed = 5;

  jumpSpeed = 10;
  sprinting = false;
  onGround = false;

  input = new THREE.Vector3();
  velocity = new THREE.Vector3();
  #worldVelocity = new THREE.Vector3();

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
  cameraHelper = new THREE.CameraHelper(this.camera);
  controls = new PointerLockControls(this.camera, document.body);
  debugCamera = false;

  raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(), 0, 3);
  selectedCoords = null;
  activeBlockId = blocks.empty.id;

  tool = {
    // Group that will contain the tool mesh
    container: new THREE.Group(),
    // Whether or not the tool is currently animating
    animate: false,
    // The time the animation was started
    animationStart: 0,
    // The rotation speed of the tool
    animationSpeed: 0.025,
    // Reference to the current animation
    animation: null
  }

  constructor(scene, world) {
    this.world = world;
    this.position.set(32, 32, 32);
    this.cameraHelper.visible = false;
    scene.add(this.camera);
    scene.add(this.cameraHelper);

    // Hide/show instructions based on pointer controls locking/unlocking
    this.controls.addEventListener('lock', this.onCameraLock.bind(this));
    this.controls.addEventListener('unlock', this.onCameraUnlock.bind(this));

    // The tool is parented to the camera
    this.camera.add(this.tool.container);

    // Set raycaster to use layer 0 so it doesn't interact with water mesh on layer 1
    this.raycaster.layers.set(0);
    this.camera.layers.enable(1);

    // Wireframe mesh visualizing the player's bounding cylinder
    this.boundsHelper = new THREE.Mesh(
      new THREE.CylinderGeometry(this.radius, this.radius, this.height, 16),
      new THREE.MeshBasicMaterial({ wireframe: true })
    );
    this.boundsHelper.visible = false;
    scene.add(this.boundsHelper);

    // Helper used to highlight the currently active block
    const selectionMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.3,
      color: 0xffffaa
    });
    const selectionGeometry = new THREE.BoxGeometry(1.01, 1.01, 1.01);
    this.selectionHelper = new THREE.Mesh(selectionGeometry, selectionMaterial);
    scene.add(this.selectionHelper);

    // Add event listeners for keyboard/mouse events
    document.addEventListener('keyup', this.onKeyUp.bind(this));
    document.addEventListener('keydown', this.onKeyDown.bind(this));
    document.addEventListener('mousedown', this.onMouseDown.bind(this));
  }

  onCameraLock() {
    document.getElementById('overlay').style.visibility = 'hidden';
  }

  onCameraUnlock() {
    if (!this.debugCamera) {
      document.getElementById('overlay').style.visibility = 'visible';
    }
  }

  /**
   * Updates the state of the player
   * @param {World} world 
   */
  update(world) {
    this.updateBoundsHelper();
    this.updateRaycaster(world);

    if (this.tool.animate) {
      this.updateToolAnimation();
    }
  }

  /**
   * Updates the raycaster used for block selection
   * @param {World} world 
   */
  updateRaycaster(world) {
    this.raycaster.setFromCamera(CENTER_SCREEN, this.camera);
    const intersections = this.raycaster.intersectObject(world, true);

    if (intersections.length > 0) {
      const intersection = intersections[0];

      // Get the chunk associated with the selected block
      const chunk = intersection.object.parent;

      // Get the transformation matrix for the selected block
      const blockMatrix = new THREE.Matrix4();
      intersection.object.getMatrixAt(intersection.instanceId, blockMatrix);

      // Set the selected coordinates to the origin of the chunk,
      // then apply the transformation matrix of the block to get
      // the block coordinates
      this.selectedCoords = chunk.position.clone();
      this.selectedCoords.applyMatrix4(blockMatrix);

      if (this.activeBlockId !== blocks.empty.id) {
        // If we are adding a block, move it 1 block over in the direction
        // of where the ray intersected the cube
        this.selectedCoords.add(intersection.normal);
      }

      this.selectionHelper.position.copy(this.selectedCoords);
      this.selectionHelper.visible = true;
    } else {
      this.selectedCoords = null;
      this.selectionHelper.visible = false;
    }
  }

  /**
   * Updates the state of the player based on the current user inputs
   * @param {Number} dt 
   */
  applyInputs(dt) {
    if (this.controls.isLocked === true) {
      this.velocity.x = this.input.x * (this.sprinting ? 1.5 : 1);
      this.velocity.z = this.input.z * (this.sprinting ? 1.5 : 1);
      this.controls.moveRight(this.velocity.x * dt);
      this.controls.moveForward(this.velocity.z * dt);
      this.position.y += this.velocity.y * dt;

      if (this.position.y < 0) {
        this.position.y = 0;
        this.velocity.y = 0;
      }
    }

    document.getElementById('info-player-position').innerHTML = this.toString();
  }

  /**
   * Updates the position of the player's bounding cylinder helper
   */
  updateBoundsHelper() {
    this.boundsHelper.position.copy(this.camera.position);
    this.boundsHelper.position.y -= this.height / 2;
  }

  /**
   * Set the tool object the player is holding
   * @param {THREE.Mesh} tool 
   */
  setTool(tool) {
    this.tool.container.clear();
    this.tool.container.add(tool);
    this.tool.container.receiveShadow = true;
    this.tool.container.castShadow = true;

    this.tool.container.position.set(0.6, -0.3, -0.5);
    this.tool.container.scale.set(0.5, 0.5, 0.5);
    this.tool.container.rotation.z = Math.PI / 2;
    this.tool.container.rotation.y = Math.PI + 0.2;
  }

  /**
   * Animates the tool rotation
   */
  updateToolAnimation() {
    if (this.tool.container.children.length > 0) {
      const t = this.tool.animationSpeed * (performance.now() - this.tool.animationStart);
      this.tool.container.children[0].rotation.y = 0.5 * Math.sin(t);
    }
  }

  /**
   * Returns the current world position of the player
   * @returns {THREE.Vector3}
   */
  get position() {
    return this.camera.position;
  }

  /**
   * Returns the velocity of the player in world coordinates
   * @returns {THREE.Vector3}
   */
  get worldVelocity() {
    this.#worldVelocity.copy(this.velocity);
    this.#worldVelocity.applyEuler(new THREE.Euler(0, this.camera.rotation.y, 0));
    return this.#worldVelocity;
  }

  /**
   * Applies a change in velocity 'dv' that is specified in the world frame
   * @param {THREE.Vector3} dv 
   */
  applyWorldDeltaVelocity(dv) {
    dv.applyEuler(new THREE.Euler(0, -this.camera.rotation.y, 0));
    this.velocity.add(dv);
  }

  /**
   * Event handler for 'keyup' event
   * @param {KeyboardEvent} event 
   */
  onKeyDown(event) {
    if (!this.controls.isLocked) {
      this.debugCamera = false;
      this.controls.lock();
    }

    switch (event.code) {
      case 'Digit0':
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
      case 'Digit5':
      case 'Digit6':
      case 'Digit7':
      case 'Digit8':
        // Update the selected toolbar icon
        document.getElementById(`toolbar-${this.activeBlockId}`)?.classList.remove('selected');
        document.getElementById(`toolbar-${event.key}`)?.classList.add('selected');

        this.activeBlockId = Number(event.key);

        // Update the pickaxe visibility
        this.tool.container.visible = (this.activeBlockId === 0);

        break;
      case 'KeyW':
        this.input.z = this.maxSpeed;
        break;
      case 'KeyA':
        this.input.x = -this.maxSpeed;
        break;
      case 'KeyS':
        this.input.z = -this.maxSpeed;
        break;
      case 'KeyD':
        this.input.x = this.maxSpeed;
        break;
      case 'KeyR':
        if (this.repeat) break;
        this.position.y = 32;
        this.velocity.set(0, 0, 0);
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.sprinting = true;
        break;
      case 'Space':
        if (this.onGround) {
          this.velocity.y += this.jumpSpeed;
        }
        break;
      case 'F10':
        this.debugCamera = true;
        this.controls.unlock();
        break;
    }
  }

  /**
   * Event handler for 'keyup' event
   * @param {KeyboardEvent} event 
   */
  onKeyUp(event) {
    switch (event.code) {
      case 'KeyW':
        this.input.z = 0;
        break;
      case 'KeyA':
        this.input.x = 0;
        break;
      case 'KeyS':
        this.input.z = 0;
        break;
      case 'KeyD':
        this.input.x = 0;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.sprinting = false;
        break;
    }
  }

  /**
   * Event handler for 'mousedown'' event
   * @param {MouseEvent} event 
   */
  onMouseDown(event) {
    if (this.controls.isLocked) {
      // Is a block selected?
      if (this.selectedCoords) {
        // If active block is an empty block, then we are in delete mode
        if (this.activeBlockId === blocks.empty.id) {
          this.world.removeBlock(
            this.selectedCoords.x,
            this.selectedCoords.y,
            this.selectedCoords.z
          );
        } else {
          this.world.addBlock(
            this.selectedCoords.x,
            this.selectedCoords.y,
            this.selectedCoords.z,
            this.activeBlockId
          );
        }

        // If the tool isn't currently animating, trigger the animation
        if (!this.tool.animate) {
          this.tool.animate = true;
          this.tool.animationStart = performance.now();

          // Clear the existing timeout so it doesn't cancel our new animation
          clearTimeout(this.tool.animation);

          // Stop the animation after 1.5 cycles
          this.tool.animation = setTimeout(() => {
            this.tool.animate = false;
          }, 3 * Math.PI / this.tool.animationSpeed);
        }
      }
    }
  }

  /**
   * Returns player position in a readable string form
   * @returns {string}
   */
  toString() {
    let str = '';
    str += `X: ${this.position.x.toFixed(3)} `;
    str += `Y: ${this.position.y.toFixed(3)} `;
    str += `Z: ${this.position.z.toFixed(3)}`;
    return str;
  }
}