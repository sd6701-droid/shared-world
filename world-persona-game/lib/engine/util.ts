import type { Reactor } from "@reactor-team/js-sdk";

/** Resolves once the session reaches "ready" (GPU assigned, media live). */
export function waitForReady(reactor: Reactor, timeoutMs = 180_000): Promise<void> {
  if (reactor.getStatus() === "ready") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reactor.off("statusChanged", onStatus);
      reject(new Error("Timed out waiting for a model session to become ready"));
    }, timeoutMs);
    function onStatus(status: string) {
      if (status === "ready") {
        clearTimeout(timer);
        reactor.off("statusChanged", onStatus);
        resolve();
      }
    }
    reactor.on("statusChanged", onStatus);
  });
}

/** Grab the current frame of a <video> as a JPEG blob (for Fast-H3 starting frames). */
export function grabFrame(video: HTMLVideoElement, quality = 0.9): Promise<Blob | null> {
  if (!video.videoWidth || !video.videoHeight) return Promise.resolve(null);
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, 0, 0);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

export async function loadPublicImage(path: string): Promise<Blob> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Missing image ${path}. Generate it with the prompt in lib/scenes.ts and put it in public${path}.`);
  }
  return res.blob();
}
