// The persona: Vidu-S2-Avatar on Reactor.
//
// What the model actually exposes (from @reactor-models/vidu-s2-avatar):
//   - createAvatar({ image }) from ONE image of one person (full or half body),
//     or attachAvatar({ avatar_id }) to reuse one made earlier (kept 90 days);
//   - startCall({ persona, greeting, ... }) runs its OWN reply LLM + voice, so
//     the character talks back by itself — no separate TTS needed;
//   - the player reaches it by microphone (publishMic before startCall) or by
//     typed text with say({ text }), which it answers as if spoken;
//   - transcripts arrive as `transcript` messages (speaker "user" | "character").
// Gotchas kept from Reactor's starter:
//   - never send explicit nulls (a payload with a null field is dropped whole);
//   - wait for the first session_state before sending anything;
//   - a connected session bills while idle, so disconnect when the scene ends.

import {
  ViduS2AvatarModel,
  type ViduS2AvatarCommandErrorMessage,
  type ViduS2AvatarSessionStateMessage,
  type ViduS2AvatarTranscriptMessage,
} from "@reactor-models/vidu-s2-avatar";
import type { Recipe } from "../recipes";
import { fetchToken } from "../token";
import { loadPublicImage, waitForReady } from "./util";

type Snapshot = ViduS2AvatarSessionStateMessage;

export class PersonaController {
  readonly model = new ViduS2AvatarModel({ jwt: fetchToken });
  state: Snapshot | null = null;
  private waiters: { pred: (s: Snapshot) => boolean; resolve: (s: Snapshot) => void }[] = [];

  onState?: (s: Snapshot) => void;
  onTranscript?: (m: ViduS2AvatarTranscriptMessage) => void;
  onError?: (m: ViduS2AvatarCommandErrorMessage) => void;

  constructor() {
    this.model.onSessionState((s) => {
      this.state = s;
      this.waiters = this.waiters.filter((w) => {
        if (w.pred(s)) {
          w.resolve(s);
          return false;
        }
        return true;
      });
      this.onState?.(s);
    });
    this.model.onTranscript((m) => this.onTranscript?.(m));
    this.model.onCommandError((m) => this.onError?.(m));
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

  private waitFor(pred: (s: Snapshot) => boolean, timeoutMs: number, what: string): Promise<Snapshot> {
    if (this.state && pred(this.state)) return Promise.resolve(this.state);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Persona: timed out waiting for ${what}`)), timeoutMs);
      this.waiters.push({
        pred,
        resolve: (s) => {
          clearTimeout(timer);
          resolve(s);
        },
      });
    });
  }

  async connect() {
    const first = this.waitFor(() => true, 180_000, "first session_state"); // park before connect
    await this.model.connect();
    await waitForReady(this.model);
    await first;
  }

  /** Reuse a cached avatar for this recipe if there is one, else create it from the portrait. */
  async prepareAvatar(recipe: Recipe) {
    const cacheKey = `avatar:${recipe.id}:${recipe.personaImage}`;
    const cached = safeGet(cacheKey);
    if (cached) {
      await this.model.attachAvatar({ avatar_id: cached });
      try {
        await this.waitFor((s) => s.phase === "avatar_ready", 20_000, "cached avatar");
        return;
      } catch {
        safeRemove(cacheKey); // expired or unknown: fall through and recreate
      }
    }
    const blob = await loadPublicImage(recipe.personaImage);
    const ref = await this.model.uploadFile(blob, { name: recipe.personaImage.split("/").pop() });
    await this.model.createAvatar({ name: recipe.persona.name, image: ref });
    const ready = await this.waitFor(
      (s) => s.phase === "avatar_ready" || s.avatar_status === "failed",
      120_000,
      "avatar to be ready",
    );
    if (ready.phase !== "avatar_ready") throw new Error("Persona: the portrait could not become an avatar");
    if (ready.avatar_id) safeSet(cacheKey, ready.avatar_id);
  }

  /** Publish the mic (if any) BEFORE start_call so the first words reach the character. */
  async startCall(persona: string, greeting: string, mic?: MediaStreamTrack) {
    if (mic) await this.model.publishMic(mic);
    await this.model.startCall({
      persona,
      greeting: greeting.slice(0, 200),
      language: "English",
      call_mode: "audio",
      transcripts: true,
    });
    await this.waitFor((s) => s.phase === "live" || s.phase === "failed", 60_000, "call to go live");
    if (this.state?.phase !== "live") throw new Error("Persona: the call failed to start");
  }

  say(text: string) {
    return this.model.say({ text: text.slice(0, 2000) });
  }

  /** Tell the persona what happened; lands after its current sentence. */
  updatePersona(prompt: string) {
    return this.model.updateCall({ persona: prompt });
  }

  get live() {
    return this.state?.phase === "live";
  }

  async endCall() {
    if (this.live) await this.model.endCall();
  }

  async disconnect() {
    await this.endCall().catch(() => {});
    await this.model.disconnect();
    this.state = null;
  }
}

function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}
function safeRemove(k: string) {
  try {
    localStorage.removeItem(k);
  } catch {}
}
