import { describe, expect, it } from 'vitest';
import { parseCustomization, withRoomLabel } from './useTemplateCustomization.ts';
import { parseUrlState } from './useUrlState.ts';

describe('parseCustomization', () => {
  it('defaults to unmirrored wood', () => {
    expect(parseCustomization('')).toEqual({ mirrored: false, theme: 'wood' });
  });

  it('reads ?mirrored=1&theme=mono', () => {
    expect(parseCustomization('?mirrored=1&theme=mono')).toEqual({
      mirrored: true,
      theme: 'mono',
    });
  });

  it('degrades malformed values to the defaults', () => {
    expect(parseCustomization('?mirrored=yes&theme=neon')).toEqual({
      mirrored: false,
      theme: 'wood',
    });
  });

  it('coexists with browse params in the same query string', () => {
    const search = '?size=medium&beds=2&template=tmpl-m02&mirrored=1&theme=mono&lang=en';
    expect(parseCustomization(search)).toEqual({ mirrored: true, theme: 'mono' });
    const browse = parseUrlState(search);
    expect(browse.templateId).toBe('tmpl-m02');
    expect(browse.lang).toBe('en');
    expect(browse.filters.size).toBe('medium');
  });
});

describe('withRoomLabel', () => {
  it('adds and replaces overrides', () => {
    const one = withRoomLabel({}, 'living', 'Zyra');
    expect(one).toEqual({ living: 'Zyra' });
    expect(withRoomLabel(one, 'living', 'Zyra ime')).toEqual({ living: 'Zyra ime' });
  });

  it('removes the override when the label is cleared', () => {
    expect(withRoomLabel({ living: 'Zyra', hall: 'Hyrja' }, 'living', '')).toEqual({
      hall: 'Hyrja',
    });
  });

  it('never mutates the map it was given', () => {
    const original = { living: 'Zyra' };
    withRoomLabel(original, 'kitchen', 'Mensa');
    withRoomLabel(original, 'living', '');
    expect(original).toEqual({ living: 'Zyra' });
  });

  it('keeps labels verbatim (no trimming mid-typing)', () => {
    expect(withRoomLabel({}, 'living', 'Zyra ')).toEqual({ living: 'Zyra ' });
  });
});

describe('parseUrlState language', () => {
  it("defaults to 'sq' and accepts only known languages", () => {
    expect(parseUrlState('').lang).toBe('sq');
    expect(parseUrlState('?lang=en').lang).toBe('en');
    expect(parseUrlState('?lang=de').lang).toBe('sq');
  });
});
