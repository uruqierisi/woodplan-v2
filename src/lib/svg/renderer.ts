import type {
  Floor,
  Opening,
  Point,
  Template,
  Wall,
} from '../schema/template.schema.ts';

/**
 * WoodPlan SVG renderer (issue #3).
 *
 * Pure function of (template, options) -> self-contained SVG string, so the
 * exact same renderer serves the preview/authoring page, the main app, and
 * later the PDF exporter. No DOM, no app state, no external assets.
 *
 * The input is expected to have passed `validateTemplate` (../schema/validator.ts);
 * rendering does not re-validate. All displayed measurements (dimension lines,
 * per-room m²) are computed from the polygons, never read from metadata.
 */

/** A template that already passed validation. Alias of the schema type. */
export type ValidatedTemplate = Template;

export interface RenderOptions {
  /** Label language. Albanian is the primary market. Default 'sq'. */
  lang?: 'sq' | 'en';
  /** Pixels per meter. Default 50. */
  scale?: number;
  /** Draw exterior dimension lines on the top + left axes. Default true. */
  showDimensions?: boolean;
  /** Draw the computed m² under each room name. Default true. */
  showAreaLabels?: boolean;
  /** Reserved for a later issue; furniture is never rendered yet. */
  showFurniture?: boolean;
  /** Color theme. Default 'wood'. */
  theme?: 'wood' | 'mono';
}

export interface Theme {
  wall: string;
  room: string;
  accent: string;
  text: string;
}

export const THEMES: Record<'wood' | 'mono', Theme> = {
  wood: { wall: '#8B6914', room: '#F5F0E8', accent: '#D4A96A', text: '#2C1810' },
  mono: { wall: '#1a1a1a', room: '#f5f5f5', accent: '#666', text: '#1a1a1a' },
};

/* -------------------------------------------------------------------------
 * Localization
 * Templates store i18n label KEYS; the renderer resolves them. This table is
 * the interim dictionary until real i18n lands (issue #6).
 * ---------------------------------------------------------------------- */

type Lang = 'sq' | 'en';

const ROOM_LABELS: Record<string, Record<Lang, string>> = {
  'room.living': { sq: 'Dhoma e ndenjes', en: 'Living room' },
  'room.kitchen': { sq: 'Kuzhina', en: 'Kitchen' },
  'room.bedroom': { sq: 'Dhoma e gjumit', en: 'Bedroom' },
  'room.bathroom': { sq: 'Banjo', en: 'Bathroom' },
  'room.hall': { sq: 'Korridori', en: 'Hallway' },
  'room.storage': { sq: 'Depoja', en: 'Storage' },
  'room.wc': { sq: 'WC', en: 'WC' },
  'room.other': { sq: 'Dhomë', en: 'Room' },
};

const FLOOR_LABELS: Record<Floor['level'], Record<Lang, string>> = {
  ground: { sq: 'Përdhesa', en: 'Ground floor' },
  attic: { sq: 'Papafingo', en: 'Attic' },
};

/** Shown in both languages regardless of `lang`; this is a legal notice. */
const DISCLAIMER = {
  en: 'Concept plan — not for construction or permits',
  sq: 'Plan konceptual — jo për ndërtim ose leje',
};

function resolveLabel(labelKey: string, lang: Lang): string {
  const entry = ROOM_LABELS[labelKey];
  if (entry) return entry[lang];
  // Unknown key: humanize the last key segment so authoring drafts still label.
  const tail = labelKey.split('.').pop() ?? labelKey;
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}

