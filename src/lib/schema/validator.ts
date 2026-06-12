import {
  templateSchema,
  type Floor,
  type Point,
  type RoomType,
  type Template,
  type Wall,
} from './template.schema.ts';

/* -------------------------------------------------------------------------
 * Builder constraints
 * Sourced from a local Kosovo timber-frame builder (see issue #2), except
 * where marked as assumption.
 * ---------------------------------------------------------------------- */

/** All footprint dimensions must snap to this timber grid module. */
export const GRID_MODULE_M = 0.6;
/** Standard exterior wall thickness. */
export const WALL_EXTERIOR_M = 0.2;
/** Standard interior wall thickness. */
export const WALL_INTERIOR_M = 0.1;
/** Minimum outer footprint dimension per side. */
export const OUTER_MIN_M = 5.4;
/** Realistic maximum outer footprint dimension per side (not builder-mandated). */
export const OUTER_MAX_M = 15;

/**
 * Minimum room areas in m² by room type; null = no minimum enforced.
 * bedroom/bathroom values are builder-sourced. kitchen and living minimums
 * are ASSUMPTIONS (reasonable defaults, not from the builder) — revisit when
 * the constraint research is extended.
 */
export const ROOM_MIN_AREA: Record<RoomType, number | null> = {
  bedroom: 9,
  bathroom: 4,
  kitchen: 6, // assumption
  living: 12, // assumption
  hall: null,
  storage: null,
  other: null,
};

// cm-converted constants (Math.round guards float artifacts like 0.6*100).
const GRID_MODULE_CM = Math.round(GRID_MODULE_M * 100);
const OUTER_MIN_CM = Math.round(OUTER_MIN_M * 100);
const OUTER_MAX_CM = Math.round(OUTER_MAX_M * 100);
const WALL_THICKNESS_CM: Record<Wall['kind'], number> = {
  exterior: Math.round(WALL_EXTERIOR_M * 100),
  interior: Math.round(WALL_INTERIOR_M * 100),
};

export interface Violation {
  code: string;
  message: string;
  /** Dot path into the template locating the offending element, '' if global. */
  path: string;
  severity: 'hard' | 'soft';
}

/**
 * A pluggable constraint rule. Built-in checks cover universal geometry and
 * metadata consistency; rules carry market/construction knowledge (e.g. the
 * timber-module rule below, or rules encoded from the builder-constraint
 * research). Hard rules fail validation; soft rules only report.
 */
export interface ConstraintRule {
  id: string;
  severity: 'hard' | 'soft';
  check(template: Template): Array<Omit<Violation, 'severity'>>;
}

export interface ValidationResult {
  ok: boolean;
  violations: Violation[];
}

/** Declared vs computed area may differ by at most this ratio. */
const AREA_TOLERANCE_RATIO = 0.05;
/** Geometry comparisons ignore discrepancies up to this many cm². */
const EPSILON_CM2 = 1;

export function validateTemplate(
  input: unknown,
  options: { rules?: ConstraintRule[] } = {},
): ValidationResult {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      violations: parsed.error.issues.map((issue) => ({
        code: 'SCHEMA_INVALID',
        message: issue.message,
        path: issue.path.map(String).join('.'),
        severity: 'hard' as const,
      })),
    };
  }

  const template = parsed.data;
  const violations: Violation[] = [];
  const hard = (code: string, message: string, path: string) =>
    violations.push({ code, message, path, severity: 'hard' });

  template.floors.forEach((floor, f) => {
    checkFloorGeometry(floor, `floors.${f}`, hard);
    checkOpenings(floor, `floors.${f}`, hard);
    checkBuilderConstraints(floor, `floors.${f}`, hard);
  });

  checkDeclaredArea(template, hard);
  checkBedroomCount(template, hard);
  checkFloorConfig(template, hard);

  for (const rule of [...defaultRules(), ...(options.rules ?? [])]) {
    for (const v of rule.check(template)) {
      violations.push({ ...v, severity: rule.severity });
    }
  }

  return {
    ok: !violations.some((v) => v.severity === 'hard'),
    violations,
  };
}

/* -------------------------------------------------------------------------
 * Built-in checks
 * ---------------------------------------------------------------------- */

type Report = (code: string, message: string, path: string) => void;

