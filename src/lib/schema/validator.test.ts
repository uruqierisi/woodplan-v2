import { describe, expect, it } from 'vitest';
import type { Template } from './template.schema.ts';
import {
  createTimberModuleRule,
  validateTemplate,
  type ConstraintRule,
  type ValidationResult,
} from './validator.ts';

/**
 * Known-good sample: 9.6m x 8.4m (80.64 m²) single-floor plan whose six
 * rooms tile the footprint exactly. Footprint edges and wall lengths are
 * all multiples of the 60cm timber grid module.
 *
 *  (0,840)                      (960,840)
 *    +--------+------+----+-----+
 *    | bed1   | bed2 | wc | hall|   y=480..840
 *    +--------+--+---+----+-----+
 *    | living    |   kitchen    |   y=0..480
 *    +-----------+--------------+
 *  (0,0)        (600,0)      (960,0)
 */
function makeValidTemplate(): Template {
  return {
    id: 'tmpl-test-80a',
    nameKey: 'template.test80a.name',
    sizeBand: '80-100',
    declaredAreaM2: 80,
    declaredBedrooms: 2,
    floorConfig: 'single',
    floors: [
      {
        id: 'ground',
        level: 'ground',
        footprint: [
          { x: 0, y: 0 },
          { x: 960, y: 0 },
          { x: 960, y: 840 },
          { x: 0, y: 840 },
        ],
        rooms: [
          {
            id: 'living',
            labelKey: 'room.living',
            type: 'living',
            polygon: [
              { x: 0, y: 0 },
              { x: 600, y: 0 },
              { x: 600, y: 480 },
              { x: 0, y: 480 },
            ],
          },
          {
            id: 'kitchen',
            labelKey: 'room.kitchen',
            type: 'kitchen',
            polygon: [
              { x: 600, y: 0 },
              { x: 960, y: 0 },
              { x: 960, y: 480 },
              { x: 600, y: 480 },
            ],
          },
          {
            id: 'bedroom-1',
            labelKey: 'room.bedroom',
            type: 'bedroom',
            polygon: [
              { x: 0, y: 480 },
              { x: 360, y: 480 },
              { x: 360, y: 840 },
              { x: 0, y: 840 },
            ],
          },
          {
            id: 'bedroom-2',
            labelKey: 'room.bedroom',
            type: 'bedroom',
            polygon: [
              { x: 360, y: 480 },
              { x: 660, y: 480 },
              { x: 660, y: 840 },
              { x: 360, y: 840 },
            ],
          },
          {
            id: 'bathroom',
            labelKey: 'room.bathroom',
            type: 'bathroom',
            polygon: [
              { x: 660, y: 480 },
              { x: 780, y: 480 },
              { x: 780, y: 840 },
              { x: 660, y: 840 },
            ],
          },
          {
            id: 'hall',
            labelKey: 'room.hall',
            type: 'hall',
            polygon: [
              { x: 780, y: 480 },
              { x: 960, y: 480 },
              { x: 960, y: 840 },
              { x: 780, y: 840 },
            ],
          },
        ],
        walls: [
          { id: 'w-south', from: { x: 0, y: 0 }, to: { x: 960, y: 0 }, kind: 'exterior' },
          { id: 'w-east', from: { x: 960, y: 0 }, to: { x: 960, y: 840 }, kind: 'exterior' },
          { id: 'w-north', from: { x: 960, y: 840 }, to: { x: 0, y: 840 }, kind: 'exterior' },
          { id: 'w-west', from: { x: 0, y: 840 }, to: { x: 0, y: 0 }, kind: 'exterior' },
          { id: 'w-int-kitchen', from: { x: 600, y: 0 }, to: { x: 600, y: 480 }, kind: 'interior' },
          { id: 'w-int-mid', from: { x: 0, y: 480 }, to: { x: 960, y: 480 }, kind: 'interior' },
        ],
        openings: [
          { id: 'door-entrance', kind: 'door', wallId: 'w-south', offsetCm: 450, widthCm: 100 },
          { id: 'door-bed1', kind: 'door', wallId: 'w-int-mid', offsetCm: 100, widthCm: 90 },
          { id: 'win-living', kind: 'window', wallId: 'w-west', offsetCm: 200, widthCm: 150 },
        ],
      },
    ],
  };
}

function codes(result: ValidationResult): string[] {
  return result.violations.map((v) => v.code);
}