/* -------------------------------------------------------------------------
 * Geometry (plan space: integer cm, origin SW, y grows north)
 * ---------------------------------------------------------------------- */

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function bounds(polygon: Point[]): Bounds {
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function shoelaceAreaCm2(polygon: Point[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/* -------------------------------------------------------------------------
 * Layout constants, all in PLAN METERS so every pixel value is `meters ×
 * scale`. That keeps the whole drawing (and the viewBox) exactly linear in
 * `scale`.
 * ---------------------------------------------------------------------- */

const PAD_TOP_M = 2.4; // room for the top dimension line + north arrow
const PAD_LEFT_M = 2.4; // room for the left dimension line
const PAD_RIGHT_M = 2.0;
const PAD_BOTTOM_M = 3.2; // floor captions + scale bar + disclaimer
const FLOOR_GAP_M = 1.2;
const DIM_OFFSET_M = 0.7; // dimension line distance from the footprint
const WALL_EXT_M = 0.2; // standard exterior wall thickness (builder constraint)
const WALL_INT_M = 0.1; // standard interior wall thickness

/** Trim float noise: at most 2 decimals, no trailing zeros. */
function n(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(r);
}

function fmtMeters(cm: number): string {
  return `${n(cm / 100)} m`;
}

function fmtArea(cm2: number): string {
  return `${(cm2 / 10_000).toFixed(1)} m²`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* -------------------------------------------------------------------------
 * Renderer
 * ---------------------------------------------------------------------- */

export function renderTemplate(
  template: ValidatedTemplate,
  options: RenderOptions = {},
): string {
  const lang = options.lang ?? 'sq';
  const scale = options.scale ?? 50;
  const showDimensions = options.showDimensions ?? true;
  const showAreaLabels = options.showAreaLabels ?? true;
  const theme = THEMES[options.theme ?? 'wood'];

  /** meters -> px */
  const px = (m: number) => m * scale;
  /** cm -> px */
  const k = scale / 100;

  const floorBounds = template.floors.map((f) => bounds(f.footprint));
  const floorWidthsM = floorBounds.map((b) => (b.maxX - b.minX) / 100);
  const maxFloorHeightM = Math.max(
    ...floorBounds.map((b) => (b.maxY - b.minY) / 100),
  );
  const contentWidthM =
    floorWidthsM.reduce((a, b) => a + b, 0) +
    FLOOR_GAP_M * (template.floors.length - 1);

  const totalW = px(PAD_LEFT_M + contentWidthM + PAD_RIGHT_M);
  const totalH = px(PAD_TOP_M + maxFloorHeightM + PAD_BOTTOM_M);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(totalW)} ${n(totalH)}" width="${n(totalW)}" height="${n(totalH)}" font-family="system-ui, sans-serif">`,
  );
  parts.push(`<rect width="${n(totalW)}" height="${n(totalH)}" fill="#ffffff"/>`);

  let originXM = PAD_LEFT_M;
  template.floors.forEach((floor, i) => {
    const b = floorBounds[i];
    // Plan -> screen transform for this floor (flip y: plan y grows north).
    const X = (x: number) => px(originXM) + (x - b.minX) * k;
    const Y = (y: number) => px(PAD_TOP_M) + (b.maxY - y) * k;

    parts.push(`<g class="floor" data-floor-id="${escapeXml(floor.id)}">`);
    renderFootprint(parts, floor, X, Y, px, theme);
    renderRooms(parts, floor, X, Y, px, theme);
    renderOpenings(parts, floor, X, Y, k, px, theme);
    renderRoomLabels(parts, floor, X, Y, px, theme, lang, showAreaLabels);
    if (showDimensions) renderDimensions(parts, b, X, Y, px, theme);
    if (template.floors.length > 1) {
      parts.push(
        `<text class="floor-caption" x="${n((X(b.minX) + X(b.maxX)) / 2)}" y="${n(Y(b.minY) + px(0.7))}" text-anchor="middle" font-size="${n(px(0.3))}" fill="${theme.text}">${escapeXml(FLOOR_LABELS[floor.level][lang])}</text>`,
      );
    }
    parts.push('</g>');

    originXM += floorWidthsM[i] + FLOOR_GAP_M;
  });

  renderNorthArrow(parts, totalW, px, theme);
  renderScaleBar(parts, totalH, px, theme);
  renderDisclaimer(parts, totalW, totalH, px);

  parts.push('</svg>');
  return parts.join('\n');
}

function polygonPoints(polygon: Point[], X: (x: number) => number, Y: (y: number) => number): string {
  return polygon.map((p) => `${n(X(p.x))},${n(Y(p.y))}`).join(' ');
}

function renderFootprint(
  parts: string[],
  floor: Floor,
  X: (x: number) => number,
  Y: (y: number) => number,
  px: (m: number) => number,
  theme: Theme,
): void {
  parts.push(
    `<polygon class="footprint" points="${polygonPoints(floor.footprint, X, Y)}" fill="${theme.room}" stroke="${theme.wall}" stroke-width="${n(px(WALL_EXT_M))}" stroke-linejoin="miter"/>`,
  );
}

function renderRooms(
  parts: string[],
  floor: Floor,
  X: (x: number) => number,
  Y: (y: number) => number,
  px: (m: number) => number,
  theme: Theme,
): void {
  for (const room of floor.rooms) {
    parts.push(
      `<polygon class="room" data-room-id="${escapeXml(room.id)}" points="${polygonPoints(room.polygon, X, Y)}" fill="${theme.room}" stroke="${theme.wall}" stroke-width="${n(px(WALL_INT_M))}" stroke-linejoin="miter"/>`,
    );
  }
}

/** Resolve an opening to its two endpoints (cm) and the wall's unit vector. */
function openingSpan(wall: Wall, opening: Opening) {
  const dx = wall.to.x - wall.from.x;
  const dy = wall.to.y - wall.from.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  return {
    p1: { x: wall.from.x + ux * opening.offsetCm, y: wall.from.y + uy * opening.offsetCm },
    p2: {
      x: wall.from.x + ux * (opening.offsetCm + opening.widthCm),
      y: wall.from.y + uy * (opening.offsetCm + opening.widthCm),
    },
    ux,
    uy,
  };
}

function renderOpenings(
  parts: string[],
  floor: Floor,
  X: (x: number) => number,
  Y: (y: number) => number,
  k: number,
  px: (m: number) => number,
  theme: Theme,
): void {
  const wallsById = new Map(floor.walls.map((w) => [w.id, w]));

  // Doors first, then windows, per the element-order spec.
  for (const kind of ['door', 'window'] as const) {
    for (const opening of floor.openings) {
      if (opening.kind !== kind) continue;
      const wall = wallsById.get(opening.wallId);
      if (!wall) continue; // validator reports this; render what we can
      const span = openingSpan(wall, opening);
      const ax = X(span.p1.x);
      const ay = Y(span.p1.y);
      const bx = X(span.p2.x);
      const by = Y(span.p2.y);

      // Clear the wall stroke across the opening so the gap reads as a gap.
      const eraser = `<line x1="${n(ax)}" y1="${n(ay)}" x2="${n(bx)}" y2="${n(by)}" stroke="${theme.room}" stroke-width="${n(px(WALL_EXT_M + 0.04))}"/>`;

      if (kind === 'door') {
        // Conventional symbol: leaf perpendicular to the wall at the hinge
        // (p1) plus a quarter-circle swing arc to the strike side (p2).
        const w = opening.widthCm;
        const leafX = X(span.p1.x - span.uy * w);
        const leafY = Y(span.p1.y + span.ux * w);
        const r = w * k;
        // Pick the sweep that arcs around the hinge (screen coords, y down).
        const cross =
          (leafX - ax) * (by - ay) - (leafY - ay) * (bx - ax);
        const sweep = cross > 0 ? 1 : 0;
        parts.push(
          `<g class="door" data-opening-id="${escapeXml(opening.id)}">${eraser}<line x1="${n(ax)}" y1="${n(ay)}" x2="${n(leafX)}" y2="${n(leafY)}" stroke="${theme.accent}" stroke-width="${n(px(0.04))}"/><path d="M ${n(leafX)} ${n(leafY)} A ${n(r)} ${n(r)} 0 0 ${sweep} ${n(bx)} ${n(by)}" fill="none" stroke="${theme.accent}" stroke-width="${n(px(0.025))}"/></g>`,
        );
      } else {
        parts.push(
          `<g class="window" data-opening-id="${escapeXml(opening.id)}">${eraser}<line x1="${n(ax)}" y1="${n(ay)}" x2="${n(bx)}" y2="${n(by)}" stroke="${theme.accent}" stroke-width="${n(px(0.1))}" stroke-dasharray="${n(px(0.15))} ${n(px(0.09))}"/></g>`,
        );
      }
    }
  }
}

function renderRoomLabels(
  parts: string[],
  floor: Floor,
  X: (x: number) => number,
  Y: (y: number) => number,
  px: (m: number) => number,
  theme: Theme,
  lang: Lang,
  showAreaLabels: boolean,
): void {
  for (const room of floor.rooms) {
    const b = bounds(room.polygon);
    const cx = (X(b.minX) + X(b.maxX)) / 2;
    const cy = (Y(b.minY) + Y(b.maxY)) / 2;
    const name = escapeXml(resolveLabel(room.labelKey, lang));
    parts.push(
      `<text class="room-label" x="${n(cx)}" y="${n(cy - px(0.06))}" text-anchor="middle" font-size="${n(px(0.32))}" fill="${theme.text}">${name}</text>`,
    );
    if (showAreaLabels) {
      parts.push(
        `<text class="room-area" x="${n(cx)}" y="${n(cy + px(0.34))}" text-anchor="middle" font-size="${n(px(0.26))}" fill="${theme.text}" opacity="0.75">${escapeXml(fmtArea(shoelaceAreaCm2(room.polygon)))}</text>`,
      );
    }
  }
}

/** Exterior overall dimensions, top + left axes, computed from the footprint. */
function renderDimensions(
  parts: string[],
  b: Bounds,
  X: (x: number) => number,
  Y: (y: number) => number,
  px: (m: number) => number,
  theme: Theme,
): void {
  const sw = n(px(0.02));
  const tick = px(0.12);
  const font = n(px(0.28));
  const d: string[] = [`<g class="dimensions" stroke="${theme.text}" stroke-width="${sw}">`];

  // Top axis (width)
  const ty = Y(b.maxY) - px(DIM_OFFSET_M);
  d.push(`<line x1="${n(X(b.minX))}" y1="${n(ty)}" x2="${n(X(b.maxX))}" y2="${n(ty)}"/>`);
  for (const x of [X(b.minX), X(b.maxX)]) {
    d.push(`<line x1="${n(x)}" y1="${n(ty - tick)}" x2="${n(x)}" y2="${n(ty + tick)}"/>`);
  }
  d.push(
    `<text x="${n((X(b.minX) + X(b.maxX)) / 2)}" y="${n(ty - px(0.14))}" text-anchor="middle" font-size="${font}" fill="${theme.text}" stroke="none">${escapeXml(fmtMeters(b.maxX - b.minX))}</text>`,
  );

  // Left axis (height)
  const lx = X(b.minX) - px(DIM_OFFSET_M);
  d.push(`<line x1="${n(lx)}" y1="${n(Y(b.maxY))}" x2="${n(lx)}" y2="${n(Y(b.minY))}"/>`);
  for (const y of [Y(b.maxY), Y(b.minY)]) {
    d.push(`<line x1="${n(lx - tick)}" y1="${n(y)}" x2="${n(lx + tick)}" y2="${n(y)}"/>`);
  }
  const lcy = (Y(b.maxY) + Y(b.minY)) / 2;
  d.push(
    `<text x="${n(lx - px(0.14))}" y="${n(lcy)}" text-anchor="middle" font-size="${font}" fill="${theme.text}" stroke="none" transform="rotate(-90 ${n(lx - px(0.14))} ${n(lcy)})">${escapeXml(fmtMeters(b.maxY - b.minY))}</text>`,
  );

  d.push('</g>');
  parts.push(d.join(''));
}

function renderNorthArrow(
  parts: string[],
  totalW: number,
  px: (m: number) => number,
  theme: Theme,
): void {
  const cx = totalW - px(1.0);
  const top = px(0.5);
  parts.push(
    `<g class="north-arrow" fill="${theme.text}">` +
      `<polygon points="${n(cx)},${n(top)} ${n(cx - px(0.22))},${n(top + px(0.8))} ${n(cx)},${n(top + px(0.6))} ${n(cx + px(0.22))},${n(top + px(0.8))}"/>` +
      `<text x="${n(cx)}" y="${n(top + px(1.2))}" text-anchor="middle" font-size="${n(px(0.3))}">N</text>` +
      `</g>`,
  );
}

function renderScaleBar(
  parts: string[],
  totalH: number,
  px: (m: number) => number,
  theme: Theme,
): void {
  const x0 = px(1.0);
  const y = totalH - px(1.7);
  const tick = px(0.1);
  parts.push(
    `<g class="scale-bar" stroke="${theme.text}" stroke-width="${n(px(0.02))}">` +
      `<text x="${n(x0)}" y="${n(y - px(0.16))}" font-size="${n(px(0.26))}" fill="${theme.text}" stroke="none">1:100</text>` +
      `<line x1="${n(x0)}" y1="${n(y)}" x2="${n(x0 + px(1))}" y2="${n(y)}"/>` +
      `<line x1="${n(x0)}" y1="${n(y - tick)}" x2="${n(x0)}" y2="${n(y + tick)}"/>` +
      `<line x1="${n(x0 + px(1))}" y1="${n(y - tick)}" x2="${n(x0 + px(1))}" y2="${n(y + tick)}"/>` +
      `<text x="${n(x0 + px(0.5))}" y="${n(y + px(0.4))}" text-anchor="middle" font-size="${n(px(0.24))}" fill="${theme.text}" stroke="none">1 m</text>` +
      `</g>`,
  );
}

function renderDisclaimer(
  parts: string[],
  totalW: number,
  totalH: number,
  px: (m: number) => number,
): void {
  const font = n(px(0.24));
  parts.push(
    `<text class="disclaimer" x="${n(totalW / 2)}" y="${n(totalH - px(0.85))}" text-anchor="middle" font-size="${font}" fill="#888888">${escapeXml(DISCLAIMER.en)}</text>`,
  );
  parts.push(
    `<text class="disclaimer" x="${n(totalW / 2)}" y="${n(totalH - px(0.45))}" text-anchor="middle" font-size="${font}" fill="#888888">${escapeXml(DISCLAIMER.sq)}</text>`,
  );
}
