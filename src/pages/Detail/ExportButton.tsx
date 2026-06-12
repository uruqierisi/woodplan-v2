import { useState } from 'react';
import { useLanguage, useT } from '../../lib/i18n/index.ts';
import type { TemplateCustomization } from '../../hooks/useTemplateCustomization.ts';
import type { Template } from '../../lib/schema/template.schema.ts';
import { generatePdf } from '../../lib/pdf/exporter.ts';

interface ExportButtonProps {
  template: Template;
  customization: TemplateCustomization;
}

/**
 * "Export PDF": generates the vector PDF client-side and downloads it as
 * woodplan-{templateId}.pdf. Passes the LIVE customization (including the
 * session-only room renames that are not in the URL) so the PDF matches the
 * screen exactly.
 */
export default function ExportButton({ template, customization }: ExportButtonProps) {
  const { lang } = useLanguage();
  const t = useT();
  const [exporting, setExporting] = useState(false);

  const onExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await generatePdf(template, customization, lang);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `woodplan-${template.id}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      type="button"
      className="export-button"
      onClick={onExport}
      disabled={exporting}
      aria-busy={exporting}
    >
      {t(exporting ? 'ui.exporting' : 'ui.exportPdf')}
    </button>
  );
}
