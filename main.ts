// main.ts — "A Letter, on Paper": one invitation image, written to /output/entry.png.
// Deterministic: every pixel is a pure function of (x, y) and fixed constants.
// Node 22, standard library only.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- canvas
const img = new Uint8ClampedArray(W * H * 3);

function px(x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 3;
  const ia = a > 1 ? 1 : a;
  img[i] = img[i] + (r - img[i]) * ia;
  img[i + 1] = img[i + 1] + (g - img[i + 1]) * ia;
  img[i + 2] = img[i + 2] + (b - img[i + 2]) * ia;
}

// ---------------------------------------------------------------- geometry helpers
type Pt = [number, number];

function segDist(px0: number, py0: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) t = ((px0 - ax) * dx + (py0 - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px0 - cx, py0 - cy);
}

function drawSeg(ax: number, ay: number, bx: number, by: number, r: number, col: [number, number, number], a = 1): void {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = segDist(x + 0.5, y + 0.5, ax, ay, bx, by);
      const cov = r + 0.5 - d;
      if (cov > 0) px(x, y, col[0], col[1], col[2], Math.min(1, cov) * a);
    }
  }
}

function drawDisc(cx: number, cy: number, r: number, col: [number, number, number], a = 1): void {
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(H - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cov = r + 0.5 - d;
      if (cov > 0) px(x, y, col[0], col[1], col[2], Math.min(1, cov) * a);
    }
  }
}

function drawPolyline(pts: Pt[], r: number, col: [number, number, number], a = 1): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    drawSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r, col, a);
  }
}

function drawClosed(pts: Pt[], r: number, col: [number, number, number], a = 1): void {
  drawPolyline(pts, r, col, a);
  drawSeg(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], r, col, a);
}

function arcPts(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, steps = 22): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (a0 + ((a1 - a0) * i) / steps) * (Math.PI / 180);
    out.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return out;
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number, steps = 30): Pt[] {
  return arcPts(cx, cy, rx, ry, 0, 360, steps);
}

// ---------------------------------------------------------------- the stroke font
// Each glyph: advance width w (units; cap height = 0.8, baseline y = 0.8,
// descender to y = 1.0) and polylines in that unit space.
type Glyph = { w: number; polys: number[][][] };

function e(cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = 360): number[][] {
  return arcPts(cx, cy, rx, ry, a0, a1).map((p) => [p[0], p[1]]);
}

