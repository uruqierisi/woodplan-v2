// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { translate } from '../i18n/index.ts';
import type { Template } from '../schema/template.schema.ts';
import { renderTemplate } from './renderer.ts';

/**
 * Customization rendering tests (issue #6): mirror, room renames, language,
 * theme. The invariant under test everywhere: the template object is NEVER
 * mutated — customization is cosmetic only (decision #11).
 */

/** Two-room fixture: living west (x 0..600), kitchen east (x 600..960). */
function makeTemplate(): Template {
  return {
    id: 'tmpl-test-mirror',
    nameKey: 'template.test.name',
    sizeBand: '40-60',
    declaredAreaM2: 57.6,
    declaredBedrooms: 0,
    floorConfig: 'single',
    floors: [
      {
        id: 'ground',
        level: 'ground',
        footprint: [
          { x: 0, y: 0 },
          { x: 960, y: 0 },
          { x: 960, y: 600 },
          { x: 0, y: 600 },
        ],
        rooms: [
          {
            id: 'living',
            labelKey: 'room.living',
            type: 'living',
            polygon: [
              { x: 0, y: 0 },
              { x: 600, y: 0 },
              { x: 600, y: 600 },
              { x: 0, y: 600 },
            ],
          },
          {
            id: 'kitchen',
            labelKey: 'room.kitchen',
            type: 'kitchen',
            polygon: [
              { x: 600, y: 0 },
              { x: 960, y: 0 },
              { x: 960, y: 600 },
              { x: 600, y: 600 },
            ],
          },
        ],
        walls: [
          { id: 'w-south', from: { x: 0, y: 0 }, to: { x: 960, y: 0 }, kind: 'exterior' },
          { id: 'w-west', from: { x: 0, y: 600 }, to: { x: 0, y: 0 }, kind: 'exterior' },
          { id: 'w-int', from: { x: 600, y: 0 }, to: { x: 600, y: 600 }, kind: 'interior' },
        ],
        openings: [
          { id: 'door-main', kind: 'door', wallId: 'w-south', offsetCm: 100, widthCm: 100 },
          { id: 'win-living', kind: 'window', wallId: 'w-west', offsetCm: 200, widthCm: 150 },
        ],
      },
    ],
  };
}

/** Smallest screen x of a room's rendered polygon. */
function roomMinX(svg: string, roomId: string): number {
  const match = svg.match(
    new RegExp(`<polygon class="room" data-room-id="${roomId}" points="([^"]+)"`),
  );
  expect(match).not.toBeNull();
  return Math.min(...match![1].split(' ').map((pair) => Number(pair.split(',')[0])));
}

function parseSvg(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  return doc;
}

describe('mirror', () => {
  it('flips room positions horizontally', () => {
    const template = makeTemplate();
    const normal = renderTemplate(template);
    const mirrored = renderTemplate(template, { mirrored: true });

    // Living is west of the kitchen normally, east of it when mirrored.
    expect(roomMinX(normal, 'living')).toBeLessThan(roomMinX(normal, 'kitchen'));
    expect(roomMinX(mirrored, 'living')).toBeGreaterThan(roomMinX(mirrored, 'kitchen'));
  });

  it('never mutates the template', () => {
    const template = makeTemplate();
    const before = JSON.stringify(template);
    renderTemplate(template, { mirrored: true, labelOverrides: { living: 'Zyra' } });
    expect(JSON.stringify(template)).toBe(before);
  });

  it('keeps doors and windows valid (door swing arc present, XML parses)', () => {
    const doc = parseSvg(renderTemplate(makeTemplate(), { mirrored: true }));
    const door = doc.querySelector('g.door');
    const win = doc.querySelector('g.window');
    expect(door).not.toBeNull();
    expect(win).not.toBeNull();
    // The swing arc survives mirroring.
    expect(door!.querySelector('path')!.getAttribute('d')).toContain('A');
  });

  it('keeps dimension labels and the north arrow unmirrored (readable)', () => {
    const svg = renderTemplate(makeTemplate(), { mirrored: true });
    // Text is laid out per-glyph, never inside a scale(-1,1) group.
    expect(svg).not.toContain('scale(-1');
    expect(svg).toContain('9.6 m');
    expect(svg).toContain('6 m');
    expect(svg).toContain('class="north-arrow"');
  });

  it('renders identical dimension lines mirrored and not (same axes)', () => {
    const dims = (svg: string) => {
      const match = svg.match(/<g class="dimensions".*?<\/g>/s);
      expect(match).not.toBeNull();
      return match![0];
    };
    const template = makeTemplate();
    // The footprint bounds don't change under reflection, so the dimension
    // overlay must not move — it stays outside the plan on the same sides.
    expect(dims(renderTemplate(template, { mirrored: true }))).toBe(
      dims(renderTemplate(template)),
    );
  });
});

describe('room rename overrides', () => {
  it('replaces the display label without touching other rooms', () => {
    const svg = renderTemplate(makeTemplate(), {
      lang: 'sq',
      labelOverrides: { living: 'Zyra ime' },
    });
    expect(svg).toContain('Zyra ime');
    expect(svg).not.toContain('Dhoma e ndenjes');
    expect(svg).toContain('Kuzhina'); // untouched room keeps its translation
  });

  it('does not mutate the source template', () => {
    const template = makeTemplate();
    const before = JSON.stringify(template);
    renderTemplate(template, { labelOverrides: { living: 'Zyra ime', kitchen: 'Mensa' } });
    expect(JSON.stringify(template)).toBe(before);
    expect(template.floors[0].rooms[0].labelKey).toBe('room.living');
  });

  it('ignores overrides for unknown room ids and empty labels', () => {
    const svg = renderTemplate(makeTemplate(), {
      labelOverrides: { nonexistent: 'Ghost', living: '' },
    });
    expect(svg).not.toContain('Ghost');
    expect(svg).toContain('Dhoma e ndenjes'); // empty override falls back
  });
});

describe('language switch', () => {
  it('changes UI strings via translate', () => {
    expect(translate('sq', 'ui.mirror')).toBe('Pasqyro planin');
    expect(translate('en', 'ui.mirror')).toBe('Mirror plan');
    expect(translate('sq', 'ui.back')).not.toBe(translate('en', 'ui.back'));
  });

  it('changes room labels in the rendered plan', () => {
    const template = makeTemplate();
    const sq = renderTemplate(template, { lang: 'sq' });
    const en = renderTemplate(template, { lang: 'en' });
    expect(sq).toContain('Kuzhina');
    expect(en).toContain('Kitchen');
    expect(en).not.toContain('Kuzhina');
  });

  it('resolves template nameKeys from the registry dictionaries', () => {
    expect(translate('sq', 'template.m02.name')).toBe('Shtëpi me papafingo 86');
    expect(translate('en', 'template.m02.name')).toBe('Attic house 86');
  });
});

describe('theme pass-through', () => {
  it('renders the requested palette', () => {
    const template = makeTemplate();
    const wood = renderTemplate(template, { theme: 'wood' });
    const mono = renderTemplate(template, { theme: 'mono' });
    expect(wood).toContain('#8B6914');
    expect(mono).toContain('#1a1a1a');
    expect(mono).not.toContain('#8B6914');
  });

  it('combines with mirror and renames in one pass', () => {
    const svg = renderTemplate(makeTemplate(), {
      theme: 'mono',
      mirrored: true,
      labelOverrides: { kitchen: 'Mensa' },
    });
    expect(svg).toContain('#1a1a1a');
    expect(svg).toContain('Mensa');
    expect(roomMinX(svg, 'living')).toBeGreaterThan(roomMinX(svg, 'kitchen'));
  });
});