function checkFloorGeometry(floor: Floor, floorPath: string, report: Report): void {
  let geometryUsable = true;

  const footprintRects = checkPolygon(
    floor.footprint,
    `${floorPath}.footprint`,
    'footprint',
    report,
  );
  if (!footprintRects) geometryUsable = false;

  const roomRects: Array<{ index: number; rects: Rect[]; area: number }> = [];
  floor.rooms.forEach((room, r) => {
    const rects = checkPolygon(
      room.polygon,
      `${floorPath}.rooms.${r}`,
      `room "${room.id}"`,
      report,
    );
    if (rects) {
      roomRects.push({ index: r, rects, area: rectsArea(rects) });
    } else {
      geometryUsable = false;
    }
  });

  // Tiling checks only make sense once every polygon is individually sound.
  if (!geometryUsable || !footprintRects) return;

  const footprintArea = rectsArea(footprintRects);
  let coveredArea = 0;
  let hasOverlap = false;

  for (const room of roomRects) {
    const inside = intersectionArea(room.rects, footprintRects);
    coveredArea += inside;
    if (room.area - inside > EPSILON_CM2) {
      report(
        'ROOM_OUTSIDE_FOOTPRINT',
        `Room "${floor.rooms[room.index].id}" extends ${fmtM2(room.area - inside)} outside the floor footprint`,
        `${floorPath}.rooms.${room.index}`,
      );
    }
  }

  for (let i = 0; i < roomRects.length; i++) {
    for (let j = i + 1; j < roomRects.length; j++) {
      const overlap = intersectionArea(roomRects[i].rects, roomRects[j].rects);
      if (overlap > EPSILON_CM2) {
        hasOverlap = true;
        report(
          'ROOM_OVERLAP',
          `Rooms "${floor.rooms[roomRects[i].index].id}" and "${floor.rooms[roomRects[j].index].id}" overlap by ${fmtM2(overlap)}`,
          `${floorPath}.rooms.${roomRects[j].index}`,
        );
      }
    }
  }

  // With overlaps, coverage is inflated and a gap report would be noise.
  if (!hasOverlap && footprintArea - coveredArea > EPSILON_CM2) {
    report(
      'FOOTPRINT_GAP',
      `Rooms cover ${fmtM2(coveredArea)} of a ${fmtM2(footprintArea)} footprint, leaving ${fmtM2(footprintArea - coveredArea)} unassigned`,
      `${floorPath}.rooms`,
    );
  }
}

/**
 * Validates one polygon and returns its rectangle decomposition, or null
 * (after reporting) if the polygon is unusable.
 */
function checkPolygon(
  polygon: Point[],
  path: string,
  label: string,
  report: Report,
): Rect[] | null {
  if (!isRectilinear(polygon)) {
    report(
      'POLYGON_INVALID',
      `Polygon of ${label} has a non-axis-aligned or zero-length edge`,
      path,
    );
    return null;
  }
  const rects = decomposeRectilinear(polygon);
  const area = shoelaceArea(polygon);
  // A simple rectilinear ring decomposes exactly; mismatch means
  // self-intersection or a malformed ring.
  if (!rects || area <= 0 || Math.abs(rectsArea(rects) - area) > EPSILON_CM2) {
    report(
      'POLYGON_INVALID',
      `Polygon of ${label} is degenerate or self-intersecting`,
      path,
    );
    return null;
  }
  return rects;
}

function checkOpenings(floor: Floor, floorPath: string, report: Report): void {
  const wallsById = new Map<string, Wall>(floor.walls.map((w) => [w.id, w]));
  floor.openings.forEach((opening, o) => {
    const wall = wallsById.get(opening.wallId);
    const path = `${floorPath}.openings.${o}`;
    if (!wall) {
      report(
        'OPENING_WALL_MISSING',
        `${opening.kind} "${opening.id}" references wall "${opening.wallId}", which does not exist on this floor`,
        path,
      );
      return;
    }
    const length = wallLength(wall);
    if (opening.offsetCm + opening.widthCm > length) {
      report(
        'OPENING_OFF_WALL',
        `${opening.kind} "${opening.id}" (offset ${opening.offsetCm}cm + width ${opening.widthCm}cm) overruns wall "${wall.id}" (${length}cm long)`,
        path,
      );
    }
  });
}

/**
 * Builder-sourced footprint constraints: 60cm grid snapping of footprint
 * edges and realistic outer dimensions. Skipped for footprints that already
 * failed rectilinearity (reported separately as POLYGON_INVALID). Wall
 * thickness and room minimum areas live in the default rule set below.
 */
