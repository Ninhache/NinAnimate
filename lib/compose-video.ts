/**
 * Compose the slideshow into a video entirely in-browser — NO screen capture.
 *
 * We re-render the "magic move" ourselves onto a canvas: Shiki tokenizes each
 * slide, shiki-magic-move's `syncTokenKeys` tells us which tokens are the same
 * across two slides (so they glide) vs. entering/leaving (so they fade), and we
 * interpolate token positions/opacity per frame and draw the text directly.
 *
 * Frames are encoded frame-perfect with WebCodecs `VideoEncoder` and muxed to
 * MP4 (`mp4-muxer`). Where WebCodecs is unavailable we fall back to recording
 * our own canvas with `MediaRecorder` (WebM) — still cursor-free and with no
 * permission prompt, because we record our canvas, not the screen.
 *
 * Browser-only; import() this lazily from a click handler so it never enters
 * the SSR/static-export graph.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { codeToKeyedTokens, syncTokenKeys } from "@shikijs/magic-move/core";
import type { HighlighterCore } from "shiki/core";

const FONT_STACK =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const BG_COLOR = "#030712"; // tailwind gray-950, matches the live preview
const LINE_HEIGHT = 1.5;

// Framing/quality bounds. Capped to 1280x720 so we can use the universally
// decodable H.264 baseline level 3.1.
const TARGET_W = 1280;
const TARGET_H = 720;
const FONT_MIN = 16;
const FONT_MAX = 56;
// Breathing room (px) between the code and the edges of the video frame.
const DEFAULT_PAD = 72;

export type ComposeOptions = {
  highlighter: HighlighterCore;
  codes: string[];
  lang: string;
  theme: string;
  fps?: number;
  holdMs?: number;
  transitionMs?: number;
  /** Padding (px) around the code inside the video frame. Default 72. */
  paddingPx?: number;
  onProgress?: (ratio: number) => void;
};

export type ComposeResult = { blob: Blob; mimeType: string; ext: "mp4" | "webm" };

/** A token positioned in canvas pixels. */
type PlacedToken = {
  key: string;
  content: string;
  color: string;
  x: number;
  y: number;
  bold: boolean;
  italic: boolean;
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// ease-in-out cubic, matching the live preview's "ease-in-out".
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Offsets at which each line of `code` begins (for offset → line/col mapping). */
function lineStarts(code: string): number[] {
  const starts = [0];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

/** Largest line count and longest line across all slides. */
function measure(codes: string[]): { maxLines: number; maxCols: number } {
  let maxLines = 1;
  let maxCols = 1;
  for (const code of codes) {
    const lines = code.split("\n");
    maxLines = Math.max(maxLines, lines.length);
    for (const line of lines) maxCols = Math.max(maxCols, line.length);
  }
  return { maxLines, maxCols };
}

/**
 * Convert keyed tokens into canvas-placed tokens, deriving line/column from
 * each token's character offset (monospace → x = col*charW, y = line*lineH).
 * Pure-whitespace tokens are skipped (nothing to draw).
 */
function placeTokens(
  info: { tokens: ReadonlyArray<{ content: string; offset: number; color?: string; fontStyle?: number; key: string }>; fg?: string },
  code: string,
  charW: number,
  lineH: number,
  pad: number
): PlacedToken[] {
  const starts = lineStarts(code);
  const placed: PlacedToken[] = [];
  for (const t of info.tokens) {
    if (!t.content || !t.content.trim()) continue;
    // Binary search for the line whose start offset is <= token offset.
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= t.offset) lo = mid;
      else hi = mid - 1;
    }
    const col = t.offset - starts[lo];
    placed.push({
      key: t.key,
      content: t.content,
      color: t.color || info.fg || "#f8f8f2",
      x: pad + col * charW,
      y: pad + lo * lineH,
      // shiki FontStyle bitmask: Italic=1, Bold=2.
      bold: !!(t.fontStyle && t.fontStyle & 2),
      italic: !!(t.fontStyle && t.fontStyle & 1),
    });
  }
  return placed;
}

/**
 * Build the per-frame draw timeline and the canvas. Returns a `drawAt(ms)`
 * function plus geometry/encoding metadata. This is shared by both the
 * WebCodecs and MediaRecorder paths.
 */
