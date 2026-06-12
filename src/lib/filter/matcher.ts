import type { Template } from '../schema/template.schema.ts';

/**
 * Template filtering and ranking (issue #5).
 *
 * Filters are the three questions the Browse page asks: how big, how many
 * bedrooms, how many floors. Every dimension accepts 'any', which is neutral
 * — it neither scores nor disqualifies.
 */

/** Browse-facing size bands. Wider than the schema's catalog `sizeBand`s. */
export type SizeFilter = 'small' | 'medium' | 'large' | 'any';
/** Bedroom count as a string for URL round-tripping; '4' means "4 or more". */
export type BedsFilter = '1' | '2' | '3' | '4' | 'any';
export type FloorsFilter = '1' | 'attic' | 'any';

export interface Filters {
  size: SizeFilter;
  beds: BedsFilter;
  floors: FloorsFilter;
}

export type FilterDimension = keyof Filters;

export const NO_FILTERS: Filters = { size: 'any', beds: 'any', floors: 'any' };

/** Browse band ranges in m², boundaries inclusive on both ends. */
export const SIZE_BANDS: Record<Exclude<SizeFilter, 'any'>, { min: number; max: number }> = {
  small: { min: 40, max: 60 },
  medium: { min: 60, max: 90 },
  large: { min: 90, max: 120 },
};

export const SCORE_EXACT = 10;
export const SCORE_PARTIAL = 5;

/**
 * Score one filter dimension for one template; 0 means "does not match".
 *
 * Size has two tiers: a template whose catalog `sizeBand` sits entirely
 * inside the requested browse band is an exact match (+10); one whose band
 * straddles a boundary but whose declared area still falls inside the
 * requested band is a partial match (+5). Boundary values belong to both
 * adjacent bands (a 60 m² house is a partial match for both small and
 * medium), so a house on a band edge is never filtered out by rounding.
 */
function dimensionScore(template: Template, filters: Filters, dim: FilterDimension): number {
  switch (dim) {
    case 'beds': {
      if (filters.beds === 'any') return 0;
      const matches =
        filters.beds === '4'
          ? template.declaredBedrooms >= 4
          : template.declaredBedrooms === Number(filters.beds);
      return matches ? SCORE_EXACT : 0;
    }
    case 'floors': {
      if (filters.floors === 'any') return 0;
      const wanted = filters.floors === '1' ? 'single' : 'single+attic';
      return template.floorConfig === wanted ? SCORE_EXACT : 0;
    }
    case 'size': {
      if (filters.size === 'any') return 0;
      const band = SIZE_BANDS[filters.size];
      const [lo, hi] = template.sizeBand.split('-').map(Number);
      if (lo >= band.min && hi <= band.max) return SCORE_EXACT;
      if (template.declaredAreaM2 >= band.min && template.declaredAreaM2 <= band.max) {
        return SCORE_PARTIAL;
      }
      return 0;
    }
  }
}

const DIMENSIONS: FilterDimension[] = ['size', 'beds', 'floors'];

export function scoreTemplate(template: Template, filters: Filters): number {
  return DIMENSIONS.reduce((sum, dim) => sum + dimensionScore(template, filters, dim), 0);
}

/** True when every non-'any' dimension matches (at least partially). */
function matchesAllActive(template: Template, filters: Filters): boolean {
  return DIMENSIONS.every(
    (dim) => filters[dim] === 'any' || dimensionScore(template, filters, dim) > 0,
  );
}

export interface RankResult {
  /** Never empty (as long as the registry itself isn't). */
  templates: Template[];
  /** Dimensions whose filter was dropped to avoid an empty result. */
  relaxed: FilterDimension[];
}

/** Relaxation order per the spec: size band first, then bedrooms, then floors. */
const RELAX_ORDER: FilterDimension[] = ['size', 'beds', 'floors'];

/**
 * Ranks templates against the filters, highest score first; ties keep
 * registry order (stable sort). Only templates satisfying every active
 * filter are returned — but never none: if the combination is impossible,
 * filters are dropped one dimension at a time (size, beds, floors) until
 * something matches, and the dropped dimensions are reported in `relaxed`.
 * Scores are always computed against the ORIGINAL filters, so after a
 * relaxation the closest matches still sort to the front.
 */
export function rankTemplates(templates: Template[], filters: Filters): RankResult {
  let effective = filters;
  const relaxed: FilterDimension[] = [];
  let matching = templates.filter((t) => matchesAllActive(t, effective));

  for (const dim of RELAX_ORDER) {
    if (matching.length > 0) break;
    if (effective[dim] === 'any') continue;
    effective = { ...effective, [dim]: 'any' };
    relaxed.push(dim);
    matching = templates.filter((t) => matchesAllActive(t, effective));
  }

  const ranked = matching
    .map((template, index) => ({ template, index, score: scoreTemplate(template, filters) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.template);

  return { templates: ranked, relaxed };
}