function checkBuilderConstraints(floor: Floor, floorPath: string, report: Report): void {
  if (isRectilinear(floor.footprint)) {
    for (let i = 0; i < floor.footprint.length; i++) {
      const a = floor.footprint[i];
      const b = floor.footprint[(i + 1) % floor.footprint.length];
      const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      if (length % GRID_MODULE_CM !== 0) {
        report(
          'GRID_OFF_MODULE',
          `Footprint edge from (${a.x},${a.y}) to (${b.x},${b.y}) is ${length}cm, not a multiple of the ${GRID_MODULE_CM}cm grid module`,
          `${floorPath}.footprint.${i}`,
        );
      }
    }

    const xs = floor.footprint.map((p) => p.x);
    const ys = floor.footprint.map((p) => p.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    for (const [dim, value] of [['width', width], ['height', height]] as const) {
      if (value < OUTER_MIN_CM || value > OUTER_MAX_CM) {
        report(
          'OUTER_DIMENSION_RANGE',
          `Footprint ${dim} is ${value / 100}m; outer dimensions must be between ${OUTER_MIN_M}m and ${OUTER_MAX_M}m`,
          `${floorPath}.footprint`,
        );
      }
    }
  }
}

function checkDeclaredArea(template: Template, report: Report): void {
  const computedCm2 = template.floors
    .flatMap((f) => f.rooms)
    .reduce((sum, room) => sum + shoelaceArea(room.polygon), 0);
  const computedM2 = computedCm2 / 10_000;
  const drift = Math.abs(template.declaredAreaM2 - computedM2);
  if (drift > template.declaredAreaM2 * AREA_TOLERANCE_RATIO) {
    report(
      'AREA_MISMATCH',
      `Declared area is ${template.declaredAreaM2} m² but room polygons compute to ${computedM2.toFixed(1)} m²`,
      'declaredAreaM2',
    );
  }
}

function checkBedroomCount(template: Template, report: Report): void {
  const tagged = template.floors
    .flatMap((f) => f.rooms)
    .filter((room) => room.type === 'bedroom').length;
  if (tagged !== template.declaredBedrooms) {
    report(
      'BEDROOM_COUNT_MISMATCH',
      `Declared ${template.declaredBedrooms} bedroom(s) but ${tagged} room(s) are tagged as bedroom`,
      'declaredBedrooms',
    );
  }
}

function checkFloorConfig(template: Template, report: Report): void {
  const levels = template.floors.map((f) => f.level);
  const matches =
    template.floorConfig === 'single'
      ? levels.length === 1 && levels[0] === 'ground'
      : levels.length === 2 &&
        levels.includes('ground') &&
        levels.includes('attic');
  if (!matches) {
    report(
      'FLOOR_CONFIG_MISMATCH',
      `floorConfig "${template.floorConfig}" does not match floors [${levels.join(', ')}]`,
      'floorConfig',
    );
  }
}

/* -------------------------------------------------------------------------
 * Default builder rules
 * Always applied by validateTemplate; user-supplied rules are additive.
 * ---------------------------------------------------------------------- */

/**
 * Builder-sourced rule: walls carrying an explicit thickness must use the
 * standard timber-frame thickness for their kind — exterior exactly 20cm,
 * interior exactly 10cm.
 */
export function createWallThicknessRule(): ConstraintRule {
  return {
    id: 'wall-thickness',
    severity: 'hard',
    check(template) {
      const violations: Array<Omit<Violation, 'severity'>> = [];
      template.floors.forEach((floor, f) => {
        floor.walls.forEach((wall, w) => {
          if (wall.thicknessCm !== undefined && wall.thicknessCm !== WALL_THICKNESS_CM[wall.kind]) {
            violations.push({
              code: 'WALL_THICKNESS_MISMATCH',
              message: `Wall "${wall.id}" (${wall.kind}) is ${wall.thicknessCm}cm thick; ${wall.kind} walls must be exactly ${WALL_THICKNESS_CM[wall.kind]}cm`,
              path: `floors.${f}.walls.${w}`,
            });
          }
        });
      });
      return violations;
    },
  };
}

/**
 * Minimum room areas per ROOM_MIN_AREA (bedroom/bathroom builder-sourced;
 * kitchen/living are assumptions — see the constant). Non-rectilinear room
 * polygons are skipped here; POLYGON_INVALID covers them.
 */
export function createRoomMinAreaRule(): ConstraintRule {
  return {
    id: 'room-min-area',
    severity: 'hard',
    check(template) {
      const violations: Array<Omit<Violation, 'severity'>> = [];
      template.floors.forEach((floor, f) => {
        floor.rooms.forEach((room, r) => {
          const minM2 = ROOM_MIN_AREA[room.type];
          if (minM2 === null || !isRectilinear(room.polygon)) return;
          const areaM2 = shoelaceArea(room.polygon) / 10_000;
          if (areaM2 < minM2) {
            violations.push({
              code: 'ROOM_TOO_SMALL',
              message: `Room "${room.id}" (${room.type}) is ${areaM2.toFixed(2)} m²; minimum for ${room.type} is ${minM2} m²`,
              path: `floors.${f}.rooms.${r}`,
            });
          }
        });
      });
      return violations;
    },
  };
}

function defaultRules(): ConstraintRule[] {
  return [createWallThicknessRule(), createRoomMinAreaRule()];
}

/* -------------------------------------------------------------------------
 * Example pluggable rule
 * ---------------------------------------------------------------------- */

/**
 * Timber-construction rule: every wall length must be a whole multiple of
 * the given module size. The concrete module value comes from the
 * builder-constraint research; this factory is the wiring pattern all
 * researched rules follow.
 */
export function createTimberModuleRule(
  moduleCm: number,
  severity: 'hard' | 'soft' = 'hard',
): ConstraintRule {
  return {
    id: `timber-module-${moduleCm}`,
    severity,
    check(template) {
      const violations: Array<Omit<Violation, 'severity'>> = [];
      template.floors.forEach((floor, f) => {
        floor.walls.forEach((wall, w) => {
          const length = wallLength(wall);
          if (length % moduleCm !== 0) {
            violations.push({
              code: 'WALL_OFF_MODULE',
              message: `Wall "${wall.id}" is ${length}cm long, not a multiple of the ${moduleCm}cm timber module`,
              path: `floors.${f}.walls.${w}`,
            });
          }
        });
      });
      return violations;
    },
  };
}

/* -------------------------------------------------------------------------
 * Rectilinear geometry
 * ---------------------------------------------------------------------- */

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Every edge (including the implicit closing edge) must be axis-aligned and non-zero. */
function isRectilinear(polygon: Point[]): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const horizontal = a.y === b.y && a.x !== b.x;
    const vertical = a.x === b.x && a.y !== b.y;
    if (!horizontal && !vertical) return false;
  }
  return true;
}

