import { z } from 'zod';

/**
 * WoodPlan template schema.
 *
 * A template is a complete, curated wooden-house floor plan as data.
 * The SVG renderer, the selection engine, and the PDF exporter all consume
 * this shape; the validator (see ./validator.ts) is the gatekeeper that
 * decides whether a template - typically AI-generated - may enter the library.
 *
 * Conventions:
 * - All coordinates and lengths are integer CENTIMETERS. Display units and
 *   m² figures are always computed from geometry, never stored per-room.
 * - Polygons are simple rectilinear (axis-aligned) rings, listed without
 *   repeating the first point; the closing edge is implicit.
 * - Text fields hold i18n label KEYS (e.g. "room.bedroom"), never display
 *   strings. Localization happens at render time.
 *
 * @example
 * {
 *   "id": "tmpl-80a",
 *   "nameKey": "template.80a.name",
 *   "sizeBand": "80-100",
 *   "declaredAreaM2": 80,
 *   "declaredBedrooms": 2,
 *   "floorConfig": "single",
 *   "floors": [{
 *     "id": "ground",
 *     "level": "ground",
 *     "footprint": [{"x":0,"y":0},{"x":1000,"y":0},{"x":1000,"y":800},{"x":0,"y":800}],
 *     "rooms": [{
 *       "id": "living",
 *       "labelKey": "room.living",
 *       "type": "living",
 *       "polygon": [{"x":0,"y":0},{"x":600,"y":0},{"x":600,"y":500},{"x":0,"y":500}]
 *     }],
 *     "walls": [{"id":"w-south","from":{"x":0,"y":0},"to":{"x":1000,"y":0},"kind":"exterior"}],
 *     "openings": [{"id":"door-1","kind":"door","wallId":"w-south","offsetCm":450,"widthCm":100}]
 *   }]
 * }
 */

/** A 2D point in integer centimeters, origin at the plan's south-west corner. */
export const pointSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
});

/**
 * A simple rectilinear polygon ring. Minimum 4 points (the smallest
 * axis-aligned shape). Rectilinearity itself is a geometry check performed
 * by the validator, not expressible in the schema.
 */
export const polygonSchema = z.array(pointSchema).min(4);

/** Room function tags. `bedroom` rooms are counted against declaredBedrooms. */
export const roomTypeSchema = z.enum([
  'bedroom',
  'bathroom',
  'kitchen',
  'living',
  'hall',
  'storage',
  'other',
]);

export const roomSchema = z.object({
  id: z.string().min(1),
  /** i18n key for the default room label; users may rename cosmetically at runtime. */
  labelKey: z.string().min(1),
  type: roomTypeSchema,
  polygon: polygonSchema,
});

export const wallSchema = z.object({
  id: z.string().min(1),
  from: pointSchema,
  to: pointSchema,
  kind: z.enum(['exterior', 'interior']),
  /** Whether this wall is load-bearing in the timber structure. */
  bearing: z.boolean().optional(),
  /**
   * Wall thickness in cm. Optional; when present it must match the standard
   * timber-frame thickness for its kind (validator-enforced: exterior 20cm,
   * interior 10cm, per builder constraints).
   */
  thicknessCm: z.number().int().positive().optional(),
});

/** A door or window placed along a wall, measured from the wall's `from` end. */
export const openingSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['door', 'window']),
  wallId: z.string().min(1),
  offsetCm: z.number().int().nonnegative(),
  widthCm: z.number().int().positive(),
});

export const floorSchema = z.object({
  id: z.string().min(1),
  level: z.enum(['ground', 'attic']),
  /** Outer boundary of this floor; rooms must tile it exactly (validator-enforced). */
  footprint: polygonSchema,
  rooms: z.array(roomSchema).min(1),
  walls: z.array(wallSchema),
  openings: z.array(openingSchema),
});

/** Filterable size bands used by the selection engine and the library matrix. */
export const sizeBandSchema = z.enum(['40-60', '60-80', '80-100', '100-120']);

export const templateSchema = z.object({
  id: z.string().min(1),
  /** i18n key for the template's display name. */
  nameKey: z.string().min(1),
  sizeBand: sizeBandSchema,
  /**
   * Declared habitable area, used for filtering/display. The validator
   * rejects templates where this drifts from the computed polygon area.
   */
  declaredAreaM2: z.number().positive(),
  /** Declared bedroom count; must match rooms tagged `bedroom`. */
  declaredBedrooms: z.number().int().nonnegative(),
  floorConfig: z.enum(['single', 'single+attic']),
  floors: z.array(floorSchema).min(1).max(2),
});

export type Point = z.infer<typeof pointSchema>;
export type Polygon = z.infer<typeof polygonSchema>;
export type RoomType = z.infer<typeof roomTypeSchema>;
export type Room = z.infer<typeof roomSchema>;
export type Wall = z.infer<typeof wallSchema>;
export type Opening = z.infer<typeof openingSchema>;
export type Floor = z.infer<typeof floorSchema>;
export type SizeBand = z.infer<typeof sizeBandSchema>;
export type Template = z.infer<typeof templateSchema>;
