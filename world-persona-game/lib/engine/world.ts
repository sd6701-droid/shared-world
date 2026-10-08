// The live world: LingBot-World-2, driven the way Reactor's World Model
// Arcade drives it.
//
// What the model exposes on Reactor (@reactor-models/lingbot-world-2):
//   - start needs BOTH a reference image (setImage) and a prompt (setPrompt);
//   - steering: move_longitudinal / move_lateral, look_*, camera_pose;
//   - everything else (actions, the persona appearing, consequences) is a
//     live setPrompt hot-swap that applies on the next chunk;
//   - setImage mid-run does nothing until reset + start, so the starting
//     image anchors the hero and the place for the whole run.
// Arcade patterns kept here: small attention window at start (steadier),
// held actions that survive chunk boundaries, a symmetric jump arc on the
// pose channel, a diagnostic coherence score, and "return to first frame".

import {
  LingbotWorld2Model,
  type LingbotWorld2ChunkCompleteMessage,
  type LingbotWorld2CommandErrorMessage,
} from "@reactor-models/lingbot-world-2";
import { compareSignatures, signatureFromBlob, signatureFromVideo, type FrameSignature } from "../consistency";
import type { QuickAction, Recipe } from "../recipes";
import { fetchToken } from "../token";
import { grabFrame, loadPublicImage, waitForReady } from "./util";

type Long = "forward" | "back";
type Lat = "strafe_left" | "strafe_right";
type LookH = "left" | "right";
type LookV = "up" | "down";
type Axis = "long" | "lat" | "lookH" | "lookV";

const KEYMAP: Record<string, { axis: Axis; v: string }> = {
  KeyW: { axis: "long", v: "forward" },
  KeyS: { axis: "long", v: "back" },
  KeyA: { axis: "lat", v: "strafe_left" },
  KeyD: { axis: "lat", v: "strafe_right" },
  ArrowLeft: { axis: "lookH", v: "left" },
  ArrowRight: { axis: "lookH", v: "right" },
  ArrowUp: { axis: "lookV", v: "up" },
  ArrowDown: { axis: "lookV", v: "down" },
};

const ROTATION_SPEED_DEG = 4;
/** Per-step [rx,ry,rz,tx,ty,tz] for one chunk; y-down, so -1 is up. Symmetric = lands where it took off. */
const JUMP_POSE = [0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0];
/** Score the live frame against the first frame every N chunks. */
const AUDIT_EVERY_CHUNKS = 3;

export class WorldController {
  readonly model = new LingbotWorld2Model({ jwt: fetchToken });
  private video: HTMLVideoElement | null = null;
  private recipe: Recipe | null = null;
  private lastPrompt = "";
  private stacks: Record<Axis, string[]> = { long: [], lat: [], lookH: [], lookV: [] };
  private heldActions: QuickAction[] = [];
  private jumpPending = false;
  private poseActive = false;
  private canonical: FrameSignature | null = null;

  onChunk?: (m: LingbotWorld2ChunkCompleteMessage) => void;
  onError?: (m: LingbotWorld2CommandErrorMessage) => void;
  /** Movement or held actions changed: recompose the prompt. */
  onInputChange?: () => void;
  /** 0-100 similarity to the first frame (diagnostic only). */
  onCoherence?: (score: number) => void;

  constructor() {
    this.model.onChunkComplete((m) => {
      this.sendPoseForNextChunk();
      if (m.chunk_index % AUDIT_EVERY_CHUNKS === 0) this.audit();
      this.onChunk?.(m);
    });
    this.model.onCommandError((m) => this.onError?.(m));
  }

  attach(video: HTMLVideoElement) {
    this.video = video;
    this.model.onMainVideo((_track, stream) => {
      video.srcObject = stream;
      void video.play().catch(() => {});
    });
  }

  async connect() {
    await this.model.connect();
    await waitForReady(this.model);
  }