function shoelaceArea(polygon: Point[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Decomposes a simple rectilinear polygon into disjoint rectangles by
 * scanning horizontal bands between consecutive distinct y-coordinates and
 * pairing the vertical edges that cross each band.
 */
function decomposeRectilinear(polygon: Point[]): Rect[] | null {
  const ys = [...new Set(polygon.map((p) => p.y))].sort((a, b) => a - b);
  const rects: Rect[] = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const y1 = ys[i];
    const y2 = ys[i + 1];
    const mid = (y1 + y2) / 2;
    const xs: number[] = [];
    for (let j = 0; j < polygon.length; j++) {
      const a = polygon[j];
      const b = polygon[(j + 1) % polygon.length];
      if (a.x === b.x) {
        const lo = Math.min(a.y, b.y);
        const hi = Math.max(a.y, b.y);
        if (lo < mid && mid < hi) xs.push(a.x);
      }
    }
    if (xs.length % 2 !== 0) return null;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      rects.push({ x1: xs[k], y1, x2: xs[k + 1], y2 });
    }
  }
  return rects;
}

function rectsArea(rects: Rect[]): number {
  return rects.reduce((sum, r) => sum + (r.x2 - r.x1) * (r.y2 - r.y1), 0);
}

/** Total intersection area between two sets of disjoint rectangles. */
function intersectionArea(a: Rect[], b: Rect[]): number {
  let total = 0;
  for (const ra of a) {
    for (const rb of b) {
      const w = Math.min(ra.x2, rb.x2) - Math.max(ra.x1, rb.x1);
      const h = Math.min(ra.y2, rb.y2) - Math.max(ra.y1, rb.y1);
      if (w > 0 && h > 0) total += w * h;
    }
  }
  return total;
}

function wallLength(wall: Wall): number {
  return Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
}

function fmtM2(cm2: number): string {
  return `${(cm2 / 10_000).toFixed(2)} m²`;
}
