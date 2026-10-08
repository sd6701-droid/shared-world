// Frame signatures for a visual-coherence score, adapted from Reactor's
// World Model Arcade (reactor-team/reactor-cookbook, Apache-2.0).
//
// As in the arcade, the score is DIAGNOSTIC: a live world is supposed to move
// away from its starting frame, so a low score never triggers anything on its
// own. It tells you (and the player) when it may be time to press P and
// return the world to its first frame.

export type FrameSignature = {
  cells: number[];
  edges: number[];
  averageLuma: number;
  contrast: number;
};

const W = 96;
const H = 54;
const COLS = 8;
const ROWS = 5;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function signatureFromCanvas(canvas: HTMLCanvasElement): FrameSignature {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("A 2D canvas context is unavailable.");
  const px = ctx.getImageData(0, 0, W, H).data;
  const cells: number[] = [];
  const edges: number[] = [];
  const lumas: number[] = [];
  const cw = W / COLS;
  const ch = H / ROWS;

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      let r = 0, g = 0, b = 0, n = 0, edge = 0;
      for (let y = Math.floor(row * ch); y < Math.floor((row + 1) * ch); y += 1) {
        for (let x = Math.floor(col * cw); x < Math.floor((col + 1) * cw); x += 1) {
          const i = (y * W + x) * 4;
          r += px[i]; g += px[i + 1]; b += px[i + 2]; n += 1;
          const luma = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          lumas.push(luma);
          if (x + 1 < W) {
            const j = i + 4;
            const right = 0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2];
            edge += Math.abs(luma - right);
          }
        }
      }
      cells.push(r / n, g / n, b / n);
      edges.push(edge / n);
    }
  }
  const averageLuma = lumas.reduce((s, v) => s + v, 0) / lumas.length;
  const contrast = Math.sqrt(lumas.reduce((s, v) => s + (v - averageLuma) ** 2, 0) / lumas.length);
  return { cells, edges, averageLuma, contrast };
}

function sampleCanvas() {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return c;
}

export async function signatureFromBlob(blob: Blob): Promise<FrameSignature> {
  const c = sampleCanvas();
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("A 2D canvas context is unavailable.");
  const bitmap = await createImageBitmap(blob);
  ctx.drawImage(bitmap, 0, 0, W, H);
  bitmap.close();
  return signatureFromCanvas(c);
}

export function signatureFromVideo(video: HTMLVideoElement): FrameSignature | null {
  if (video.readyState < 2 || !video.videoWidth) return null;
  const c = sampleCanvas();
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, W, H);
  return signatureFromCanvas(c);
}

/** 0-100: how close a frame is to the reference in colour layout, edges and light. */
export function compareSignatures(ref: FrameSignature, cand: FrameSignature): number {
  const colorError = ref.cells.reduce((s, v, i) => s + Math.abs(v - cand.cells[i]), 0) / ref.cells.length / 255;
  const edgeError = ref.edges.reduce((s, v, i) => s + Math.abs(v - cand.edges[i]), 0) / ref.edges.length / 96;
  const lumaError = Math.abs(ref.averageLuma - cand.averageLuma) / 255;
  const contrastError = Math.abs(ref.contrast - cand.contrast) / 96;
  const error = colorError * 0.5 + clamp(edgeError, 0, 1) * 0.26 + lumaError * 0.14 + clamp(contrastError, 0, 1) * 0.1;
  return Math.round(clamp((1 - error) * 100, 0, 100));
}