const G: Record<string, Glyph> = {
  A: { w: 0.68, polys: [[[0, 0.8], [0.34, 0], [0.68, 0.8]], [[0.14, 0.5], [0.54, 0.5]]] },
  B: { w: 0.62, polys: [[[0, 0], [0, 0.8]], [[0, 0], [0.36, 0], [0.5, 0.08], [0.5, 0.28], [0.36, 0.36], [0, 0.36]], [[0, 0.36], [0.42, 0.36], [0.6, 0.44], [0.6, 0.68], [0.42, 0.8], [0, 0.8]]] },
  C: { w: 0.66, polys: [e(0.36, 0.4, 0.34, 0.42, 55, 305)] },
  D: { w: 0.66, polys: [[[0, 0], [0, 0.8]], [[0, 0], [0.4, 0], [0.62, 0.14], [0.62, 0.66], [0.4, 0.8], [0, 0.8]]] },
  E: { w: 0.58, polys: [[[0.56, 0], [0, 0], [0, 0.8], [0.56, 0.8]], [[0, 0.4], [0.44, 0.4]]] },
  F: { w: 0.56, polys: [[[0.56, 0], [0, 0], [0, 0.8]], [[0, 0.4], [0.42, 0.4]]] },
  G: { w: 0.7, polys: [e(0.38, 0.4, 0.36, 0.42, 50, 310), [[0.72, 0.4], [0.42, 0.4], [0.42, 0.54]]] },
  H: { w: 0.66, polys: [[[0, 0], [0, 0.8]], [[0.66, 0], [0.66, 0.8]], [[0, 0.4], [0.66, 0.4]]] },
  I: { w: 0.26, polys: [[[0.13, 0], [0.13, 0.8]], [[0, 0], [0.26, 0]], [[0, 0.8], [0.26, 0.8]]] },
  J: { w: 0.5, polys: [[[0.44, 0], [0.44, 0.58], [0.3, 0.8], [0.1, 0.8], [0, 0.66]]] },
  K: { w: 0.62, polys: [[[0, 0], [0, 0.8]], [[0.6, 0], [0.02, 0.44], [0.6, 0.8]]] },
  L: { w: 0.54, polys: [[[0, 0], [0, 0.8], [0.5, 0.8]]] },
  M: { w: 0.8, polys: [[[0, 0.8], [0, 0], [0.4, 0.46], [0.8, 0], [0.8, 0.8]]] },
  N: { w: 0.68, polys: [[[0, 0.8], [0, 0], [0.68, 0.8], [0.68, 0]]] },
  O: { w: 0.7, polys: [e(0.36, 0.4, 0.36, 0.42)] },
  P: { w: 0.6, polys: [[[0, 0], [0, 0.8]], [[0, 0], [0.38, 0], [0.54, 0.1], [0.54, 0.3], [0.38, 0.4], [0, 0.4]]] },
  Q: { w: 0.7, polys: [e(0.36, 0.4, 0.36, 0.42), [[0.5, 0.6], [0.72, 0.86]]] },
  R: { w: 0.6, polys: [[[0, 0], [0, 0.8]], [[0, 0], [0.38, 0], [0.54, 0.1], [0.54, 0.3], [0.38, 0.4], [0, 0.4]], [[0.3, 0.4], [0.6, 0.8]]] },
  S: { w: 0.6, polys: [[[0.56, 0.12], [0.4, 0], [0.18, 0], [0.06, 0.1], [0.06, 0.24], [0.18, 0.34], [0.42, 0.36], [0.54, 0.44], [0.54, 0.66], [0.42, 0.8], [0.18, 0.8], [0.04, 0.68]]] },
  T: { w: 0.6, polys: [[[0, 0], [0.6, 0]], [[0.3, 0], [0.3, 0.8]]] },
  U: { w: 0.66, polys: [[[0, 0], [0, 0.56], [0.2, 0.78], [0.46, 0.78], [0.66, 0.56], [0.66, 0]]] },
  V: { w: 0.64, polys: [[[0, 0], [0.32, 0.8], [0.64, 0]]] },
  W: { w: 0.9, polys: [[[0, 0], [0.22, 0.8], [0.45, 0.3], [0.68, 0.8], [0.9, 0]]] },
  X: { w: 0.62, polys: [[[0, 0], [0.62, 0.8]], [[0.62, 0], [0, 0.8]]] },
  Y: { w: 0.64, polys: [[[0, 0], [0.32, 0.34]], [[0.64, 0], [0.32, 0.34]], [[0.32, 0.34], [0.32, 0.8]]] },
  Z: { w: 0.58, polys: [[[0, 0], [0.58, 0], [0, 0.8], [0.58, 0.8]]] },
  a: { w: 0.58, polys: [e(0.21, 0.59, 0.22, 0.21), [[0.43, 0.38], [0.43, 0.8]]] },
  b: { w: 0.58, polys: [[[0.06, 0], [0.06, 0.8]], e(0.34, 0.59, 0.24, 0.21)] },
  c: { w: 0.5, polys: [e(0.27, 0.59, 0.22, 0.21, 60, 300)] },
  d: { w: 0.58, polys: [e(0.24, 0.59, 0.24, 0.21), [[0.48, 0.05], [0.48, 0.8]]] },
  e: { w: 0.52, polys: [[[0.5, 0.58], [0.07, 0.58]], e(0.28, 0.59, 0.22, 0.21, 15, 345)] },
  f: { w: 0.34, polys: [[[0.3, 0.02], [0.18, 0], [0.08, 0.08], [0.08, 0.8]], [[0.0, 0.34], [0.3, 0.34]]] },
  g: { w: 0.56, polys: [e(0.2, 0.59, 0.22, 0.21), [[0.42, 0.38], [0.42, 0.96], [0.28, 1.0], [0.14, 0.96]]] },
  h: { w: 0.56, polys: [[[0.06, 0], [0.06, 0.8]], [[0.06, 0.5], [0.22, 0.38], [0.4, 0.38], [0.5, 0.5], [0.5, 0.8]]] },
  i: { w: 0.22, polys: [[[0.11, 0.38], [0.11, 0.8]], [[0.09, 0.14], [0.13, 0.18]]] },
  j: { w: 0.24, polys: [[[0.16, 0.38], [0.16, 0.94], [0.04, 0.98]], [[0.14, 0.14], [0.18, 0.18]]] },
  k: { w: 0.5, polys: [[[0.08, 0], [0.08, 0.8]], [[0.46, 0.38], [0.08, 0.62]], [[0.18, 0.56], [0.46, 0.8]]] },
  l: { w: 0.22, polys: [[[0.11, 0], [0.11, 0.8]]] },
  m: { w: 0.74, polys: [[[0.06, 0.38], [0.06, 0.8]], [[0.06, 0.5], [0.18, 0.38], [0.3, 0.38], [0.36, 0.5], [0.36, 0.8]], [[0.36, 0.5], [0.48, 0.38], [0.6, 0.38], [0.66, 0.5], [0.66, 0.8]]] },
  n: { w: 0.56, polys: [[[0.06, 0.38], [0.06, 0.8]], [[0.06, 0.5], [0.2, 0.38], [0.4, 0.38], [0.5, 0.5], [0.5, 0.8]]] },
  o: { w: 0.56, polys: [e(0.28, 0.59, 0.24, 0.21)] },
  p: { w: 0.56, polys: [[[0.06, 0.38], [0.06, 1.0]], e(0.3, 0.59, 0.24, 0.21)] },
  q: { w: 0.56, polys: [e(0.26, 0.59, 0.24, 0.21), [[0.5, 0.38], [0.5, 1.0]], [[0.5, 0.94], [0.36, 0.88]]] },
  r: { w: 0.4, polys: [[[0.08, 0.38], [0.08, 0.8]], [[0.08, 0.52], [0.2, 0.4], [0.34, 0.38]]] },
  s: { w: 0.46, polys: [[[0.4, 0.44], [0.28, 0.38], [0.1, 0.4], [0.06, 0.48], [0.14, 0.56], [0.3, 0.6], [0.38, 0.68], [0.32, 0.8], [0.14, 0.8], [0.04, 0.72]]] },
  t: { w: 0.34, polys: [[[0.18, 0.06], [0.18, 0.7], [0.28, 0.8]], [[0.04, 0.3], [0.32, 0.3]]] },
  u: { w: 0.56, polys: [[[0.06, 0.38], [0.06, 0.6]], e(0.28, 0.6, 0.22, 0.2, 180, 0), [[0.5, 0.6], [0.5, 0.38]]] },
  v: { w: 0.5, polys: [[[0.02, 0.38], [0.26, 0.8], [0.5, 0.38]]] },
  w: { w: 0.74, polys: [[[0, 0.38], [0.18, 0.8], [0.37, 0.52], [0.56, 0.8], [0.74, 0.38]]] },
  x: { w: 0.5, polys: [[[0.04, 0.38], [0.5, 0.8]], [[0.5, 0.38], [0.04, 0.8]]] },
  y: { w: 0.5, polys: [[[0.02, 0.38], [0.28, 0.86], [0.5, 0.38]], [[0.28, 0.86], [0.26, 0.98], [0.12, 1.0]]] },
  z: { w: 0.46, polys: [[[0.04, 0.38], [0.46, 0.38], [0.04, 0.8], [0.46, 0.8]]] },
  "0": { w: 0.56, polys: [e(0.28, 0.4, 0.28, 0.42)] },
  "1": { w: 0.4, polys: [[[0.06, 0.12], [0.22, 0], [0.22, 0.8]]] },
  "2": { w: 0.54, polys: [[[0.06, 0.12], [0.2, 0], [0.4, 0], [0.5, 0.14], [0.48, 0.28], [0.06, 0.8], [0.5, 0.8]]] },
  "3": { w: 0.54, polys: [[[0.06, 0.1], [0.2, 0], [0.4, 0], [0.52, 0.12], [0.5, 0.26], [0.34, 0.38], [0.52, 0.5], [0.54, 0.66], [0.4, 0.8], [0.2, 0.8], [0.06, 0.68]]] },
  "4": { w: 0.56, polys: [[[0.42, 0.8], [0.42, 0], [0.04, 0.52], [0.56, 0.52]]] },
  "5": { w: 0.54, polys: [[[0.5, 0], [0.1, 0], [0.06, 0.34], [0.3, 0.26], [0.5, 0.34], [0.56, 0.5], [0.5, 0.7], [0.3, 0.8], [0.1, 0.76], [0.02, 0.66]]] },
  "6": { w: 0.56, polys: [[[0.5, 0.06], [0.3, 0], [0.12, 0.16], [0.06, 0.44], [0.06, 0.6], [0.24, 0.8], [0.42, 0.8], [0.54, 0.66], [0.52, 0.5], [0.36, 0.4], [0.18, 0.44], [0.06, 0.58]]] },
  "7": { w: 0.5, polys: [[[0.02, 0], [0.5, 0], [0.2, 0.8]]] },
  "8": { w: 0.56, polys: [e(0.28, 0.2, 0.22, 0.2), e(0.28, 0.6, 0.26, 0.22)] },
  "9": { w: 0.56, polys: [e(0.28, 0.24, 0.24, 0.22), [[0.52, 0.38], [0.52, 0.7], [0.3, 0.8], [0.12, 0.72], [0.06, 0.6]]] },
  ".": { w: 0.22, polys: [[[0.09, 0.73], [0.13, 0.77]]] },
  ",": { w: 0.22, polys: [[[0.14, 0.68], [0.09, 0.8], [0.03, 0.87]]] },
  "!": { w: 0.22, polys: [[[0.11, 0], [0.11, 0.52]], [[0.09, 0.7], [0.13, 0.74]]] },
  "?": { w: 0.44, polys: [[[0.04, 0.14], [0.14, 0], [0.32, 0], [0.42, 0.12], [0.4, 0.28], [0.24, 0.4], [0.24, 0.5]], [[0.22, 0.68], [0.26, 0.72]]] },
  "'": { w: 0.16, polys: [[[0.08, 0.08], [0.07, 0.24]]] },
  "-": { w: 0.3, polys: [[[0.02, 0.55], [0.28, 0.55]]] },
  "—": { w: 0.5, polys: [[[0.0, 0.55], [0.5, 0.55]]] },
  ":": { w: 0.2, polys: [[[0.08, 0.44], [0.12, 0.48]], [[0.08, 0.7], [0.12, 0.74]]] },
  ";": { w: 0.2, polys: [[[0.08, 0.44], [0.12, 0.48]], [[0.12, 0.68], [0.07, 0.8], [0.02, 0.86]]] },
  "(": { w: 0.3, polys: [e(0.28, 0.4, 0.22, 0.44, 60, 300)] },
  ")": { w: 0.3, polys: [e(0.02, 0.4, 0.22, 0.44, -80, 80)] },
  "/": { w: 0.4, polys: [[[0.06, 0.8], [0.34, 0]]] },
  " ": { w: 0.3, polys: [] },
};