describe('schema validity', () => {
  it('accepts the known-good sample template', () => {
    const result = validateTemplate(makeValidTemplate());
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects non-object input', () => {
    const result = validateTemplate(null);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('SCHEMA_INVALID');
  });

  it('rejects a template missing required fields', () => {
    const t = makeValidTemplate() as Record<string, unknown>;
    delete t.id;
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('SCHEMA_INVALID');
  });

  it('rejects a room polygon with fewer than 4 points', () => {
    const t = makeValidTemplate();
    t.floors[0].rooms[0].polygon = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('SCHEMA_INVALID');
  });
});

describe('polygon geometry', () => {
  it('rejects a polygon with a diagonal (non-rectilinear) edge', () => {
    const t = makeValidTemplate();
    t.floors[0].rooms[0].polygon = [
      { x: 0, y: 0 },
      { x: 600, y: 0 },
      { x: 600, y: 480 },
      { x: 50, y: 450 }, // diagonal edge back to (0,0)
    ];
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('POLYGON_INVALID');
  });

  it('rejects overlapping rooms', () => {
    const t = makeValidTemplate();
    // Stretch kitchen 100cm into the living room.
    t.floors[0].rooms[1].polygon = [
      { x: 500, y: 0 },
      { x: 960, y: 0 },
      { x: 960, y: 480 },
      { x: 500, y: 480 },
    ];
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('ROOM_OVERLAP');
  });

  it('rejects rooms that leave a gap in the footprint', () => {
    const t = makeValidTemplate();
    // Shrink the hall, leaving 120x360cm of footprint uncovered.
    t.floors[0].rooms[5].polygon = [
      { x: 900, y: 480 },
      { x: 960, y: 480 },
      { x: 960, y: 840 },
      { x: 900, y: 840 },
    ];
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('FOOTPRINT_GAP');
  });

  it('rejects a room extending outside the footprint', () => {
    const t = makeValidTemplate();
    // Hall pokes 50cm past the east footprint edge.
    t.floors[0].rooms[5].polygon = [
      { x: 780, y: 480 },
      { x: 1010, y: 480 },
      { x: 1010, y: 840 },
      { x: 780, y: 840 },
    ];
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('ROOM_OUTSIDE_FOOTPRINT');
  });
});

describe('openings', () => {
  it('rejects an opening referencing a missing wall', () => {
    const t = makeValidTemplate();
    t.floors[0].openings[0].wallId = 'no-such-wall';
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('OPENING_WALL_MISSING');
  });

  it('rejects an opening that does not fit on its wall', () => {
    const t = makeValidTemplate();
    // w-south is 960cm long; 950 + 120 overruns it.
    t.floors[0].openings[0] = {
      id: 'door-overrun',
      kind: 'door',
      wallId: 'w-south',
      offsetCm: 950,
      widthCm: 120,
    };
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('OPENING_OFF_WALL');
  });
});

describe('declared metadata', () => {
  it('rejects declared area that does not match computed area', () => {
    const t = makeValidTemplate();
    t.declaredAreaM2 = 95; // computed is 80
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('AREA_MISMATCH');
  });

  it('rejects declared bedroom count that does not match tagged rooms', () => {
    const t = makeValidTemplate();
    t.declaredBedrooms = 3; // only 2 rooms tagged bedroom
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('BEDROOM_COUNT_MISMATCH');
  });

  it('rejects floorConfig that does not match the floors array', () => {
    const t = makeValidTemplate();
    t.floorConfig = 'single+attic'; // but only one ground floor present
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('FLOOR_CONFIG_MISMATCH');
  });
});

