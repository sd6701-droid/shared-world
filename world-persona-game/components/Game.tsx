"use client";

// The story loop, repeated per beat until an ending:
//   explore -> encounter -> choose -> world reacts -> (next beat | ending)
//
//   LingBot-World-2           : the live world. WASD/arrows move, 1-3 held
//                               actions, P returns to the first frame.
//   Vidu-S2-Avatar            : the persona close-up, one avatar for the whole
//                               story, a fresh call per beat with the story so far.
//   H3 Reference Turbo Realtime: previews per branch and the ending cinematic,
//                               referencing hero + persona + the live world.
//   Director                  : maps the player's words to one branch.

import { useCallback, useEffect, useRef, useState } from "react";
import { RECIPES, beatOf, endingOf, personaPromptFor, recipeById, type Beat, type Branch, type Ending, type Recipe } from "@/lib/recipes";
import { composeWorldPrompt, type WorldPromptState } from "@/lib/prompt";
import { WorldController } from "@/lib/engine/world";
import { PersonaController } from "@/lib/engine/persona";
import { FuturesController, type Future } from "@/lib/engine/futures";
import { resolveChoice } from "@/lib/director";

type Phase = "setup" | "starting" | "explore" | "encounter" | "resolved" | "ending" | "error";
type Line = { who: string; text: string };
type Statuses = { world: string; persona: string; futures: string };

/** Chunks of walking forward before the persona appears (E skips ahead). */
const ENCOUNTER_AFTER_CHUNKS = 12;
/** Let the world draw the persona before grabbing a frame for the previews. */
const FRAME_GRAB_DELAY_MS = 3000;
/** Let the persona say her closing line before an ending takes over. */
const ENDING_DELAY_MS = 7000;

interface Engine {
  world: WorldController;
  persona: PersonaController;
  futures: FuturesController | null;
}