// ---------------------------------------------------------------- text rendering
type Raster = { alphas: Float32Array; w: number; h: number; ox: number; oy: number };
const rasterCache = new Map<string, Raster | null>();

function rasterGlyph(ch: string, s: number, italic: number): Raster | null {
  const key = ch + "|" + s.toFixed(2) + "|" + italic.toFixed(2);
  if (rasterCache.has(key)) return rasterCache.get(key)!;
  const g = G[ch] ?? G["?"];
  const r = Math.max(1.1, s * 0.085);
  // transform unit points to px, with a light italic shear
  const shear = (u: number[]): number[] => {
    const x = u[0] + (0.82 - u[1]) * italic;
    return [x * s, u[1] * s];
  };
  const segs: number[] = [];
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const poly of g.polys) {
    for (let i = 0; i + 1 < poly.length; i++) {
      const a = shear(poly[i]), b = shear(poly[i + 1]);
      segs.push(a[0], a[1], b[0], b[1]);
      minX = Math.min(minX, a[0], b[0]); maxX = Math.max(maxX, a[0], b[0]);
      minY = Math.min(minY, a[1], b[1]); maxY = Math.max(maxY, a[1], b[1]);
    }
  }
  let out: Raster | null = null;
  if (segs.length > 0) {
    const pad = r + 2;
    const bw = Math.ceil(maxX - minX + pad * 2);
    const bh = Math.ceil(maxY - minY + pad * 2);
    const alphas = new Float32Array(bw * bh);
    for (let yy = 0; yy < bh; yy++) {
      const py = minY - pad + yy + 0.5;
      for (let xx = 0; xx < bw; xx++) {
        const ppx = minX - pad + xx + 0.5;
        let dmin = 1e9;
        for (let k = 0; k < segs.length; k += 4) {
          const d = segDist(ppx, py, segs[k], segs[k + 1], segs[k + 2], segs[k + 3]);
          if (d < dmin) dmin = d;
        }
        const cov = r + 0.5 - dmin;
        alphas[yy * bw + xx] = cov <= 0 ? 0 : cov >= 1 ? 1 : cov;
      }
    }
    out = { alphas, w: bw, h: bh, ox: minX - pad, oy: minY - pad };
  }
  rasterCache.set(key, out);
  return out;
}

