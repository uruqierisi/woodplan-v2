import { useMemo } from 'react';
import { useLanguage } from '../../lib/i18n/index.ts';
import type { TemplateCustomization } from '../../hooks/useTemplateCustomization.ts';
import type { Template } from '../../lib/schema/template.schema.ts';
import { renderTemplate } from '../../lib/svg/renderer.ts';

interface PlanPreviewProps {
  template: Template;
  customization: TemplateCustomization;
}

/** The big drawing: renderTemplate with the current customization applied. */
export default function PlanPreview({ template, customization }: PlanPreviewProps) {
  const { lang } = useLanguage();
  const svg = useMemo(
    () =>
      renderTemplate(template, {
        lang,
        theme: customization.theme,
        mirrored: customization.mirrored,
        labelOverrides: customization.roomOverrides,
      }),
    [template, lang, customization.theme, customization.mirrored, customization.roomOverrides],
  );
  return <div className="plan-preview" dangerouslySetInnerHTML={{ __html: svg }} />;
}
