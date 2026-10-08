# Protocol — web client ⟷ render service

Tiny and renderer-agnostic so Option C and Option A speak the same thing. The
STBoard is the single source of truth; this is just how a pose/scene is handed
to a renderer.

## Request (per agent, per frame or per short sequence)
```json
{
  "scene_id": "street",
  "agent_id": 0,
  "pose": { "pos": [x, y, z], "yaw": 0.0, "pitch": 0.0 },
  "poses_seq": [[/* 4x4 */]],
  "prompt": "two people walking side by side, city street, daytime"
}
```

## Response
```json
{ "agent_id": 0, "frame_png_b64": "...", "frames": ["...", "..."] }
```

## Who calls it
- **Option C** never calls this — it renders the STBoard locally in three.js.
- **Option A** points each agent's view at `POST /render` on the HPC service.
  Both agents' requests are derived from the ONE STBoard, which is why the two
  generated views stay structurally consistent.

## Pose convention
`cameraPose(agentId)` in `web/stboard.js` returns `{ eye, target, yaw }` in
three.js world space (y-up). For Option A, convert `{pos, yaw}` to a 4×4
**OpenCV camera-to-world** matrix per frame (`poses.npy`, shape `[N,4,4]`) plus
`intrinsics.npy` (`[N,4]` = fx, fy, cx, cy). See CLAUDE.md §6.
