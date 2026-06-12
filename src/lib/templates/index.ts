import { templateSchema, type Template } from '../schema/template.schema.ts';
import l01 from './large/template_l01.json';
import m01 from './medium/template_m01.json';
import m02 from './medium/template_m02.json';
import s01 from './small/template_s01.json';
import s02 from './small/template_s02.json';

/**
 * Template registry (issue #5): the curated library, in catalog order
 * (small → large). Each JSON is re-parsed through the schema at module load
 * so the registry exports properly-typed, guaranteed-valid templates — a
 * malformed file fails loudly at startup instead of deep inside the UI.
 */
export const templates: Template[] = [s01, s02, m01, m02, l01].map((raw) =>
  templateSchema.parse(raw),
);

/** Look up a registry template by its `id`, e.g. "tmpl-m01". */
export function getTemplateById(id: string): Template | undefined {
  return templates.find((t) => t.id === id);
}
