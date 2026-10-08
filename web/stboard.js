// stboard.js — the ONE authoritative world state ("Shared World" demo).
//
// CORE INVARIANT: there is exactly one STBoard. Every agent's view is a
// deterministic function of (this state + that agent's camera pose). Nothing
// here is a neural net; we own all of it. Option C renders this with three.js;
// Option A reuses this file UNCHANGED and only swaps the renderer. Keep this
// module renderer-agnostic — no three.js imports, no DOM, just data + kinematics.

// ---------------------------------------------------------------------------
// Environment presets. An "environment" is just a different STBoard layout +
// prompt (see CLAUDE.md §8). Structure is identical across environments, so
// consistency is automatic.
// ---------------------------------------------------------------------------
export const ENVIRONMENTS = {
  street: {
    label: "City Street",
    prompt: "two people walking side by side, city street, daytime",
    ground: { size: 40, color: 0x3a3f4b },
    sky: 0x9fc4e8,
    // obstacles: axis-aligned boxes {pos:[x,z], size:[w,d], height, color}
    obstacles: [
      { pos: [-8, -8], size: [5, 5], height: 7, color: 0x8a8f99 },
      { pos: [8, -8], size: [5, 5], height: 9, color: 0x9aa0ab },
      { pos: [-8, 8], size: [5, 5], height: 6, color: 0x7d828d },
      { pos: [8, 8], size: [5, 5], height: 8, color: 0x8a8f99 },
      { pos: [0, 14], size: [3, 3], height: 5, color: 0x9aa0ab },
    ],
    door: { pos: [0, -4], yaw: 0, color: 0xd98c3b },
  },
  forest: {
    label: "Forest Path",
    prompt: "two people walking side by side, forest path, dappled light",
    ground: { size: 40, color: 0x2f4a2f },
    sky: 0xbfe0c8,
    obstacles: [
      { pos: [-6, -6], size: [1.6, 1.6], height: 6, color: 0x5a3d26 },
      { pos: [6, -9], size: [1.6, 1.6], height: 7, color: 0x5a3d26 },
      { pos: [-10, 4], size: [1.6, 1.6], height: 8, color: 0x4a3420 },
      { pos: [9, 7], size: [1.6, 1.6], height: 6, color: 0x5a3d26 },
      { pos: [2, 11], size: [1.6, 1.6], height: 7, color: 0x4a3420 },
      { pos: [-3, -12], size: [1.6, 1.6], height: 6, color: 0x5a3d26 },
    ],
    door: { pos: [0, -4], yaw: 0, color: 0xc9a24b },
  },
  room: {
    label: "Indoor Room",
    prompt: "two people walking side by side, indoor room with a door",
    ground: { size: 24, color: 0x6b5d4f },
    sky: 0x2a2a30,
    // four perimeter walls with a gap on the -z side for the door
    obstacles: [
      { pos: [0, -12], size: [24, 0.6], height: 5, color: 0xbfae99 }, // back wall (door sits in front)
      { pos: [0, 12], size: [24, 0.6], height: 5, color: 0xbfae99 }, // front wall
      { pos: [-12, 0], size: [0.6, 24], height: 5, color: 0xbfae99 }, // left wall
      { pos: [12, 0], size: [0.6, 24], height: 5, color: 0xbfae99 }, // right wall
    ],
    door: { pos: [0, -6], yaw: 0, color: 0x8a5a2b },
  },
};

// Tunable kinematics (shared by both players so the demo stays symmetric).
const MOVE_SPEED = 6.0; // world units / second
const TURN_SPEED = 2.4; // radians / second
const AGENT_RADIUS = 0.45; // for collision against obstacles
const EYE_HEIGHT = 1.6;
const INTERACT_RANGE = 2.6; // how close you must be to toggle the door

export class STBoard {
  constructor(envName = "street") {
    this.setEnvironment(envName);
  }

  // Load an environment preset. Resets the world + door, but keeps the two
  // agents and drops them at sensible side-by-side spawn points.
  setEnvironment(envName) {
    const env = ENVIRONMENTS[envName] || ENVIRONMENTS.street;
    this.envName = ENVIRONMENTS[envName] ? envName : "street";
    this.env = env;
    this.ground = { ...env.ground };
    this.sky = env.sky;
    this.prompt = env.prompt;
    // deep copy obstacles so runtime never mutates the preset
    this.obstacles = env.obstacles.map((o) => ({
      pos: [...o.pos],
      size: [...o.size],
      height: o.height,
      color: o.color,
    }));
    // the single shared, mutable interaction (the "money shot" consistency proof)
    this.door = { ...env.door, open: false };

    // Two agents, spawned side by side facing +z (into the scene).
    this.agents = [
      { id: 0, pos: [-2, 0, 6], yaw: Math.PI, color: 0x4fd1ff, name: "Player 1" },
      { id: 1, pos: [2, 0, 6], yaw: Math.PI, color: 0xff8f5f, name: "Player 2" },
    ];
  }

