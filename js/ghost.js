// The see-through car that replays a stored Time Trial lap (see ghostLap.js).

import { CarModel } from './carModel.js';
import { ghostPose } from './ghostLap.js';

export { GhostRecorder, loadGhost, saveGhostIfFaster } from './ghostLap.js';

/** The see-through car that drives the stored lap. */
export class GhostCar {
  constructor(scene, def, look, ghost) {
    this.ghost = ghost;
    this.model = new CarModel(def, { ...look, underglow: 'off' });
    this.root = this.model.root;
    this.root.traverse((obj) => {
      if (obj.isLight) obj.visible = false;
      if (!obj.isMesh) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        mat.transparent = true;
        mat.opacity = 0.32;
        mat.depthWrite = false;
      }
    });
    this.root.visible = false;
    scene.add(this.root);
  }

  /** Show the ghost `lapTime` seconds into its lap, or hide it. */
  update(lapTime, visible) {
    const show = visible && lapTime <= this.ghost.time;
    this.root.visible = show;
    if (!show) return;
    const pose = ghostPose(this.ghost, lapTime);
    this.root.position.set(pose.x, 0, pose.z);
    this.root.rotation.y = pose.heading;
  }

  dispose() {
    this.root.removeFromParent();
    this.root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => m?.dispose());
    });
    this.model.dispose?.();
  }
}
