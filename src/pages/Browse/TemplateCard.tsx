import { useMemo } from 'react';
import type { Template } from '../../lib/schema/template.schema.ts';
import { renderTemplate } from '../../lib/svg/renderer.ts';

interface TemplateCardProps {
  template: Template;
  onSelect: (templateId: string) => void;
}

export function floorsLabel(template: Template): string {
  return template.floorConfig === 'single' ? '1 floor' : 'Ground + attic';
}

/** "tmpl-m01" -> "M01" until real template names land with i18n (issue #6). */
function displayName(template: Template): string {
  return template.id.replace(/^tmpl-/, '').toUpperCase();
}

export default function TemplateCard({ template, onSelect }: TemplateCardProps) {
  // The thumbnail is the real renderer output, just scaled down by CSS.
  const thumbnail = useMemo(
    () =>
      renderTemplate(template, {
        scale: 30,
        showDimensions: false,
        showAreaLabels: false,
      }),
    [template],
  );

  return (
    <button type="button" className="template-card" onClick={() => onSelect(template.id)}>
      <div className="thumb" aria-hidden="true" dangerouslySetInnerHTML={{ __html: thumbnail }} />
      <div className="facts">
        <strong>{displayName(template)}</strong>
        <span>
          {template.declaredAreaM2} m² · {template.declaredBedrooms}{' '}
          {template.declaredBedrooms === 1 ? 'bedroom' : 'bedrooms'} · {floorsLabel(template)}
        </span>
      </div>
    </button>
  );
}
