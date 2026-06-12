import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import { translate, type Lang } from '../i18n/index.ts';
import type { Point, Template } from '../schema/template.schema.ts';
import { renderTemplate } from '../svg/renderer.ts';

/**
 * Client-side vector PDF export (issue #7, decision #10: jsPDF + svg2pdf.js).
 *
 * The PDF must reflect the on-screen state exactly: language, mirror, theme,
 * AND the session-only room renames — the case the useTemplateCustomization
 * module comment flags. That's why the caller passes the live customization
 * object; nothing here reads the URL. The plan drawing itself comes from
 * renderTemplate (#3) — no geometry or rendering logic is reimplemented.
 */

/** The cosmetic state to bake in; TemplateCustomization satisfies this. */
export interface ExportCustomization {
  mirrored: boolean;
  theme: 'wood' | 'mono';
  roomOverrides: Record<string, string>;
}

export interface ExportOptions {
  /** Timestamp for the title block + PDF metadata; injectable for tests. */
  now?: Date;
}

/* ----- A4 portrait layout, all in mm ----- */
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - 2 * MARGIN;
/** Plan may use at most this height so schedule + disclaimer always fit. */
const PLAN_MAX_H = 150;
const ROW_H = 6.5;
/** Table rows never descend past this; overflow continues on a new page. */
const TABLE_FLOOR = PAGE_H - 24;
/** Disclaimer: mandatory, current language, >= 9pt, full-contrast black. */
const DISCLAIMER_SIZE_PT = 10;

export async function generatePdf(
  template: Template,
  customization: ExportCustomization,
  lang: Lang,
  options: ExportOptions = {},
): Promise<Blob> {
  const now = options.now ?? new Date();
  const t = (key: string) => translate(lang, key);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.setCreationDate(now);

  renderTitleBlock(doc, template, lang, now);
  const planBottom = await renderPlan(doc, template, customization, lang);
  renderRoomSchedule(doc, template, customization, t, planBottom + 9);
  renderDisclaimer(doc, lang);

  return doc.output('blob');
}

function renderTitleBlock(doc: jsPDF, template: Template, lang: Lang, now: Date): void {
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('WoodPlan', MARGIN, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  // URL/QR placeholder per spec — a real QR code is out of scope for v2.
  doc.text('woodplan.app', PAGE_W - MARGIN, 20, { align: 'right' });

  doc.setFontSize(12);
  doc.text(translate(lang, template.nameKey), MARGIN, 27);
  doc.setFontSize(9);
  doc.text(now.toISOString().slice(0, 10), PAGE_W - MARGIN, 27, { align: 'right' });

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, 31, PAGE_W - MARGIN, 31);
}

/**
 * Places the renderTemplate SVG (dimensions, north arrow, scale bar and all)
 * via svg2pdf, fitted to the content width/height budget with the aspect
 * ratio preserved. Returns the bottom y of the drawn plan.
 */
async function renderPlan(
  doc: jsPDF,
  template: Template,
  customization: ExportCustomization,
  lang: Lang,
): Promise<number> {
  const svg = renderTemplate(template, {
    lang,
    theme: customization.theme,
    mirrored: customization.mirrored,
    labelOverrides: customization.roomOverrides,
  });

  const svgDoc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const svgEl = svgDoc.documentElement as unknown as SVGSVGElement;
  const svgW = Number(svgEl.getAttribute('width'));
  const svgH = Number(svgEl.getAttribute('height'));

  const scale = Math.min(CONTENT_W / svgW, PLAN_MAX_H / svgH);
  const w = svgW * scale;
  const h = svgH * scale;
  const top = 36;

  // svg2pdf reads computed styles, so the element must live in a document.
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.visibility = 'hidden';
  host.appendChild(document.adoptNode(svgEl));
  document.body.appendChild(host);
  try {
    await doc.svg(svgEl, { x: MARGIN + (CONTENT_W - w) / 2, y: top, width: w, height: h });
  } finally {
    host.remove();
  }
  return top + h;
}

interface ScheduleRow {
  kind: 'section' | 'room';
  label: string;
  areaM2?: number;
}

/**
 * Room schedule: display name (renames applied, current language only) and
 * area computed from the room polygon — never from stored metadata. With two
 * floors, rooms are grouped under a floor section row.
 */
function renderRoomSchedule(
  doc: jsPDF,
  template: Template,
  customization: ExportCustomization,
  t: (key: string) => string,
  top: number,
): void {
  const rows: ScheduleRow[] = [];
  let totalM2 = 0;
  for (const floor of template.floors) {
    if (template.floors.length > 1) {
      rows.push({ kind: 'section', label: t(`floor.${floor.level}`) });
    }
    for (const room of floor.rooms) {
      const override = customization.roomOverrides[room.id];
      const label = override !== undefined && override !== '' ? override : t(room.labelKey);
      const areaM2 = polygonAreaM2(room.polygon);
      totalM2 += areaM2;
      rows.push({ kind: 'room', label, areaM2 });
    }
  }

  const xName = MARGIN + 2;
  const xArea = PAGE_W - MARGIN - 2;
  let y = top;

  const nextLine = (): void => {
    y += ROW_H;
    if (y > TABLE_FLOOR) {
      doc.addPage();
      y = MARGIN + ROW_H;
    }
  };

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(t('ui.room'), xName, y);
  doc.text(`${t('ui.area')} (m²)`, xArea, y, { align: 'right' });
  doc.line(MARGIN, y + 2, PAGE_W - MARGIN, y + 2);

  doc.setFontSize(10);
  for (const row of rows) {
    nextLine();
    if (row.kind === 'section') {
      doc.setFont('helvetica', 'bolditalic');
      doc.text(row.label, xName, y);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.text(row.label, xName, y);
      doc.text(row.areaM2!.toFixed(1), xArea, y, { align: 'right' });
    }
  }

  nextLine();
  doc.line(MARGIN, y - ROW_H + 2.5, PAGE_W - MARGIN, y - ROW_H + 2.5);
  doc.setFont('helvetica', 'bold');
  doc.text(t('ui.total'), xName, y);
  doc.text(totalM2.toFixed(1), xArea, y, { align: 'right' });
}

/**
 * Mandatory, not configurable, current language, legible (black, 10pt),
 * stamped on every page in case the schedule overflowed onto a second one.
 */
function renderDisclaimer(doc: jsPDF, lang: Lang): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(DISCLAIMER_SIZE_PT);
  doc.setTextColor(0, 0, 0);
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    doc.text(translate(lang, 'disclaimer'), PAGE_W / 2, PAGE_H - 12, { align: 'center' });
  }
}

/**
 * Shoelace area in m². The renderer and validator each keep their own copy
 * private; duplicating four lines beats exporting internals.
 */
function polygonAreaM2(polygon: Point[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2 / 10_000;
}
