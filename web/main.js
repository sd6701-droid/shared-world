// main.js — Option C renderer: classical three.js render of the ONE STBoard.
// Two agents, two cameras, split-screen, mutually consistent (literally one scene).
//
// This file is the ONLY thing Option A replaces. It reads the STBoard and draws
// it; it never invents world content. See CLAUDE.md §2, §4.

import * as THREE from "three";
import { STBoard, ENVIRONMENTS, CONSTANTS } from "./stboard.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const board = new STBoard("street");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById("app").appendChild(renderer.domElement);

// One scene, rebuilt when the environment changes. Agent avatars + door are
// kept as handles so we can sync them to the STBoard every frame.
let scene, cam0, cam1, minimapCam;
let avatars = []; // [{group, nose}] indexed by agent id
let doorPivot = null;
const envObjects = []; // obstacles/ground/lights to dispose on env swap

function makeCamera() {
  const c = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
  return c;
}

function buildScene() {
  // dispose previous
  if (scene) {
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
  }
  scene = new THREE.Scene();
  scene.background = new THREE.Color(board.sky);
  scene.fog = new THREE.Fog(board.sky, 30, 80);
  avatars = [];
  envObjects.length = 0;

  // lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(12, 24, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = board.ground.size;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.far = 80;
  scene.add(sun);

  // ground
  const groundGeo = new THREE.PlaneGeometry(board.ground.size, board.ground.size);
  const groundMat = new THREE.MeshStandardMaterial({ color: board.ground.color, roughness: 0.95 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // a subtle grid so motion + "one world" is readable
  const grid = new THREE.GridHelper(board.ground.size, board.ground.size / 2, 0x000000, 0x000000);
  grid.material.opacity = 0.12;
  grid.material.transparent = true;
  grid.position.y = 0.01;
  scene.add(grid);

  // obstacles
  for (const o of board.obstacles) {
    const geo = new THREE.BoxGeometry(o.size[0], o.height, o.size[1]);
    const mat = new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.8 });
    const box = new THREE.Mesh(geo, mat);
    box.position.set(o.pos[0], o.height / 2, o.pos[1]);
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(box);
  }

  // door (a swinging panel on a pivot so "open" is unmistakable)
  doorPivot = new THREE.Group();
  const doorW = 1.8;
  const doorH = 3.0;
  // hinge at the left edge of the doorway
  doorPivot.position.set(board.door.pos[0] - doorW / 2, 0, board.door.pos[1]);
  const doorGeo = new THREE.BoxGeometry(doorW, doorH, 0.18);
  const doorMat = new THREE.MeshStandardMaterial({ color: board.door.color, roughness: 0.6, metalness: 0.1 });
  const doorMesh = new THREE.Mesh(doorGeo, doorMat);
  doorMesh.position.set(doorW / 2, doorH / 2, 0);
  doorMesh.castShadow = true;
  doorPivot.add(doorMesh);
  // a bright frame so the doorway reads even when the door is open
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222, roughness: 0.4 });
  const postGeo = new THREE.BoxGeometry(0.16, doorH + 0.3, 0.3);
  const lPost = new THREE.Mesh(postGeo, frameMat);
  lPost.position.set(board.door.pos[0] - doorW / 2 - 0.1, (doorH + 0.3) / 2, board.door.pos[1]);
  const rPost = new THREE.Mesh(postGeo, frameMat);
  rPost.position.set(board.door.pos[0] + doorW / 2 + 0.1, (doorH + 0.3) / 2, board.door.pos[1]);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.5, 0.2, 0.3), frameMat);
  lintel.position.set(board.door.pos[0], doorH + 0.25, board.door.pos[1]);
  scene.add(lPost, rPost, lintel, doorPivot);

  // agent avatars: a colored body + head + a forward "nose" cone (facing cue)
  for (const a of board.agents) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: a.color, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.9, 6, 12), bodyMat);
    body.position.y = 0.95;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), bodyMat);
    head.position.y = 1.75;
    head.castShadow = true;
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x333333 });
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 12), noseMat);
    nose.rotation.x = -Math.PI / 2; // point along -z (forward at yaw 0)
    nose.position.set(0, 1.75, -0.45);
    g.add(body, head, nose);
    scene.add(g);
    avatars[a.id] = { group: g };
  }

  // cameras
  cam0 = makeCamera();
  cam1 = makeCamera();
  minimapCam = new THREE.OrthographicCamera(-s / 2, s / 2, s / 2, -s / 2, 0.1, 200);
  minimapCam.position.set(0, 60, 0);
  minimapCam.up.set(0, 0, -1);
  minimapCam.lookAt(0, 0, 0);
}

