// main.js — Option C renderer: classical three.js render of the ONE STBoard.
// Two agents, two cameras, split-screen, mutually consistent (literally one scene).
//
// This file is the ONLY thing Option A replaces. It reads the STBoard and draws
// it; it never invents world content. See CLAUDE.md §2, §4.

import * as THREE from "three";
import { STBoard, ENVIRONMENTS, CONSTANTS } from "./stboard.js?v=4";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const board = new STBoard("street");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById("app").appendChild(renderer.domElement);

// Offscreen square renderer: grabs a crude per-agent frame to send to the
// Option A service. preserveDrawingBuffer lets us read it out via toDataURL.
const capRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
capRenderer.setSize(512, 512);
capRenderer.shadowMap.enabled = true;

// One scene, rebuilt when the environment changes. Agent avatars + door are
// kept as handles so we can sync them to the STBoard every frame.
let scene, cam0, cam1, minimapCam;
let avatars = []; // [{group, nose}] indexed by agent id
let doorPivot = null;
const envObjects = []; // obstacles/ground/lights to dispose on env swap

function makeCamera() {
  const c = new THREE.PerspectiveCamera(78, 1, 0.1, 500);
  return c;
}

// ---------------------------------------------------------------------------
// Procedural textures. Option C boxes were flat solid colors, so a close-up
// face looked like a featureless gray blur. These give every surface real
// detail (windows / bark / plaster) drawn on an offscreen canvas — no assets,
// no network. They tile, so the detail scale stays constant across box sizes.
// ---------------------------------------------------------------------------
const hex2css = (h) => "#" + (h >>> 0).toString(16).padStart(6, "0");

function makeCanvasTexture(draw, size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function facadeTexture(baseHex) {
  // building wall: a grid of windows, some lit, on a concrete base
  return makeCanvasTexture((ctx, S) => {
    ctx.fillStyle = hex2css(baseHex);
    ctx.fillRect(0, 0, S, S);
    const cols = 4, rows = 4, pad = S * 0.07;
    const cw = S / cols, ch = S / rows;
    for (let r = 0; r < rows; r++) {
      for (let cI = 0; cI < cols; cI++) {
        const x = cI * cw + pad, y = r * ch + pad, w = cw - pad * 2, h = ch - pad * 2;
        const lit = Math.random();
        ctx.fillStyle = lit > 0.62 ? "#ffe6a3" : lit > 0.3 ? "#2a2f3a" : "#9fb6cc";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
      }
    }
  });
}

function barkTexture(baseHex) {
  // tree trunk: vertical bark streaks + speckle
  return makeCanvasTexture((ctx, S) => {
    ctx.fillStyle = hex2css(baseHex);
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 44; i++) {
      const x = Math.random() * S;
      ctx.strokeStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.18})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 4, S / 3, x - 4, (2 * S) / 3, x, S);
      ctx.stroke();
    }
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(255,240,220,${Math.random() * 0.07})`;
      ctx.fillRect(Math.random() * S, Math.random() * S, 2, 5);
    }
  });
}

function wallTexture(baseHex) {
  // interior wall: subtle plaster mottle so it isn't a flat panel
  return makeCanvasTexture((ctx, S) => {
    ctx.fillStyle = hex2css(baseHex);
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 700; i++) {
      const d = Math.random() * 0.06;
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(0,0,0,${d})` : `rgba(255,255,255,${d})`;
      ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }
  });
}