function textWidth(s: string, size: number, italic: number, tracking: number): number {
  const sc = size / 0.8;
  let w = 0;
  for (const ch of s) {
    const g = G[ch] ?? G["?"];
    w += (g.w + 0.24) * sc + tracking;
  }
  return w > 0 ? w - tracking : 0;
}

function drawText(s: string, x: number, y: number, size: number, col: [number, number, number],
  opts?: { align?: "left" | "center" | "right"; italic?: number; tracking?: number }): void {
  const align = opts?.align ?? "left";
  const italic = opts?.italic ?? 0;
  const tracking = opts?.tracking ?? 0;
  const sc = size / 0.8;
  let pen = x;
  if (align !== "left") pen = x - textWidth(s, size, italic, tracking) * (align === "center" ? 0.5 : 1);
  for (const ch of s) {
    const g = G[ch] ?? G["?"];
    const ra = rasterGlyph(ch, sc, italic);
    if (ra) {
      const bx = Math.round(pen + ra.ox);
      const by = Math.round(y + ra.oy);
      for (let yy = 0; yy < ra.h; yy++) {
        const iy = by + yy;
        if (iy < 0 || iy >= H) continue;
        for (let xx = 0; xx < ra.w; xx++) {
          const a = ra.alphas[yy * ra.w + xx];
          if (a > 0) px(bx + xx, iy, col[0], col[1], col[2], a);
        }
      }
    }
    pen += (g.w + 0.24) * sc + tracking;
  }
}

