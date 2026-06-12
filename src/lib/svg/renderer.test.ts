// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Template } from '../schema/template.schema.ts';
import { renderTemplate } from './renderer.ts';

/**
 * Same known-good 9.6m x 8.4m fixture as validator.test.ts: six rooms tiling
 * the footprint exactly, one entrance door, one interior door, one window.
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

function viewBoxOf(svg: string): { width: number; height: number } {
  const match = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  expect(match).not.toBeNull();
  return { width: Number(match![1]), height: Number(match![2]) };
}

describe('renderTemplate', () => {
  it('outputs an SVG document starting with <svg', () => {
    const svg = renderTemplate(makeValidTemplate());
    expect(svg.startsWith('<svg')).toBe(true);
  });

  it('renders one polygon per room', () => {
    const svg = renderTemplate(makeValidTemplate());
    const roomPolygons = svg.match(/<polygon class="room"/g) ?? [];
    expect(roomPolygons.length).toBe(6);
  });

  it("uses Albanian room labels when lang='sq'", () => {
    const svg = renderTemplate(makeValidTemplate(), { lang: 'sq' });
    expect(svg).toContain('Kuzhina');
    expect(svg).toContain('Dhoma e gjumit');
    expect(svg).not.toContain('Kitchen');
  });

  it("uses English room labels when lang='en'", () => {
    const svg = renderTemplate(makeValidTemplate(), { lang: 'en' });
    expect(svg).toContain('Kitchen');
    expect(svg).toContain('Bedroom');
    expect(svg).not.toContain('Kuzhina');
  });

  it('always includes the disclaimer in both languages', () => {
    for (const lang of ['sq', 'en'] as const) {
      const svg = renderTemplate(makeValidTemplate(), { lang });
      expect(svg).toContain('Concept plan — not for construction or permits');
      expect(svg).toContain('Plan konceptual — jo për ndërtim ose leje');
    }
  });

  it('uses the wood theme palette', () => {
    const svg = renderTemplate(makeValidTemplate(), { theme: 'wood' });
    expect(svg).toContain('#8B6914'); // wall
    expect(svg).toContain('#F5F0E8'); // room
    expect(svg).toContain('#D4A96A'); // accent
    expect(svg).toContain('#2C1810'); // text
  });

  it('uses the mono theme palette', () => {
    const svg = renderTemplate(makeValidTemplate(), { theme: 'mono' });
    expect(svg).toContain('#1a1a1a'); // wall + text
    expect(svg).toContain('#f5f5f5'); // room
    expect(svg).toContain('#666'); // accent
    expect(svg).not.toContain('#8B6914');
  });

  it('doubles the viewBox when the scale doubles', () => {
    const at50 = viewBoxOf(renderTemplate(makeValidTemplate(), { scale: 50 }));
    const at100 = viewBoxOf(renderTemplate(makeValidTemplate(), { scale: 100 }));
    expect(at100.width).toBeCloseTo(at50.width * 2, 5);
    expect(at100.height).toBeCloseTo(at50.height * 2, 5);
  });

  it('omits dimension lines when showDimensions is false', () => {
    const withDims = renderTemplate(makeValidTemplate(), { showDimensions: true });
    const withoutDims = renderTemplate(makeValidTemplate(), { showDimensions: false });
    expect(withDims).toContain('class="dimensions"');
    expect(withDims).toContain('9.6 m'); // computed from the footprint polygon
    expect(withDims).toContain('8.4 m');
    expect(withoutDims).not.toContain('class="dimensions"');
  });

  it('produces valid, parseable XML', () => {
    const svg = renderTemplate(makeValidTemplate(), { lang: 'en', theme: 'mono' });
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.documentElement.tagName.toLowerCase()).toBe('svg');
    expect(doc.querySelectorAll('polygon.room').length).toBe(6);
  });
});