describe('builder constraints', () => {
  it('rejects a footprint not on the 60cm grid module', () => {
    const t = makeValidTemplate();
    // 950cm width is not a multiple of 60cm.
    t.floors[0].footprint = [
      { x: 0, y: 0 },
      { x: 950, y: 0 },
      { x: 950, y: 840 },
      { x: 0, y: 840 },
    ];
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('GRID_OFF_MODULE');
  });

  it('rejects an exterior wall with 15cm thickness', () => {
    const t = makeValidTemplate();
    t.floors[0].walls[0].thicknessCm = 15;
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('WALL_THICKNESS_MISMATCH');
  });

  it('rejects a bedroom below the 9m² minimum', () => {
    const t = makeValidTemplate();
    // Shrink bedroom-2 to 220x360cm = 7.92 m², widening the bathroom to
    // keep the footprint fully tiled.
    t.floors[0].rooms[3].polygon = [
      { x: 360, y: 480 },
      { x: 580, y: 480 },
      { x: 580, y: 840 },
      { x: 360, y: 840 },
    ];
    t.floors[0].rooms[4].polygon = [
      { x: 580, y: 480 },
      { x: 780, y: 480 },
      { x: 780, y: 840 },
      { x: 580, y: 840 },
    ];
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(['ROOM_TOO_SMALL']);
  });

  it('rejects a bathroom below the 4m² minimum', () => {
    const t = makeValidTemplate();
    // Shrink bathroom to 97x360cm = 3.49 m², widening the hall to keep the
    // footprint fully tiled.
    t.floors[0].rooms[4].polygon = [
      { x: 660, y: 480 },
      { x: 757, y: 480 },
      { x: 757, y: 840 },
      { x: 660, y: 840 },
    ];
    t.floors[0].rooms[5].polygon = [
      { x: 757, y: 480 },
      { x: 960, y: 480 },
      { x: 960, y: 840 },
      { x: 757, y: 840 },
    ];
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(['ROOM_TOO_SMALL']);
  });

  it('accepts a template meeting all builder constraints, including standard wall thicknesses', () => {
    const t = makeValidTemplate();
    for (const wall of t.floors[0].walls) {
      wall.thicknessCm = wall.kind === 'exterior' ? 20 : 10;
    }
    const result = validateTemplate(t);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe('default builder rules', () => {
  it('rejects an interior wall with the exterior thickness (20cm)', () => {
    const t = makeValidTemplate();
    t.floors[0].walls[5].thicknessCm = 20; // w-int-mid is interior; must be 10cm
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(['WALL_THICKNESS_MISMATCH']);
  });

  it('rejects a kitchen below the 6m² minimum', () => {
    const t = makeValidTemplate();
    // Move the living/kitchen split to x=840: kitchen becomes 120x480cm
    // = 5.76 m², living grows to keep the footprint fully tiled.
    t.floors[0].rooms[0].polygon = [
      { x: 0, y: 0 },
      { x: 840, y: 0 },
      { x: 840, y: 480 },
      { x: 0, y: 480 },
    ];
    t.floors[0].rooms[1].polygon = [
      { x: 840, y: 0 },
      { x: 960, y: 0 },
      { x: 960, y: 480 },
      { x: 840, y: 480 },
    ];
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(['ROOM_TOO_SMALL']);
  });

  it('rejects a living room below the 12m² minimum', () => {
    const t = makeValidTemplate();
    // Move the living/kitchen split to x=150: living becomes 150x480cm
    // = 7.2 m², kitchen grows to keep the footprint fully tiled.
    t.floors[0].rooms[0].polygon = [
      { x: 0, y: 0 },
      { x: 150, y: 0 },
      { x: 150, y: 480 },
      { x: 0, y: 480 },
    ];
    t.floors[0].rooms[1].polygon = [
      { x: 150, y: 0 },
      { x: 960, y: 0 },
      { x: 960, y: 480 },
      { x: 150, y: 480 },
    ];
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(['ROOM_TOO_SMALL']);
  });

  it('applies default rules alongside user-supplied rules', () => {
    const t = makeValidTemplate();
    t.floors[0].walls[0].thicknessCm = 15;
    const alwaysFails: ConstraintRule = {
      id: 'always-fails',
      severity: 'hard',
      check: () => [
        { code: 'CUSTOM_RULE_HIT', message: 'custom rule fired', path: '' },
      ],
    };
    const result = validateTemplate(t, { rules: [alwaysFails] });
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(['WALL_THICKNESS_MISMATCH', 'CUSTOM_RULE_HIT']);
  });
});

describe('pluggable constraint rules', () => {
  it('runs a custom hard rule and fails validation on its violations', () => {
    const alwaysFails: ConstraintRule = {
      id: 'always-fails',
      severity: 'hard',
      check: () => [
        { code: 'CUSTOM_RULE_HIT', message: 'custom rule fired', path: '' },
      ],
    };
    const result = validateTemplate(makeValidTemplate(), { rules: [alwaysFails] });
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('CUSTOM_RULE_HIT');
  });

  it('timber module rule passes when all wall lengths snap to the module', () => {
    const result = validateTemplate(makeValidTemplate(), {
      rules: [createTimberModuleRule(60)],
    });
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('timber module rule fails when a wall length is off-module', () => {
    const result = validateTemplate(makeValidTemplate(), {
      rules: [createTimberModuleRule(70)], // 960 % 70 !== 0
    });
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('WALL_OFF_MODULE');
  });

  it('soft rule violations are reported but do not fail validation', () => {
    const result = validateTemplate(makeValidTemplate(), {
      rules: [createTimberModuleRule(70, 'soft')],
    });
    expect(result.ok).toBe(true);
    expect(codes(result)).toContain('WALL_OFF_MODULE');
    expect(result.violations.every((v) => v.severity === 'soft')).toBe(true);
  });
});