export default function Game() {
  const [recipeId, setRecipeId] = useState(RECIPES[0].id);
  const recipe = recipeById(recipeId);
  const [phase, setPhaseState] = useState<Phase>("setup");
  const [beatId, setBeatIdState] = useState(recipe.startBeat);
  const beat = beatOf(recipe, beatId);
  const [useVoice, setUseVoice] = useState(false);
  const [useFutures, setUseFutures] = useState(true);
  const [status, setStatus] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [futures, setFutures] = useState<Future[]>([]);
  const [path, setPath] = useState<string[]>([]);
  const [ending, setEnding] = useState<Ending | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState("");
  const [progress, setProgress] = useState(0);
  const [coherence, setCoherence] = useState<number | null>(null);
  const [personaShown, setPersonaShown] = useState(false);
  const [personaLive, setPersonaLive] = useState(false);
  const [statuses, setStatuses] = useState<Statuses>({ world: "—", persona: "—", futures: "—" });

  const worldVideo = useRef<HTMLVideoElement>(null);
  const personaVideo = useRef<HTMLVideoElement>(null);
  const personaAudio = useRef<HTMLAudioElement>(null);
  const futureVideo = useRef<HTMLVideoElement>(null);
  const futureAudio = useRef<HTMLAudioElement>(null);

  const engine = useRef<Engine | null>(null);
  const phaseRef = useRef<Phase>("setup");
  const recipeRef = useRef<Recipe>(recipe);
  const beatRef = useRef<string>(recipe.startBeat);
  const gs = useRef<WorldPromptState>({ moving: false, held: [], personaSpawn: null, events: [] });
  const history = useRef<string[]>([]);
  const pendingBeat = useRef<string | null>(null);
  const lastBranch = useRef<string | null>(null);
  const forwardChunks = useRef(0);
  const mic = useRef<MediaStreamTrack | null>(null);
  const transcript = useRef<string[]>([]);
  const lastTyped = useRef("");

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const setBeat = (id: string) => {
    beatRef.current = id;
    setBeatIdState(id);
  };
  const currentBeat = (): Beat => beatOf(recipeRef.current, beatRef.current);

  const flash = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast((t) => (t === text ? null : t)), 5000);
  }, []);

  const addLine = (who: string, text: string) => {
    transcript.current.push(`${who}: ${text}`);
    setLines((l) => [...l.slice(-40), { who, text }]);
  };

  const worldPrompt = () => composeWorldPrompt(recipeRef.current, gs.current);
  const pushPrompt = () => {
    const e = engine.current;
    if (e) void e.world.sendPrompt(worldPrompt());
  };

  const releaseMic = () => {
    mic.current?.stop();
    mic.current = null;
  };

  /* ---------------- a beat: encounter, choice, consequence ---------------- */

  const triggerEncounter = useCallback(async () => {
    const e = engine.current;
    if (!e || phaseRef.current !== "explore") return;
    const r = recipeRef.current;
    const b = currentBeat();
    setPhase("encounter");
    setChosenId(null);
    setPersonaShown(true);
    gs.current.personaSpawn = b.spawnEvent;
    pushPrompt(); // the persona now exists in the world

    if (e.futures) {
      window.setTimeout(async () => {
        const frame = await e.world.frame();
        await e.futures?.previewBranches(r, b.branches, frame);
      }, FRAME_GRAB_DELAY_MS);
    }

    if (useVoice && !mic.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        mic.current = stream.getAudioTracks()[0] ?? null;
      } catch {
        flash("Microphone blocked: type your replies instead.");
      }
    }
    try {
      await e.persona.startCall(personaPromptFor(r, b, history.current), b.greeting, mic.current ?? undefined);
    } catch (err) {
      flash((err as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useVoice, flash]);

  const finishStory = async (end: Ending) => {
    const e = engine.current;
    if (!e) return;
    setPhase("ending");
    setEnding(end);
    gs.current.events.push(end.worldEvent);
    pushPrompt();
    void e.persona.endCall();
    setPersonaShown(false);
    releaseMic();
    if (e.futures) {
      const frame = await e.world.frame();
      await e.futures.playEnding(recipeRef.current, end, lastBranch.current, frame);
    }
  };

  const commit = async (branch: Branch) => {
    const e = engine.current;
    if (!e || phaseRef.current !== "encounter") return;
    const r = recipeRef.current;
    const b = currentBeat();
    setPhase("resolved");
    setChosenId(branch.id);
    lastBranch.current = branch.id;
    history.current.push(`at ${b.title.toLowerCase()} they chose to ${branch.label.toLowerCase()}`);
    setPath((p) => [...p, `${b.title}: ${branch.label}`]);
    gs.current.events.push(branch.worldEvent);
    pushPrompt(); // the world reacts live, no cut
    void e.persona.updatePersona(personaPromptFor(r, b, history.current, branch));
    if (e.futures) void e.futures.play(branch.id);

    if ("ending" in branch.next) {
      const end = endingOf(r, branch.next.ending);
      if (end) window.setTimeout(() => void finishStory(end), ENDING_DELAY_MS);
    } else {
      pendingBeat.current = branch.next.beat; // starts when the player walks on
    }
  };

  /** Walking away after a choice ends the call and opens the next beat. */
  const leaveEncounter = () => {
    const e = engine.current;
    const next = pendingBeat.current;
    if (!e || !next || phaseRef.current !== "resolved") return;
    pendingBeat.current = null;
    void e.persona.endCall();
    setPersonaShown(false);
    gs.current.personaSpawn = null;
    pushPrompt();
    setBeat(next);
    forwardChunks.current = 0;
    setProgress(0);
    setPhase("explore");
  };

  const handlePlayerText = async (text: string, fromVoice: boolean) => {
    const e = engine.current;
    if (!e || phaseRef.current !== "encounter") return;
    if (!fromVoice) {
      lastTyped.current = text;
      addLine("You", text);
      void e.persona.say(text); // the persona answers in her own voice
    }
    const b = currentBeat();
    const r = await resolveChoice(recipeRef.current.id, b, text, transcript.current);
    const branch = b.branches.find((x) => x.id === r.branchId);
    if (branch) await commit(branch);
  };

  const choose = async (branch: Branch) => {
    const e = engine.current;
    if (!e || phaseRef.current !== "encounter") return;
    const line = `I choose to ${branch.label.toLowerCase()}.`;
    lastTyped.current = line;
    addLine("You", line);
    await commit(branch); // update the persona first...
    void e.persona.say(line); // ...so her reply already knows the outcome
  };

  const reanchor = async () => {
    const e = engine.current;
    if (!e || !["explore", "encounter", "resolved", "ending"].includes(phaseRef.current)) return;
    flash("Returning the world to its first frame…");
    const ok = await e.world.restartFromFirstFrame(worldPrompt()); // story events are kept in the prompt
    if (!ok) flash("The world could not restart.");
  };

  /* ---------------- lifecycle ---------------- */

  const start = async () => {
    const r = recipeRef.current;
    setPhase("starting");
    setStatus("Connecting to the world, the persona and the preview models…");
    gs.current = { moving: false, held: [], personaSpawn: null, events: [] };
    history.current = [];
    transcript.current = [];
    pendingBeat.current = null;
    lastBranch.current = null;
    forwardChunks.current = 0;
    setBeat(r.startBeat);
    setLines([]);
    setPath([]);
    setEnding(null);
    setChosenId(null);
    setProgress(0);
    setCoherence(null);

    const world = new WorldController();
    const persona = new PersonaController();
    const fut = useFutures ? new FuturesController() : null;
    engine.current = { world, persona, futures: fut };

    if (worldVideo.current) world.attach(worldVideo.current);
    if (personaVideo.current && personaAudio.current) persona.attach(personaVideo.current, personaAudio.current);
    if (fut && futureVideo.current && futureAudio.current) fut.attach(futureVideo.current, futureAudio.current);

    world.model.on("statusChanged", (st) => setStatuses((x) => ({ ...x, world: st })));
    persona.model.on("statusChanged", (st) => setStatuses((x) => ({ ...x, persona: st })));
    fut?.model.on("statusChanged", (st) => setStatuses((x) => ({ ...x, futures: st })));

    world.onError = (m) => flash(`World: ${m.reason}`);
    persona.onError = (m) => flash(`Persona: ${m.reason}`);
    if (fut) {
      fut.onError = (m) => flash(`Previews: ${m.reason}`);
      fut.onChange = setFutures;
    }
    world.onCoherence = setCoherence;
    world.onInputChange = () => {
      gs.current.moving = world.moving;
      gs.current.held = world.held;
      pushPrompt();
      if (world.moving && phaseRef.current === "resolved") leaveEncounter();
    };
    world.onChunk = (m) => {
      if (phaseRef.current !== "explore") return;
      if (m.active_action.includes("w")) {
        forwardChunks.current += 1;
        setProgress(Math.min(1, forwardChunks.current / ENCOUNTER_AFTER_CHUNKS));
        if (forwardChunks.current >= ENCOUNTER_AFTER_CHUNKS) void triggerEncounter();
      }
    };
    persona.onState = (st) => setPersonaLive(st.phase === "live");
    persona.onTranscript = (m) => {
      if (!m.final) return;
      if (m.speaker === "user" && m.text.trim() === lastTyped.current.trim()) return; // our own say()
      addLine(m.speaker === "user" ? "You" : recipeRef.current.persona.name, m.text);
      if (m.speaker === "user") void handlePlayerText(m.text, true); // spoken reply
    };

    try {
      await Promise.all([
        world.connect().then(async () => {
          const ok = await world.start(r, worldPrompt());
          if (!ok) throw new Error("The world model refused the starting image or prompt.");
        }),
        persona.connect().then(() => persona.prepareAvatar(r)),
        fut ? fut.connect(r) : Promise.resolve(),
      ]);
      setStatus("");
      setPhase("explore");
    } catch (err) {
      setStatus((err as Error).message);
      setPhase("error");
    }
  };

  const stop = async () => {
    const e = engine.current;
    engine.current = null;
    releaseMic();
    setPhase("setup");
    setStatus("");
    setFutures([]);
    setPersonaShown(false);
    setPersonaLive(false);
    if (e) await Promise.allSettled([e.world.disconnect(), e.persona.disconnect(), e.futures?.disconnect()]);
  };

  useEffect(() => {
    recipeRef.current = recipe;
    if (phaseRef.current === "setup" || phaseRef.current === "error") setBeat(recipe.startBeat);
  }, [recipe]);

  // Connected sessions bill while idle: disconnect everything on unmount.
  useEffect(() => () => void stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: WASD move, arrows look, 1-3 actions, E approach, P first frame. Never hijack typing.
  useEffect(() => {
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    const down = (ev: KeyboardEvent) => {
      const e = engine.current;
      if (!e || typing(ev.target) || ev.repeat) return;
      if (ev.code === "KeyE" && phaseRef.current === "explore") {
        ev.preventDefault();
        void triggerEncounter();
        return;
      }
      if (ev.code === "KeyP") {
        ev.preventDefault();
        void reanchor();
        return;
      }
      if (["explore", "encounter", "resolved", "ending"].includes(phaseRef.current) && e.world.press(ev.code)) ev.preventDefault();
    };
    const up = (ev: KeyboardEvent) => {
      const e = engine.current;
      if (!e || typing(ev.target)) return;
      if (e.world.release(ev.code)) ev.preventDefault();
    };
    const blur = () => engine.current?.world.releaseAll();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerEncounter]);

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!input.trim()) {
      setInputError("Type something first.");
      return;
    }
    setInputError("");
    void handlePlayerText(input.trim(), false);
    setInput("");
  };

  const live = ["explore", "encounter", "resolved", "ending"].includes(phase);
  const futureFor = (key: string) => futures.find((f) => f.key === key);
  const endingFuture = ending ? futureFor(`ending:${ending.id}`) : undefined;

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <h1>{recipe.title}</h1>
          <p className="muted mono">LingBot-World-2 · Vidu-S2-Avatar · H3 Reference Turbo Realtime</p>
        </div>
        <div className="row">
          <label className="field">
            <span className="muted">Story</span>
            <select value={recipeId} disabled={phase !== "setup" && phase !== "error"} onChange={(e) => setRecipeId(e.target.value)}>
              {RECIPES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.priority}. {r.title}
                </option>
              ))}
            </select>
          </label>
          <span className="badge mono">world {statuses.world}</span>
          <span className="badge mono">persona {statuses.persona}</span>
          {useFutures && <span className="badge mono">previews {statuses.futures}</span>}
          {coherence !== null && <span className="badge mono">coherence {coherence}</span>}
          {phase === "setup" || phase === "error" ? (
            <button className="primary" onClick={start}>Start</button>
          ) : (
            <button onClick={stop}>Stop</button>
          )}
        </div>
      </header>

      <main className="main">
        <section className="stage">
          <video ref={worldVideo} className="world" autoPlay playsInline muted />
          {!live && (
            <div className="cover">
              <h2>{recipe.title}</h2>
              <p>{recipe.logline}</p>
              <p className="muted">{status || recipe.fit}</p>
              {phase === "setup" && (
                <div className="col">
                  <label className="check">
                    <input type="checkbox" checked={useVoice} onChange={(e) => setUseVoice(e.target.checked)} />
                    Talk to {recipe.persona.name.toLowerCase()} with my microphone
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={useFutures} onChange={(e) => setUseFutures(e.target.checked)} />
                    Render previews and the ending with H3 Reference
                  </label>
                </div>
              )}
            </div>
          )}

          {live && (
            <div className="hud mono">
              {phase === "explore" && `${beat.title} · walk on (W) · ${Math.round(progress * 100)}% · E to approach`}
              {phase === "encounter" && (personaLive ? `${recipe.persona.name} is speaking. Answer below.` : `${recipe.persona.name} notices you…`)}
              {phase === "resolved" && (pendingBeat.current ? "Walk on (W) when you are ready." : "The story is ending…")}
              {phase === "ending" && ending && `Ending: ${ending.title}`}
              <span className="muted"> · 1-3 actions · P first frame</span>
            </div>
          )}

          <div className={`persona ${personaShown ? "show" : ""}`}>
            <div className="row between">
              <strong>{recipe.persona.name}</strong>
              <span className="mono accent">Vidu-S2-Avatar</span>
            </div>
            <video ref={personaVideo} autoPlay playsInline />
            <audio ref={personaAudio} autoPlay />
          </div>

          {phase === "ending" && ending && (
            <div className="endcard">
              <span className="mono accent">Ending</span>
              <h2>{ending.title}</h2>
              <button className="primary" onClick={async () => { await stop(); }}>Back to stories</button>
            </div>
          )}

          {toast && <div className="toast">{toast}</div>}
        </section>

        <aside className="side">
          <div className="panel">
            <div className="row between">
              <h3>{beat.title}</h3>
              <span className="muted mono">{phase === "encounter" ? "pick one or say it" : "unlocks at the encounter"}</span>
            </div>
            {beat.branches.map((b) => (
              <button
                key={b.id}
                className={`choice ${chosenId === b.id ? "picked" : ""}`}
                disabled={phase !== "encounter"}
                onClick={() => choose(b)}
              >
                <span className="mono accent">{b.verb}</span>
                <span>{b.label}</span>
              </button>
            ))}
            <form onSubmit={submit} className="col">
              <label htmlFor="say" className="muted">Or say it your way</label>
              <div className="row">
                <input
                  id="say"
                  value={input}
                  disabled={phase !== "encounter"}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setInputError("");
                  }}
                  placeholder={`Talk to ${recipe.persona.name}…`}
                />
                <button type="submit" disabled={phase !== "encounter"}>Send</button>
              </div>
              {inputError && <span className="error">{inputError}</span>}
            </form>
            <div className="actions mono muted">
              {recipe.actions.map((a) => (
                <span key={a.key}>{a.key.replace("Digit", "")} {a.label}</span>
              ))}
            </div>
          </div>

          {useFutures && (
            <div className="panel">
              <div className="row between">
                <h3>{ending ? "Ending" : "Futures"}</h3>
                <span className="muted mono">H3 Reference · hero + persona + world</span>
              </div>
              <video ref={futureVideo} className="future" autoPlay playsInline />
              <audio ref={futureAudio} autoPlay />
              {ending ? (
                <div className="future-row static">
                  <span>{ending.title}</span>
                  <span className="mono muted">{endingFuture ? endingFuture.status : "queuing"}</span>
                </div>
              ) : (
                beat.branches.map((b) => {
                  const f = futureFor(b.id);
                  return (
                    <button key={b.id} className="future-row" disabled={!f || f.status !== "ready"} onClick={() => engine.current?.futures?.play(b.id)}>
                      <span>{b.label}</span>
                      <span className="mono muted">{f ? f.status : "—"}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}

          <div className="panel">
            <h3>Story so far</h3>
            {path.length === 0 ? <p className="muted">Your choices appear here.</p> : (
              <ol className="path">{path.map((p, i) => <li key={i}>{p}</li>)}</ol>
            )}
          </div>

          <div className="panel grow">
            <h3>Conversation</h3>
            <div className="log">
              {lines.length === 0 && <p className="muted">The transcript appears here.</p>}
              {lines.map((l, i) => (
                <p key={i}>
                  <strong>{l.who}:</strong> {l.text}
                </p>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