function buildScene(opts: Required<Omit<ComposeOptions, "onProgress">>) {
  const { highlighter, codes, lang, theme, paddingPx: pad } = opts;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D canvas context.");

  // Monospace advance-width ratio (measure once at a reference size).
  ctx.font = `100px ${FONT_STACK}`;
  const charRatio = ctx.measureText("M").width / 100;

  const { maxLines, maxCols } = measure(codes);
  const fitH = (TARGET_H - 2 * pad) / (maxLines * LINE_HEIGHT);
  const fitW = (TARGET_W - 2 * pad) / (maxCols * charRatio);
  const fontPx = Math.max(
    FONT_MIN,
    Math.min(FONT_MAX, Math.floor(Math.min(fitH, fitW)))
  );
  const charW = charRatio * fontPx;
  const lineH = LINE_HEIGHT * fontPx;

  // Tight canvas sized to the largest slide; even dimensions for H.264.
  let W = Math.min(TARGET_W, Math.ceil(maxCols * charW + 2 * pad));
  let H = Math.min(TARGET_H, Math.ceil(maxLines * lineH + 2 * pad));
  W += W % 2;
  H += H % 2;
  canvas.width = W;
  canvas.height = H;

  const tokenOpts = { lang, theme } as Parameters<
    HighlighterCore["codeToTokens"]
  >[1];

  // Static tokens per slide (for the holds).
  const staticToks = codes.map((code) =>
    placeTokens(
      codeToKeyedTokens(highlighter as never, code, tokenOpts) as never,
      code,
      charW,
      lineH,
      pad
    )
  );

  // Matched from/to token sets per transition (slide i-1 → i).
  const transitions: Array<{ from: PlacedToken[]; to: PlacedToken[] }> = [];
  for (let i = 1; i < codes.length; i++) {
    const a = codeToKeyedTokens(highlighter as never, codes[i - 1], tokenOpts);
    const b = codeToKeyedTokens(highlighter as never, codes[i], tokenOpts);
    const synced = syncTokenKeys(a, b);
    transitions.push({
      from: placeTokens(synced.from as never, codes[i - 1], charW, lineH, pad),
      to: placeTokens(synced.to as never, codes[i], charW, lineH, pad),
    });
  }

  const setFont = (tk: PlacedToken) => {
    ctx.font = `${tk.italic ? "italic " : ""}${tk.bold ? "bold " : ""}${fontPx}px ${FONT_STACK}`;
  };

  const clearBg = () => {
    ctx.globalAlpha = 1;
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "top";
  };

  const drawStatic = (toks: PlacedToken[]) => {
    clearBg();
    for (const tk of toks) {
      setFont(tk);
      ctx.fillStyle = tk.color;
      ctx.fillText(tk.content, tk.x, tk.y);
    }
  };

  const drawMorph = (from: PlacedToken[], to: PlacedToken[], t: number) => {
    clearBg();
    const fromByKey = new Map(from.map((tk) => [tk.key, tk]));
    const toByKey = new Map(to.map((tk) => [tk.key, tk]));
    const p = easeInOut(t);

    // Leaving tokens fade out over the first half, in place.
    const leaveAlpha = 1 - clamp01(t * 2);
    if (leaveAlpha > 0) {
      for (const tk of from) {
        if (toByKey.has(tk.key)) continue;
        ctx.globalAlpha = leaveAlpha;
        setFont(tk);
        ctx.fillStyle = tk.color;
        ctx.fillText(tk.content, tk.x, tk.y);
      }
    }

    // Matched tokens glide; entering tokens fade in over the second half.
    const enterAlpha = clamp01((t - 0.5) * 2);
    for (const tk of to) {
      const src = fromByKey.get(tk.key);
      let x = tk.x;
      let y = tk.y;
      let alpha = 1;
      if (src) {
        x = lerp(src.x, tk.x, p);
        y = lerp(src.y, tk.y, p);
      } else {
        alpha = enterAlpha;
      }
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha;
      setFont(tk);
      ctx.fillStyle = tk.color;
      ctx.fillText(tk.content, x, y);
    }
    ctx.globalAlpha = 1;
  };

  // Timeline segments (ms).
  const holdMs = opts.holdMs;
  const transMs = opts.transitionMs;
  type Seg =
    | { kind: "hold"; slide: number; dur: number }
    | { kind: "trans"; index: number; dur: number };
  const segments: Seg[] = [{ kind: "hold", slide: 0, dur: holdMs }];
  for (let i = 1; i < codes.length; i++) {
    segments.push({ kind: "trans", index: i - 1, dur: transMs });
    segments.push({ kind: "hold", slide: i, dur: holdMs });
  }
  const totalMs = segments.reduce((s, seg) => s + seg.dur, 0);

  const drawAt = (ms: number) => {
    let acc = 0;
    for (const seg of segments) {
      if (ms < acc + seg.dur) {
        if (seg.kind === "hold") drawStatic(staticToks[seg.slide]);
        else {
          const tr = transitions[seg.index];
          drawMorph(tr.from, tr.to, clamp01((ms - acc) / seg.dur));
        }
        return;
      }
      acc += seg.dur;
    }
    drawStatic(staticToks[codes.length - 1]);
  };

  return { canvas, drawAt, totalMs, W, H };
}

