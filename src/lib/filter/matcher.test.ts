import { describe, expect, it } from 'vitest';
import type { Template } from '../schema/template.schema.ts';
import { templates } from '../templates/index.ts';
import {
  NO_FILTERS,
  SCORE_EXACT,
  SCORE_PARTIAL,
  rankTemplates,
  scoreTemplate,
  type Filters,
} from './matcher.ts';

/**
 * Registry recap (catalog order):
 *   tmpl-s01  55.44 m²  band 40-60   1 bed  single
 *   tmpl-s02  57.6 m²   band 40-60   2 bed  single
 *   tmpl-m01  77.76 m²  band 60-80   3 bed  single
 *   tmpl-m02  86.4 m²   band 80-100  2 bed  single+attic
 *   tmpl-l01  108 m²    band 100-120 4 bed  single
 */
const byId = (id: string): Template => {
  const found = templates.find((t) => t.id === id);
  if (!found) throw new Error(`registry is missing ${id}`);
  return found;
};

/** Synthetic template carrying only the fields the matcher reads. */
function fakeTemplate(meta: {
  sizeBand: Template['sizeBand'];
  declaredAreaM2: number;
  declaredBedrooms?: number;
  floorConfig?: Template['floorConfig'];
}): Template {
  return {
    id: 'tmpl-fake',
    nameKey: 'template.fake.name',
    declaredBedrooms: 2,
    floorConfig: 'single',
    floors: [],
    ...meta,
  } as unknown as Template;
}

const filters = (partial: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...partial });

describe('scoreTemplate', () => {
  it('scores a full exact match as 3 x SCORE_EXACT', () => {
    const score = scoreTemplate(byId('tmpl-m01'), { size: 'medium', beds: '3', floors: '1' });
    expect(score).toBe(3 * SCORE_EXACT);
  });

  it('treats any-filters as neutral', () => {
    expect(scoreTemplate(byId('tmpl-m01'), NO_FILTERS)).toBe(0);
  });

  it('counts beds=4 as "4 or more"', () => {
    expect(scoreTemplate(byId('tmpl-l01'), filters({ beds: '4' }))).toBe(SCORE_EXACT);
    expect(
      scoreTemplate(fakeTemplate({ sizeBand: '100-120', declaredAreaM2: 110, declaredBedrooms: 5 }), filters({ beds: '4' })),
    ).toBe(SCORE_EXACT);
    expect(scoreTemplate(byId('tmpl-m01'), filters({ beds: '4' }))).toBe(0);
  });

  it('scores size partially when the catalog band straddles the browse band', () => {
    // tmpl-m02: band 80-100 straddles medium/large, area 86.4 is in medium.
    expect(scoreTemplate(byId('tmpl-m02'), filters({ size: 'medium' }))).toBe(SCORE_PARTIAL);
    expect(scoreTemplate(byId('tmpl-m02'), filters({ size: 'large' }))).toBe(0);
  });
});

describe('scoreTemplate size band boundaries', () => {
  it('gives an exact match for a band touching the browse-band edge', () => {
    const exactly60 = fakeTemplate({ sizeBand: '40-60', declaredAreaM2: 60 });
    expect(scoreTemplate(exactly60, filters({ size: 'small' }))).toBe(SCORE_EXACT);
  });

  it('treats a boundary area as belonging to both adjacent bands', () => {
    // Band 60-80 is exactly inside medium; an area of exactly 60 m² is also
    // still (partially) a small-house match rather than being filtered out.
    const sixty = fakeTemplate({ sizeBand: '60-80', declaredAreaM2: 60 });
    expect(scoreTemplate(sixty, filters({ size: 'medium' }))).toBe(SCORE_EXACT);
    expect(scoreTemplate(sixty, filters({ size: 'small' }))).toBe(SCORE_PARTIAL);

    const ninety = fakeTemplate({ sizeBand: '80-100', declaredAreaM2: 90 });
    expect(scoreTemplate(ninety, filters({ size: 'medium' }))).toBe(SCORE_PARTIAL);
    expect(scoreTemplate(ninety, filters({ size: 'large' }))).toBe(SCORE_PARTIAL);
  });

  it('scores zero outside the band', () => {
    const tiny = fakeTemplate({ sizeBand: '40-60', declaredAreaM2: 45 });
    expect(scoreTemplate(tiny, filters({ size: 'large' }))).toBe(0);
  });
});

describe('rankTemplates', () => {
  it('puts the exact match first', () => {
    const result = rankTemplates(templates, { size: 'medium', beds: '3', floors: '1' });
    expect(result.templates[0].id).toBe('tmpl-m01');
    expect(result.relaxed).toEqual([]);
  });

  it('returns everything in registry order when no filters are set', () => {
    const result = rankTemplates(templates, NO_FILTERS);
    expect(result.templates.map((t) => t.id)).toEqual(templates.map((t) => t.id));
    expect(result.relaxed).toEqual([]);
  });

  it('keeps registry order among equal scores', () => {
    // Both small templates match size=small exactly; s01 stays before s02.
    const result = rankTemplates(templates, filters({ size: 'small' }));
    expect(result.templates.map((t) => t.id).slice(0, 2)).toEqual(['tmpl-s01', 'tmpl-s02']);
  });

  it('relaxes size first, then beds, and never returns empty', () => {
    // No template is small + 4 beds + attic. Dropping size still leaves
    // nothing (no 4-bed attic house); dropping beds finds tmpl-m02.
    const result = rankTemplates(templates, { size: 'small', beds: '4', floors: 'attic' });
    expect(result.relaxed).toEqual(['size', 'beds']);
    expect(result.templates.length).toBeGreaterThan(0);
    expect(result.templates[0].id).toBe('tmpl-m02');
  });

  it('only excludes templates failing an active filter', () => {
    const result = rankTemplates(templates, filters({ beds: '2' }));
    expect(result.templates.map((t) => t.id)).toEqual(['tmpl-s02', 'tmpl-m02']);
    expect(result.relaxed).toEqual([]);
  });
});
