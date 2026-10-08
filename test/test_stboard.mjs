import { STBoard, ENVIRONMENTS } from "../web/stboard.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log("FAIL:", msg); } };

const b = new STBoard("street");

// 1. exactly one state, two agents
ok(b.agents.length === 2, "two agents");
ok(b.getAgent(0) && b.getAgent(1), "agents 0 and 1 exist");

// 2. forward movement changes position deterministically
const p0 = [...b.getAgent(0).pos];
b.applyAction(0, { forward: 1, strafe: 0, turn: 0 }, 1 / 60);
const p1 = b.getAgent(0).pos;
ok(p0[0] !== p1[0] || p0[2] !== p1[2], "agent 0 moved on forward input");

// agent 1 untouched by agent 0's action (independent poses, shared world)
const a1 = b.getAgent(1).pos;
ok(a1[0] === 2 && a1[2] === 6, "agent 1 unchanged by agent 0 action");

// 3. determinism: same start + same action => same result
const c = new STBoard("street");
const d = new STBoard("street");
for (let i = 0; i < 100; i++) {
  const act = { forward: 1, strafe: 0.3, turn: 0.2 };
  c.applyAction(0, act, 1 / 60);
  d.applyAction(0, act, 1 / 60);
}
ok(JSON.stringify(c.getAgent(0).pos) === JSON.stringify(d.getAgent(0).pos), "deterministic kinematics");

// 4. bounds: can't leave the ground
const e = new STBoard("street");
for (let i = 0; i < 2000; i++) e.applyAction(0, { forward: 1 }, 1 / 60);
const half = e.ground.size / 2;
const pos = e.getAgent(0).pos;
ok(Math.abs(pos[0]) <= half && Math.abs(pos[2]) <= half, "stays within world bounds");

// 5. door toggle: only works in range, and the change is in the ONE state
const f = new STBoard("street");
f.getAgent(0).pos = [20, 0, 20]; // far from door
ok(f.tryToggleDoor(0) === false && f.door.open === false, "cannot toggle door from far away");
f.getAgent(0).pos = [f.door.pos[0], 0, f.door.pos[1] + 1]; // right next to door
ok(f.tryToggleDoor(0) === true && f.door.open === true, "agent 0 opens door when near");
// the SAME door object is what agent 1 would see — there is only one
ok(f.door.open === true, "door state is shared (one object)");
f.getAgent(1).pos = [f.door.pos[0], 0, f.door.pos[1] - 1];
ok(f.tryToggleDoor(1) === true && f.door.open === false, "agent 1 closes the same door");

// 6. closed door blocks movement, open door lets you pass (room env)
const g = new STBoard("room");
g.door.open = false;
g.getAgent(0).pos = [g.door.pos[0], 0, g.door.pos[1] + 1.2];
for (let i = 0; i < 300; i++) g.applyAction(0, { forward: -1 }, 1 / 60); // push toward/through closed door (-z)
const blockedZ = g.getAgent(0).pos[2];
ok(blockedZ >= g.door.pos[1] - 0.6, "closed door blocks passage");

const h = new STBoard("room");
h.door.open = true;
h.getAgent(0).pos = [h.door.pos[0], 0, h.door.pos[1] + 1.2];
for (let i = 0; i < 300; i++) h.applyAction(0, { forward: -1 }, 1 / 60);
ok(h.getAgent(0).pos[2] < h.door.pos[1], "open door allows passage");

// 7. environments load and differ
ok(Object.keys(ENVIRONMENTS).length === 3, "three environments");
const env2 = new STBoard("forest");
ok(env2.envName === "forest" && env2.prompt.includes("forest"), "forest env loads with prompt");

// 8. camera pose is a deterministic function of state
const cam = b.cameraPose(0);
ok(cam.eye.length === 3 && cam.target.length === 3, "camera pose returns eye+target");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