  getAgent(id) {
    return this.agents.find((a) => a.id === id);
  }

  // --- World evolution: classical, exact. Apply one agent's action for dt. ---
  // action = { forward: -1..1, strafe: -1..1, turn: -1..1 }
  applyAction(agentId, action, dt) {
    const a = this.getAgent(agentId);
    if (!a) return;

    // turn first
    a.yaw += (action.turn || 0) * TURN_SPEED * dt;

    // movement is relative to facing (yaw about +y). Forward = -z at yaw 0.
    const sin = Math.sin(a.yaw);
    const cos = Math.cos(a.yaw);
    const fwd = (action.forward || 0) * MOVE_SPEED * dt;
    const str = (action.strafe || 0) * MOVE_SPEED * dt;

    // forward vector (fx,fz), right vector (rx,rz)
    const fx = -sin * fwd + cos * str;
    const fz = -cos * fwd - sin * str;

    const nx = a.pos[0] + fx;
    const nz = a.pos[2] + fz;

    // resolve collisions per-axis so you slide along walls instead of sticking
    const resolved = this._resolve(a.pos[0], a.pos[2], nx, nz);
    a.pos[0] = resolved[0];
    a.pos[2] = resolved[1];
  }

  // Try to move to (nx,nz) from (ox,oz); clamp to bounds + push out of boxes.
  _resolve(ox, oz, nx, nz) {
    const half = this.ground.size / 2 - AGENT_RADIUS;
    // axis-separated: test X move then Z move for wall-sliding
    let x = this._axisClear(oz, ox, nx, "x") ? nx : ox;
    let z = this._axisClear(x, oz, nz, "z") ? nz : oz;
    // world bounds
    x = Math.max(-half, Math.min(half, x));
    z = Math.max(-half, Math.min(half, z));
    return [x, z];
  }

  // Returns true if moving the varied axis to `to` keeps the agent circle clear
  // of every (closed) obstacle. `fixed` is the other axis value.
  _axisClear(fixed, from, to, axis) {
    const px = axis === "x" ? to : fixed;
    const pz = axis === "x" ? fixed : to;
    for (const o of this.obstacles) {
      if (this._circleHitsBox(px, pz, o)) return false;
    }
    // the door blocks only while closed
    if (!this.door.open && this._circleHitsBox(px, pz, this._doorBox())) {
      return false;
    }
    return true;
  }

  _doorBox() {
    return { pos: [this.door.pos[0], this.door.pos[1]], size: [2.0, 0.4] };
  }

  _circleHitsBox(px, pz, box) {
    const hw = box.size[0] / 2;
    const hd = box.size[1] / 2;
    const cx = box.pos[0];
    const cz = box.pos[1];
    // closest point on the box to the circle center
    const clampedX = Math.max(cx - hw, Math.min(px, cx + hw));
    const clampedZ = Math.max(cz - hd, Math.min(pz, cz + hd));
    const dx = px - clampedX;
    const dz = pz - clampedZ;
    return dx * dx + dz * dz < AGENT_RADIUS * AGENT_RADIUS;
  }

  // --- The shared interaction. Any agent near the door can toggle it, and the
  // change lives in the ONE state, so every view reflects it. ---
  tryToggleDoor(agentId) {
    const a = this.getAgent(agentId);
    if (!a) return false;
    const dx = a.pos[0] - this.door.pos[0];
    const dz = a.pos[2] - this.door.pos[1];
    if (dx * dx + dz * dz <= INTERACT_RANGE * INTERACT_RANGE) {
      this.door.open = !this.door.open;
      return true;
    }
    return false;
  }

  // Camera pose for an agent — the bridge to BOTH renderers.
  // Returns position (eye) + a look-at target in world space.
  cameraPose(agentId) {
    const a = this.getAgent(agentId);
    const sin = Math.sin(a.yaw);
    const cos = Math.cos(a.yaw);
    const eye = [a.pos[0], EYE_HEIGHT, a.pos[2]];
    const target = [a.pos[0] - sin, EYE_HEIGHT, a.pos[2] - cos];
    return { eye, target, yaw: a.yaw };
  }
}

export const CONSTANTS = { MOVE_SPEED, TURN_SPEED, AGENT_RADIUS, EYE_HEIGHT, INTERACT_RANGE };
