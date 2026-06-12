import { useT } from '../../lib/i18n/index.ts';
import { useTemplateCustomization } from '../../hooks/useTemplateCustomization.ts';
import type { Template } from '../../lib/schema/template.schema.ts';
import { metaLine } from '../Browse/TemplateCard.tsx';
import CustomizationPanel from './CustomizationPanel.tsx';
import ExportButton from './ExportButton.tsx';
import PlanPreview from './PlanPreview.tsx';
import './detail.css';

interface DetailProps {
  template: Template;
  onBack: () => void;
}

/**
 * Template detail page (issue #6): large plan preview plus cosmetic
 * personalization. Everything in the panel is cosmetic — geometry never
 * changes (decision #11). Mount keyed by template id (see App) so
 * customization state never leaks between templates.
 */
export default function Detail({ template, onBack }: DetailProps) {
  const t = useT();
  const customization = useTemplateCustomization();

  return (
    <div className="detail">
      <header className="detail-header">
        <button type="button" className="back-button" onClick={onBack}>
          ← {t('ui.back')}
        </button>
        <div>
          <h1>{t(template.nameKey)}</h1>
          <p className="meta">{metaLine(template, t)}</p>
        </div>
        <ExportButton template={template} customization={customization} />
      </header>
      <div className="detail-body">
        <PlanPreview template={template} customization={customization} />
        <CustomizationPanel template={template} customization={customization} />
      </div>
    </div>
  );
}