  /** setImage -> seed -> attention -> prompt -> rotation speed -> start. Each await is the barrier. */
  async start(recipe: Recipe, prompt: string): Promise<boolean> {
    this.recipe = recipe;
    const blob = await loadPublicImage(recipe.heroImage);
    this.canonical = await signatureFromBlob(blob).catch(() => null);
    const ref = await this.model.uploadFile(blob, { name: recipe.heroImage.split("/").pop() });
    const accepted = await this.model.setImage({ image: ref });
    if (!accepted) return false; // refused; command_error already fired
    await this.model.setSeed({ seed: recipe.seed });
    await this.model.setAttnWindow({ attn_window: "small" });
    this.lastPrompt = "";
    await this.sendPrompt(prompt);
    await this.model.setRotationSpeedDeg({ rotation_speed_deg: ROTATION_SPEED_DEG });
    await this.model.start();
    return true;
  }

  /** "Return to first frame" (key P): reset and restart from the starting image. */
  async restartFromFirstFrame(prompt: string): Promise<boolean> {
    if (!this.recipe) return false;
    this.releaseAll();
    await this.model.reset();
    return this.start(this.recipe, prompt);
  }

  /** The only place prompts are sent from, so dedupe stays truthful. */
  async sendPrompt(prompt: string) {
    if (prompt === this.lastPrompt) return;
    this.lastPrompt = prompt;
    await this.model.setPrompt({ prompt });
  }

  get moving(): boolean {
    return this.stacks.long.length > 0 || this.stacks.lat.length > 0;
  }

  get held(): QuickAction[] {
    return [...this.heldActions];
  }

  /** Returns true when the key is one the world uses. */
  press(code: string): boolean {
    const action = this.recipe?.actions.find((a) => a.key === code);
    if (action) {
      if (!this.heldActions.includes(action)) this.heldActions.push(action);
      if (action.jump) {
        this.jumpPending = true;
        this.sendPoseForNextChunk();
      }
      this.onInputChange?.();
      return true;
    }
    const k = KEYMAP[code];
    if (!k) return false;
    const stack = this.stacks[k.axis];
    if (!stack.includes(k.v)) stack.push(k.v);
    this.flush(k.axis);
    this.onInputChange?.();
    return true;
  }

  release(code: string): boolean {
    const action = this.recipe?.actions.find((a) => a.key === code);
    if (action) {
      this.heldActions = this.heldActions.filter((a) => a !== action);
      this.onInputChange?.();
      return true;
    }
    const k = KEYMAP[code];
    if (!k) return false;
    const stack = this.stacks[k.axis];
    const i = stack.indexOf(k.v);
    if (i >= 0) stack.splice(i, 1);
    this.flush(k.axis);
    this.onInputChange?.();
    return true;
  }

  releaseAll() {
    (Object.keys(this.stacks) as Axis[]).forEach((axis) => {
      this.stacks[axis].length = 0;
      this.flush(axis);
    });
    this.heldActions = [];
    this.jumpPending = false;
    this.onInputChange?.();
  }

  /** Movement axes are state-based: the neutral value goes out when a stack empties. */
  private flush(axis: Axis) {
    const top = this.stacks[axis].at(-1);
    switch (axis) {
      case "long":
        void this.model.setMoveLongitudinal({ move_longitudinal: (top as Long) ?? "idle" });
        break;
      case "lat":
        void this.model.setMoveLateral({ move_lateral: (top as Lat) ?? "idle" });
        break;
      case "lookH":
        void this.model.setLookHorizontal({ look_horizontal: (top as LookH) ?? "idle" });
        break;
      case "lookV":
        void this.model.setLookVertical({ look_vertical: (top as LookV) ?? "idle" });
        break;
    }
  }

  /** One pose sender per chunk: a pending jump arc, else hand control back to WASD/arrows. */
  private sendPoseForNextChunk() {
    if (this.jumpPending) {
      this.jumpPending = false;
      this.poseActive = true;
      void this.model.setCameraPose({ camera_pose: JUMP_POSE });
    } else if (this.poseActive) {
      this.poseActive = false;
      void this.model.setCameraPose({ camera_pose: [] });
    }
  }

  private audit() {
    if (!this.video || !this.canonical) return;
    const sig = signatureFromVideo(this.video);
    if (sig) this.onCoherence?.(compareSignatures(this.canonical, sig));
  }

  frame(): Promise<Blob | null> {
    return this.video ? grabFrame(this.video) : Promise.resolve(null);
  }

  async disconnect() {
    this.lastPrompt = "";
    this.heldActions = [];
    await this.model.disconnect();
  }
}
