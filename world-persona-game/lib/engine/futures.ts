// Branch previews and ending cinematics: H3 Reference Turbo Realtime.
//
// What the model exposes on Reactor
// (@reactor-models/h3-reference-to-video-turbo-realtime):
//   - a clip queue like FastH3 (enqueue -> clip_generated -> play), with
//     synchronized audio, 5.2–15.1 s per clip;
//   - unlike FastH3, each clip takes up to 9 ordered REFERENCE images, named
//     <Picture 1>…<Picture N> in the prompt. References guide appearance;
//     they are not keyframes.
// We pass the same three references to every clip:
//   Picture 1 = the hero (the world's starting image),
//   Picture 2 = the persona portrait,
//   Picture 3 = a frame grabbed from the live world right now,
// and build the six-section prompt the starter template uses, so both
// characters stay on-model in every preview.

import {
  H3ReferenceToVideoTurboRealtimeModel,
  type H3ReferenceToVideoTurboRealtimeCommandErrorMessage,
} from "@reactor-models/h3-reference-to-video-turbo-realtime";
import type { FileRef } from "@reactor-team/js-sdk";
import type { Recipe } from "../recipes";
import { fetchToken } from "../token";
import { loadPublicImage, waitForReady } from "./util";

export type FutureStatus = "queued" | "ready" | "playing" | "played" | "failed";
export interface Future {
  key: string; // branch id, or "ending:<id>"
  label: string;
  clipId: string;
  status: FutureStatus;
}

const PREVIEW_SECONDS = 5;
const ENDING_SECONDS = 10;

export class FuturesController {
  readonly model = new H3ReferenceToVideoTurboRealtimeModel({ jwt: fetchToken });
  futures = new Map<string, Future>();
  private heroRef: FileRef | null = null;
  private personaRef: FileRef | null = null;
  /** Ending cinematics start playing on their own as soon as they are built. */
  private autoPlayKeys = new Set<string>();

  onChange?: (futures: Future[]) => void;
  onError?: (m: H3ReferenceToVideoTurboRealtimeCommandErrorMessage) => void;

  constructor() {
    const set = (key: string, status: FutureStatus) => {
      const f = this.futures.get(key);
      if (!f) return;
      f.status = status;
      this.emit();
      if (status === "ready" && this.autoPlayKeys.has(key)) {
        this.autoPlayKeys.delete(key);
        void this.play(key);
      }
    };
    this.model.onClipGenerated((m) => set(m.clip.metadata, "ready"));
    this.model.onClipFailed((m) => set(m.clip.metadata, "failed"));
    this.model.onClipStarted((m) => set(m.clip.metadata, "playing"));
    this.model.onClipFinished((m) => set(m.clip.metadata, "played")); // played clips leave the queue
    this.model.onCommandError((m) => this.onError?.(m));
  }

  private emit() {
    this.onChange?.([...this.futures.values()]);
  }

  attach(video: HTMLVideoElement, audio: HTMLAudioElement) {
    this.model.onMainVideo((_t, stream) => {
      video.srcObject = stream;
      void video.play().catch(() => {});
    });
    this.model.onMainAudio((_t, stream) => {
      audio.srcObject = stream;
      void audio.play().catch(() => {});
    });
  }

  /** Connect and upload the two character references once; they are reused for every clip. */
  async connect(recipe: Recipe) {
    await this.model.connect();
    await waitForReady(this.model);
    await this.model.setCanvas({ aspect: "16:9" });
    await this.model.setAutoplay({ enabled: false }); // we decide which future plays
    await this.model.setFlushOnClipEnd({ enabled: false }); // hold the last frame, no black flash
    this.heroRef = await this.model.uploadFile(await loadPublicImage(recipe.heroImage), { name: "hero.jpg" });
    this.personaRef = await this.model.uploadFile(await loadPublicImage(recipe.personaImage), { name: "persona.jpg" });
  }

  private async references(frame: Blob | null): Promise<FileRef[]> {
    const refs: FileRef[] = [];
    if (this.heroRef) refs.push(this.heroRef);
    if (this.personaRef) refs.push(this.personaRef);
    if (frame) refs.push(await this.model.uploadFile(frame, { name: "world-now.jpg" }));
    return refs;
  }