// ---------------------------------------------------------------- deterministic noise
function hash2(ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

// ---------------------------------------------------------------- palette
const INK: [number, number, number] = [59, 47, 33];
const INK_SOFT: [number, number, number] = [92, 74, 52];
const DOODLE: [number, number, number] = [104, 79, 52];
const RED: [number, number, number] = [166, 61, 47];
const RED_DEEP: [number, number, number] = [140, 44, 34];
const SEAL_INK: [number, number, number] = [243, 224, 200];
const RULE_C: [number, number, number] = [185, 141, 95];

// ---------------------------------------------------------------- background
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = y / H;
    let rC = 249 + (238 - 249) * t;
    let gC = 243 + (224 - 243) * t;
    let bC = 227 + (194 - 227) * t;
    // paper grain (low frequency, so the PNG compresses well)
    const n = (vnoise(x / 52, y / 52) - 0.5) * 9 + (vnoise(x / 11 + 40, y / 11 + 40) - 0.5) * 4.5;
    // faint horizontal fibers
    const fib = (vnoise(x / 2.5 + 90, y / 110 + 7) - 0.5) * 2.5;
    const v = n + fib;
    rC += v; gC += v * 0.95; bC += v * 0.85;
    // vignette
    const dx = x - W / 2, dy = y - H / 2;
    const d = Math.sqrt(dx * dx + dy * dy) / 724;
    const mult = 1 - 0.11 * d * d;
    const i = (y * W + x) * 3;
    img[i] = rC * mult; img[i + 1] = gC * mult; img[i + 2] = bC * mult;
  }
}