function obstacleTexture(envName, baseHex) {
  if (envName === "street") return facadeTexture(baseHex);
  if (envName === "forest") return barkTexture(baseHex);
  return wallTexture(baseHex);
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

  // ground (subtle noise so it doesn't read as a flat slab up close)
  const groundGeo = new THREE.PlaneGeometry(board.ground.size, board.ground.size);
  const groundTex = makeCanvasTexture((ctx, S) => {
    ctx.fillStyle = hex2css(board.ground.color);
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) {
      const d = Math.random() * 0.05;
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(0,0,0,${d})` : `rgba(255,255,255,${d})`;
      ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }
  });
  groundTex.repeat.set(board.ground.size / 2, board.ground.size / 2);
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 });
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

  // obstacles — textured + edge-outlined so a close-up face is a surface, not blur
  for (const o of board.obstacles) {
    const geo = new THREE.BoxGeometry(o.size[0], o.height, o.size[1]);
    const tex = obstacleTexture(board.envName, o.color);
    // tile ~every 3 units so window/bark scale stays constant across box sizes
    tex.repeat.set(Math.max(1, Math.round(o.size[0] / 3)), Math.max(1, Math.round(o.height / 3)));
    const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.85 });
    const box = new THREE.Mesh(geo, mat);
    box.position.set(o.pos[0], o.height / 2, o.pos[1]);
    box.castShadow = true;
    box.receiveShadow = true;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 })
    );
    box.add(edges);
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
  doorMesh.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(doorGeo),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })
    )
  );
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

  // First-person fix: a camera must NOT render its OWN avatar, or the player
  // stares at the inside of their own head / nose cone. The OTHER player's
  // camera and the minimap still see it. Layers: 0 = world (all cams), 1 =
  // avatar 0, 2 = avatar 1.
  avatars[0].group.traverse((o) => o.layers.set(1));
  avatars[1].group.traverse((o) => o.layers.set(2));
  cam0.layers.enable(2); // P1 sees world + P2's avatar, not its own (layer 1)
  cam1.layers.enable(1); // P2 sees world + P1's avatar, not its own (layer 2)
  minimapCam.layers.enable(1);
  minimapCam.layers.enable(2); // minimap sees both
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
// Option A — world-model re-skin (SDXL-Turbo service). The classical render
// stays underneath as the always-works fallback; when enabled we capture each
// agent's crude frame, send it to be re-skinned, and overlay the result. Both
// frames come from the ONE STBoard, so both re-skins stay structurally matched.
// ---------------------------------------------------------------------------
const WM = {
  enabled: false,
  url: "http://localhost:8000",
  inFlight: [false, false],
  overlays: [document.getElementById("nn-0"), document.getElementById("nn-1")],
};

function captureAgentFrame(agentId) {
  const cam = agentId === 0 ? cam0 : cam1;
  const prevAspect = cam.aspect;
  cam.aspect = 1; // square capture matches SDXL-Turbo's preferred input
  cam.updateProjectionMatrix();
  capRenderer.render(scene, cam);
  cam.aspect = prevAspect;
  cam.updateProjectionMatrix();
  return capRenderer.domElement.toDataURL("image/jpeg", 0.85);
}

function setWmStatus(cls, text) {
  const el = document.getElementById("wm-status");
  el.className = "wm-status " + cls;
  el.textContent = text;
}

async function reskinAgent(agentId) {
  if (WM.inFlight[agentId]) return; // self-throttle to the server's speed
  WM.inFlight[agentId] = true;
  try {
    const dataUrl = captureAgentFrame(agentId);
    const pose = board.cameraPose(agentId);
    const res = await fetch(WM.url.replace(/\/$/, "") + "/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scene_id: board.envName,
        agent_id: agentId,
        pose: { pos: board.getAgent(agentId).pos, yaw: pose.yaw },
        prompt: board.prompt,
        image_b64: dataUrl.split(",")[1],
      }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    WM.overlays[agentId].src = "data:image/jpeg;base64," + j.frame_png_b64;
    if (agentId === 0) setWmStatus("on", "on · live");
  } catch (e) {
    setWmStatus("err", "error: " + e.message);
  } finally {
    WM.inFlight[agentId] = false;
  }
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

  // Option A: kick off re-skins (non-blocking; each skips if one is in flight)
  if (WM.enabled) {
    reskinAgent(0);
    reskinAgent(1);
  }

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

// world-model toggle + server URL
const wmEnable = document.getElementById("wm-enable");
const wmUrl = document.getElementById("wm-url");
wmUrl.value = WM.url;
wmUrl.addEventListener("change", () => {
  WM.url = wmUrl.value.trim() || WM.url;
});
wmEnable.addEventListener("change", async () => {
  WM.enabled = wmEnable.checked;
  WM.url = wmUrl.value.trim() || WM.url;
  document.body.classList.toggle("wm-on", WM.enabled);
  if (!WM.enabled) {
    setWmStatus("", "off");
    return;
  }
  setWmStatus("", "connecting…");
  try {
    const h = await fetch(WM.url.replace(/\/$/, "") + "/health");
    const j = await h.json();
    setWmStatus("on", "on · backend: " + (j.backend || "?"));
  } catch (e) {
    setWmStatus("err", "server unreachable");
  }
});

// boot
buildScene();
resize();
document.getElementById("prompt-line").textContent = board.prompt;
requestAnimationFrame(loop);

// expose for debugging / Option A integration
window.__board = board;
