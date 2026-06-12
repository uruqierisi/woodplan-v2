import { useMemo } from 'react';
import { useLanguage, useT } from '../../lib/i18n/index.ts';
import type { Template } from '../../lib/schema/template.schema.ts';
import { renderTemplate } from '../../lib/svg/renderer.ts';

interface TemplateCardProps {
  template: Template;
  onSelect: (templateId: string) => void;
}

export function floorsLabelKey(template: Template): string {
  return template.floorConfig === 'single' ? 'ui.oneFloor' : 'ui.groundAttic';
}

/** "86.4 m² · 2 bedrooms · Ground + attic", translated. */
export function metaLine(template: Template, t: (key: string) => string): string {
  const beds = template.declaredBedrooms;
  const bedsWord = t(beds === 1 ? 'ui.bedroomOne' : 'ui.bedroomMany');
  return `${template.declaredAreaM2} m² · ${beds} ${bedsWord} · ${t(floorsLabelKey(template))}`;
}

export default function TemplateCard({ template, onSelect }: TemplateCardProps) {
  const { lang } = useLanguage();
  const t = useT();
  // The thumbnail is the real renderer output, just scaled down by CSS.
  const thumbnail = useMemo(
    () =>
      renderTemplate(template, {
        lang,
        scale: 30,
        showDimensions: false,
        showAreaLabels: false,
      }),
    [template, lang],
  );

  return (
    <button type="button" className="template-card" onClick={() => onSelect(template.id)}>
      <div className="thumb" aria-hidden="true" dangerouslySetInnerHTML={{ __html: thumbnail }} />
      <div className="facts">
        <strong>{t(template.nameKey)}</strong>
        <span>{metaLine(template, t)}</span>
      </div>
    </button>
  );
}