  private async enqueue(key: string, label: string, prompt: string, seconds: number, refs: FileRef[], continueFrom?: string) {
    const queued = await this.model.enqueue({
      prompt,
      metadata: key,
      seconds,
      reference_images: refs,
      ...(continueFrom ? { continue_from_clip_id: continueFrom } : {}),
    });
    if (queued?.clip) {
      this.futures.set(key, { key, label, clipId: queued.clip.clip_id, status: "queued" });
      this.emit();
    }
  }

  /** One preview per branch of the beat, all referencing the hero, the persona and the live world. */
  async previewBranches(recipe: Recipe, beatBranches: { id: string; label: string; vision: { action: string; sound: string } }[], frame: Blob | null) {
    for (const [k, f] of this.futures) if (!k.startsWith("ending:") && f.status !== "playing") this.futures.delete(k);
    this.emit();
    const refs = await this.references(frame);
    for (const b of beatBranches) {
      await this.enqueue(b.id, b.label, buildPrompt(recipe, b.vision, PREVIEW_SECONDS, refs.length), PREVIEW_SECONDS, refs);
    }
  }

  /** The ending cinematic, continuing from the chosen branch's preview when it exists. Plays when ready. */
  async playEnding(recipe: Recipe, ending: { id: string; title: string; cinematic: { action: string; sound: string } }, chosenBranchId: string | null, frame: Blob | null) {
    const key = `ending:${ending.id}`;
    const refs = await this.references(frame);
    const from = chosenBranchId ? this.futures.get(chosenBranchId) : undefined;
    const continueFrom = from && from.status !== "failed" ? from.clipId : undefined;
    this.autoPlayKeys.add(key);
    await this.enqueue(key, ending.title, buildPrompt(recipe, ending.cinematic, ENDING_SECONDS, refs.length, !!continueFrom), ENDING_SECONDS, refs, continueFrom);
  }

  async play(key: string): Promise<boolean> {
    const f = this.futures.get(key);
    if (!f || f.status !== "ready") return false;
    if ([...this.futures.values()].some((x) => x.status === "playing")) await this.model.stop();
    await this.model.play({ clip_id: f.clipId });
    return true;
  }

  async disconnect() {
    this.futures.clear();
    this.autoPlayKeys.clear();
    this.heroRef = this.personaRef = null;
    await this.model.disconnect();
  }
}

/**
 * The six-section prompt from Reactor's h3-reference-turbo-realtime starter.
 * Subjects 1-3 are bound to Pictures 1-3; "retention_analysis" tells the model
 * what must not change, which is what keeps identities stable.
 */
export function buildPrompt(
  recipe: Recipe,
  shot: { action: string; sound: string },
  seconds: number,
  refCount: number,
  continuing = false,
): string {
  const subjects = [
    `<Subject 1> is ${recipe.heroSubject}, shown in <Picture 1>, preserving their face, hair, clothing, and any object they carry.`,
    `<Subject 2> is ${recipe.persona.look}, shown in <Picture 2>, preserving their face, hair, clothing, and any object they carry.`,
    `<Subject 3> is ${recipe.placeSubject}, shown in <Picture 3>, preserving its architecture, surfaces, colour palette, and light direction.`,
  ].slice(0, refCount);
  const retention = [
    "<Subject 1> (appears throughout): fully_preserved - retain the same face, clothing, carried objects, and body proportions.",
    "<Subject 2> (appears throughout): fully_preserved - retain the same face, hair, clothing, and body proportions.",
    "<Subject 3> (appears throughout): fully_preserved - retain the landmarks, surfaces, palette, and light direction.",
  ].slice(0, refCount);
  return [
    "subject_definitions:",
    subjects.join("\n"),
    "",
    "summary:",
    continuing ? `Continuing the same shot, ${shot.action}` : `In one continuous ${seconds}-second shot, ${shot.action}`,
    "",
    "retention_analysis:",
    retention.join("\n"),
    "",
    "detailed_description:",
    `${recipe.style} Physically coherent motion, stable identities. One continuous shot with no cuts, no duplicate people, no costume changes, and no readable text.`,
    "",
    continuing ? `[Shot 1] The shot continues from the previous clip. ${shot.action}` : `[Shot 1] ${shot.action}`,
    "",
    "overall_soundscape:",
    shot.sound,
    "",
    "non_diegetic_music:",
    "None.",
  ].join("\n");
}