/** Encode the scene to MP4 with WebCodecs. */
async function encodeWithWebCodecs(
  scene: ReturnType<typeof buildScene>,
  fps: number,
  onProgress?: (ratio: number) => void
): Promise<ComposeResult> {
  const { canvas, drawAt, totalMs, W, H } = scene;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: W, height: H, frameRate: fps },
    fastStart: "in-memory",
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      throw e;
    },
  });
  encoder.configure({
    codec: "avc1.42001f", // H.264 baseline level 3.1
    width: W,
    height: H,
    bitrate: 6_000_000,
    framerate: fps,
    // Emit length-prefixed AVCC (with an avcC/SPS-PPS description in the chunk
    // metadata) instead of Annex-B. mp4-muxer needs AVCC to write a valid track;
    // without this the .mp4 has an undecodable H.264 stream ("could not decode
    // the format h264" in VLC).
    avc: { format: "avc" },
  });

  const totalFrames = Math.max(1, Math.round((totalMs / 1000) * fps));
  const frameDur = Math.round(1_000_000 / fps);
  const keyEvery = fps * 2;

  for (let f = 0; f < totalFrames; f++) {
    drawAt((f * 1000) / fps);
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round((f * 1_000_000) / fps),
      duration: frameDur,
    });
    encoder.encode(frame, { keyFrame: f % keyEvery === 0 });
    frame.close();
    onProgress?.(f / totalFrames);
    // Backpressure: let the encoder drain so we don't balloon memory.
    while (encoder.encodeQueueSize > 10) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await encoder.flush();
  muxer.finalize();
  onProgress?.(1);

  return {
    blob: new Blob([muxer.target.buffer], { type: "video/mp4" }),
    mimeType: "video/mp4",
    ext: "mp4",
  };
}

/** Fallback: record our own canvas in real time to WebM. No screen capture. */
async function encodeWithMediaRecorder(
  scene: ReturnType<typeof buildScene>,
  fps: number,
  onProgress?: (ratio: number) => void
): Promise<ComposeResult> {
  const { canvas, drawAt, totalMs } = scene;
  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(
    (t) => MediaRecorder.isTypeSupported(t)
  );
  if (!mimeType) throw new Error("This browser cannot export video.");

  const stream = canvas.captureStream(fps);
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType });
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const done = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start();

  await new Promise<void>((resolve) => {
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      drawAt(Math.min(elapsed, totalMs));
      onProgress?.(clamp01(elapsed / totalMs));
      if (elapsed < totalMs) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });

  recorder.stop();
  await done;
  onProgress?.(1);

  return {
    blob: new Blob(chunks, { type: mimeType }),
    mimeType,
    ext: "webm",
  };
}

/**
 * Compose the whole slideshow to a video. Prefers WebCodecs/MP4; falls back to
 * MediaRecorder/WebM where WebCodecs isn't available.
 */
export async function composeSlidesVideo(
  options: ComposeOptions
): Promise<ComposeResult> {
  const opts = {
    fps: 30,
    holdMs: 1400,
    transitionMs: 900,
    paddingPx: DEFAULT_PAD,
    ...options,
  } as Required<Omit<ComposeOptions, "onProgress">> & {
    onProgress?: (ratio: number) => void;
  };

  // Make sure the monospace font is ready before measuring/drawing.
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const scene = buildScene(opts);

  const hasWebCodecs = typeof VideoEncoder !== "undefined";
  if (hasWebCodecs) {
    try {
      return await encodeWithWebCodecs(scene, opts.fps, options.onProgress);
    } catch (err) {
      console.warn("WebCodecs export failed, falling back to WebM:", err);
    }
  }
  return encodeWithMediaRecorder(scene, opts.fps, options.onProgress);
}

/** Trigger a browser download of a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