// Push STBoard state into the three.js meshes (cheap; runs every frame).
function syncScene() {
  for (const a of board.agents) {
    const av = avatars[a.id];
    av.group.position.set(a.pos[0], 0, a.pos[2]);
    av.group.rotation.y = a.yaw;
  }
  // door swings to 90° when open
  const targetAngle = board.door.open ? -Math.PI / 2 : 0;
  doorPivot.rotation.y += (targetAngle - doorPivot.rotation.y) * 0.25;

  for (const id of [0, 1]) {
    const pose = board.cameraPose(id);
    const cam = id === 0 ? cam0 : cam1;
    cam.position.set(pose.eye[0], pose.eye[1], pose.eye[2]);
    cam.lookAt(pose.target[0], pose.target[1], pose.target[2]);
  }
}

// ---------------------------------------------------------------------------
// Input — two players on one keyboard (CLAUDE.md C4)
// ---------------------------------------------------------------------------
const keys = new Set();
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  // prevent page scroll on arrows/space
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
  // edge-triggered door toggles
  if (k === " " && !keys.has(" ")) flashToggle(board.tryToggleDoor(0), 0);
  if (k === "enter" && !keys.has("enter")) flashToggle(board.tryToggleDoor(1), 1);
  keys.add(k);
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

function actionFor(agentId) {
  let forward = 0,
    strafe = 0,
    turn = 0;
  if (agentId === 0) {
    if (keys.has("w")) forward += 1;
    if (keys.has("s")) forward -= 1;
    if (keys.has("a")) strafe -= 1;
    if (keys.has("d")) strafe += 1;
    if (keys.has("q")) turn += 1;
    if (keys.has("e")) turn -= 1;
  } else {
    if (keys.has("arrowup")) forward += 1;
    if (keys.has("arrowdown")) forward -= 1;
    if (keys.has("arrowleft")) strafe -= 1;
    if (keys.has("arrowright")) strafe += 1;
    if (keys.has(",")) turn += 1;
    if (keys.has(".")) turn -= 1;
  }
  return { forward, strafe, turn };
}

// ---------------------------------------------------------------------------
// Render loop with split-screen scissor + minimap
// ---------------------------------------------------------------------------
function renderViewport(cam, x, y, w, h) {
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
  renderer.setViewport(x, y, w, h);
  renderer.setScissor(x, y, w, h);
  renderer.setScissorTest(true);
  renderer.render(scene, cam);
}

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  board.applyAction(0, actionFor(0), dt);
  board.applyAction(1, actionFor(1), dt);
  syncScene();

  const W = renderer.domElement.width / renderer.getPixelRatio();
  const H = renderer.domElement.height / renderer.getPixelRatio();
  const half = Math.floor(W / 2);

  // left pane = Player 1, right pane = Player 2
  renderViewport(cam0, 0, 0, half, H);
  renderViewport(cam1, half, 0, W - half, H);

  // minimap: top-center, small square (the "one state, two views" proof)
  const mm = Math.floor(Math.min(W, H) * 0.22);
  const mmX = Math.floor(W / 2 - mm / 2);
  const mmY = H - mm - 12;
  renderViewport(minimapCam, mmX, mmY, mm, mm);

  renderer.setScissorTest(false);
  updateHUD();
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// HUD / UI
// ---------------------------------------------------------------------------
const doorStateEl = document.getElementById("door-state");
let toggleFlash = 0;
function flashToggle(ok, who) {
  if (ok) toggleFlash = 1;
}
function updateHUD() {
  const open = board.door.open;
  doorStateEl.textContent = open ? "OPEN" : "CLOSED";
  doorStateEl.className = "pill " + (open ? "open" : "closed");
  if (toggleFlash > 0) {
    doorStateEl.style.boxShadow = `0 0 ${12 * toggleFlash}px #fff`;
    toggleFlash = Math.max(0, toggleFlash - 0.05);
  } else {
    doorStateEl.style.boxShadow = "none";
  }
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
}
window.addEventListener("resize", resize);

// environment dropdown
const envSel = document.getElementById("env-select");
for (const [key, val] of Object.entries(ENVIRONMENTS)) {
  const opt = document.createElement("option");
  opt.value = key;
  opt.textContent = val.label;
  envSel.appendChild(opt);
}
envSel.value = board.envName;
envSel.addEventListener("change", () => {
  board.setEnvironment(envSel.value);
  buildScene();
  document.getElementById("prompt-line").textContent = board.prompt;
});

// boot
buildScene();
resize();
document.getElementById("prompt-line").textContent = board.prompt;
requestAnimationFrame(loop);

// expose for debugging / Option A integration
window.__board = board;