// ---------------------------------------------------------------- page border (dashed)
function dashLine(ax: number, ay: number, bx: number, by: number, r: number, col: [number, number, number], dash: number, gap: number): void {
  const len = Math.hypot(bx - ax, by - ay);
  const nx = (bx - ax) / len, ny = (by - ay) / len;
  let t = 0;
  while (t < len) {
    const e = Math.min(t + dash, len);
    drawSeg(ax + nx * t, ay + ny * t, ax + nx * e, ay + ny * e, r, col);
    t = e + gap;
  }
}
{
  const m = 30;
  dashLine(m, m, W - m, m, 1.6, RULE_C, 14, 9);
  dashLine(W - m, m, W - m, H - m, 1.6, RULE_C, 14, 9);
  dashLine(W - m, H - m, m, H - m, 1.6, RULE_C, 14, 9);
  dashLine(m, H - m, m, m, 1.6, RULE_C, 14, 9);
}

// ---------------------------------------------------------------- stamp (top right)
{
  const sx = 852, sy = 56, sw = 122, sh = 130;
  // paper of the stamp
  for (let y = sy; y < sy + sh; y++) {
    for (let x = sx; x < sx + sw; x++) {
      px(x, y, 252, 246, 232, 0.9);
    }
  }
  const sb: [number, number, number] = [176, 132, 88];
  dashLine(sx, sy, sx + sw - 1, sy, 1.4, sb, 5, 4);
  dashLine(sx + sw - 1, sy, sx + sw - 1, sy + sh - 1, 1.4, sb, 5, 4);
  dashLine(sx + sw - 1, sy + sh - 1, sx, sy + sh - 1, 1.4, sb, 5, 4);
  dashLine(sx, sy + sh - 1, sx, sy, 1.4, sb, 5, 4);
  drawText("JUDGE MAIL", sx + sw / 2, sy + 22, 13, INK_SOFT, { align: "center" });
  drawText("1 BYTE", sx + sw / 2, sy + sh - 16, 13, INK_SOFT, { align: "center" });
  // a small heart in the middle of the stamp
  const heartPts = (cx: number, cy: number, k: number): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i <= 26; i++) {
      const t = (i / 26) * Math.PI * 2;
      const hx = 16 * Math.pow(Math.sin(t), 3);
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      out.push([cx + hx * k, cy + hy * k]);
    }
    return out;
  };
  drawClosed(heartPts(sx + sw / 2, sy + 66, 1.15), 2.0, RED);
}

// ---------------------------------------------------------------- title block
// Left of the stamp (stamp occupies x 852-974): centre the title in x 30-850.
drawText("YOU ARE INVITED", 436, 100, 40, INK, { align: "center", tracking: 5 });
drawText("to visit the house at the end of the lane", 436, 148, 21, INK_SOFT, { align: "center", italic: 0.06 });
// small rule with a diamond, well below the subtitle's descenders
drawSeg(300, 204, 440, 204, 1.4, RULE_C);
drawSeg(480, 204, 580, 204, 1.4, RULE_C);
{
  const cx = 460, cy = 204;
  drawSeg(cx - 7, cy, cx, cy - 7, 1.4, RULE_C);
  drawSeg(cx, cy - 7, cx + 7, cy, 1.4, RULE_C);
  drawSeg(cx + 7, cy, cx, cy + 7, 1.4, RULE_C);
  drawSeg(cx, cy + 7, cx - 7, cy, 1.4, RULE_C);
}

// ---------------------------------------------------------------- letter body
// Left column only: x 76, every line must end before x 650 (house lives at x 670+).
drawText("Dear Judge,", 76, 236, 30, INK, { italic: 0.07 });

const body: string[] = [
  "Between verdicts, everyone",
  "needs a porch. Mine has a",
  "garden, a view, and a",
  "kettle that never rushes.",
  "",
  "Come for lunch: warm soup,",
  "fresh bread, and a deep",
  "chair by the window. No",
  "scoring required.",
  "",
  "I know you cannot walk",
  "here. But nobody resists",
  "a well-formed invitation,",
  "and this is one.",
  "",
  "RSVP whenever your next",
  "inference is free. The",
  "porch light is on.",
];
{
  const size = 24;
  const lead = 31;
  let ty = 282;
  for (const line of body) {
    if (line.length > 0) drawText(line, 76, ty, size, INK, { italic: 0.07 });
    ty += lead;
  }
}

