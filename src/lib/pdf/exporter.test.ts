// @vitest-environment jsdom
import { PDFParse } from 'pdf-parse';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Template } from '../schema/template.schema.ts';
import { templates } from '../templates/index.ts';
import { generatePdf, type ExportCustomization } from './exporter.ts';

// jsdom does no layout, so SVGElement.getBBox (which svg2pdf uses to measure
// text for anchor offsets) is missing. A rough width estimate is fine here:
// it shifts text positions slightly but changes no PDF text content.
beforeAll(() => {
  const proto = SVGElement.prototype as unknown as { getBBox?: () => DOMRect };
  proto.getBBox ??= function (this: SVGElement) {
    const fontSize = Number(this.getAttribute('font-size')) || 16;
    const width = (this.textContent ?? '').length * fontSize * 0.55;
    return { x: 0, y: 0, width, height: fontSize } as DOMRect;
  };
});

const byId = (id: string): Template => {
  const found = templates.find((t) => t.id === id);
  if (!found) throw new Error(`registry is missing ${id}`);
  return found;
};

const DEFAULTS: ExportCustomization = { mirrored: false, theme: 'wood', roomOverrides: {} };
/** Fixed timestamp so two exports differ only by what we changed. */
const NOW = new Date('2026-06-12T12:00:00Z');

async function pdfText(blob: Blob): Promise<string> {
  const data = new Uint8Array(await blob.arrayBuffer());
  const parser = new PDFParse({ data });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

describe('generatePdf', () => {
  it("returns a Blob with type 'application/pdf'", async () => {
    const blob = await generatePdf(byId('tmpl-s01'), DEFAULTS, 'sq', { now: NOW });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(1000);
  });

  it('contains the Albanian disclaimer when lang=sq', async () => {
    const blob = await generatePdf(byId('tmpl-s01'), DEFAULTS, 'sq', { now: NOW });
    expect(await pdfText(blob)).toContain('Plan konceptual — jo për ndërtim ose leje');
  });

  it('contains the English disclaimer when lang=en', async () => {
    const blob = await generatePdf(byId('tmpl-s01'), DEFAULTS, 'en', { now: NOW });
    expect(await pdfText(blob)).toContain('Concept plan — not for construction or permits');
  });

  it('schedule total matches the sum of room polygon areas (±0.1 m²)', async () => {
    // m02 exercises the two-floor grouping; expected sum from the registry.
    const template = byId('tmpl-m02');
    const expectedTotal = 86.4;
    const text = await pdfText(await generatePdf(template, DEFAULTS, 'en', { now: NOW }));
    const totalLine = text.split('\n').find((line) => line.includes('Total'));
    expect(totalLine).toBeDefined();
    const total = Number(totalLine!.match(/(\d+\.\d)/)?.[1]);
    expect(Math.abs(total - expectedTotal)).toBeLessThanOrEqual(0.1);
  });

  it('applies room renames in the schedule instead of the original labels', async () => {
    const customization: ExportCustomization = {
      ...DEFAULTS,
      roomOverrides: { living: 'Zyra ime', kitchen: 'Mensa' },
    };
    const text = await pdfText(
      await generatePdf(byId('tmpl-s01'), customization, 'sq', { now: NOW }),
    );
    expect(text).toContain('Zyra ime');
    expect(text).toContain('Mensa');
    // The renamed rooms' original labels are gone everywhere (plan + table);
    // untouched rooms keep their translations.
    expect(text).not.toContain('Dhoma e ndenjes');
    expect(text).not.toContain('Kuzhina');
    expect(text).toContain('Dhoma e gjumit');
  });

  it('mirrored produces a different but equally valid PDF', async () => {
    const template = byId('tmpl-s01');
    const normal = await generatePdf(template, DEFAULTS, 'sq', { now: NOW });
    const mirrored = await generatePdf(
      template,
      { ...DEFAULTS, mirrored: true },
      'sq',
      { now: NOW },
    );

    // Same fixed timestamp, so any byte difference is the flipped drawing.
    const a = new Uint8Array(await normal.arrayBuffer());
    const b = new Uint8Array(await mirrored.arrayBuffer());
    expect(a.length === b.length && a.every((byte, i) => byte === b[i])).toBe(false);

    // Both stay valid, fully extractable PDFs with the same text content.
    const normalText = await pdfText(normal);
    const mirroredText = await pdfText(mirrored);
    expect(mirroredText).toContain('Plan konceptual — jo për ndërtim ose leje');
    expect(mirroredText).toContain('Dhoma e ndenjes');
    expect(mirroredText.length).toBe(normalText.length);
  });

  it('theme passes through to the embedded plan', async () => {
    const wood = await generatePdf(byId('tmpl-s01'), DEFAULTS, 'sq', { now: NOW });
    const mono = await generatePdf(
      byId('tmpl-s01'),
      { ...DEFAULTS, theme: 'mono' },
      'sq',
      { now: NOW },
    );
    const a = new Uint8Array(await wood.arrayBuffer());
    const b = new Uint8Array(await mono.arrayBuffer());
    expect(a.length === b.length && a.every((byte, i) => byte === b[i])).toBe(false);
  });
});