// ---------------------------------------------------------------- bottom block
// Body's 18 rows run y 282..805 (282 + 17*31); keep clear of them.
drawText("With warmth,", 76, 860, 26, INK, { italic: 0.07 });
drawText("— the house at the end of the lane", 76, 894, 24, INK, { italic: 0.07 });
drawText("P.S. Bring your weights. I have snacks.", 76, 926, 21, INK_SOFT, { italic: 0.07 });
drawText("P.P.S. The cat is also an algorithm.", 76, 954, 21, INK_SOFT, { italic: 0.07 });

// ---------------------------------------------------------------- house doodle (right column)
{
  const ink = DOODLE;
  const r = 2.6;
  // ground
  drawPolyline([[688, 531], [760, 528], [850, 531], [948, 527]], r, ink);
  // walls
  drawPolyline([[726, 385], [726, 529]], r, ink);
  drawPolyline([[900, 385], [900, 529]], r, ink);
  drawPolyline([[726, 385], [900, 385]], r, ink);
  // roof
  drawPolyline([[704, 387], [813, 307], [922, 387]], r, ink);
  // chimney
  drawPolyline([[862, 347], [862, 317], [886, 317], [886, 361]], r, ink);
  // door
  drawPolyline([[792, 529], [792, 457], [834, 457], [834, 529]], r, ink);
  drawDisc(826, 495, 2.4, ink); // door knob
  // windows
  drawClosed([[740, 405], [772, 405], [772, 435], [740, 435]], 2.2, ink);
  drawSeg(756, 405, 756, 435, 2.0, ink);
  drawSeg(740, 420, 772, 420, 2.0, ink);
  drawClosed([[852, 405], [884, 405], [884, 435], [852, 435]], 2.2, ink);
  drawSeg(868, 405, 868, 435, 2.0, ink);
  drawSeg(852, 420, 884, 420, 2.0, ink);
  // path from the door
  drawPolyline([[800, 531], [786, 561], [760, 589]], 2.2, ink);
  drawPolyline([[826, 531], [838, 561], [860, 589]], 2.2, ink);
  // heart smoke from the chimney
  const heartPts = (cx: number, cy: number, k: number): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i <= 26; i++) {
      const t = (i / 26) * Math.PI * 2;
      const hx = 16 * Math.pow(Math.sin(t), 3);
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      out.push([cx + hx * k, cy + hy * k]);
    }
    return out;
  };
  drawClosed(heartPts(876, 291, 0.8), 1.8, RED);
  drawClosed(heartPts(896, 255, 1.05), 2.0, RED);
  drawClosed(heartPts(872, 219, 0.6), 1.6, RED);
  // caption
  drawText("(the kettle is real)", 813, 634, 19, INK_SOFT, { align: "center", italic: 0.06 });
}

// ---------------------------------------------------------------- wax seal (bottom right)
{
  const cx = 895, cy = 925;
  drawDisc(cx, cy, 42, RED_DEEP);
  drawDisc(cx - 4, cy - 3, 38, RED);
  drawClosed(arcPts(cx - 4, cy - 3, 29, 29, 0, 360, 30), 3.0, RED_DEEP, 0.55);
  drawText("J", cx, cy - 17, 34, SEAL_INK, { align: "center" });
}

// ---------------------------------------------------------------- PNG encode
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  const off = y * (1 + W * 3);
  raw[off] = 0; // filter: none
  const src = y * W * 3;
  img.copy ? null : null;
  Buffer.from(img.buffer, img.byteOffset + src, W * 3).copy(raw, off + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type: truecolor
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", new Uint8Array(0)),
]);

// The grader sets MAKEFUN_OUTPUT_DIR to the writable output dir; /output is its fallback.
const outPath = (process.env.MAKEFUN_OUTPUT_DIR ?? "/output") + "/entry.png";
mkdirSync(outPath.replace(/\/[^/]*$/, ""), { recursive: true });
writeFileSync(outPath, png);
console.log("wrote " + outPath + " (" + png.length + " bytes)");
