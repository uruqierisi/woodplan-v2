import { useMemo } from 'react';
import { useUrlState } from '../../hooks/useUrlState.ts';
import { rankTemplates } from '../../lib/filter/matcher.ts';
import type { Template } from '../../lib/schema/template.schema.ts';
import { renderTemplate } from '../../lib/svg/renderer.ts';
import { getTemplateById, templates } from '../../lib/templates/index.ts';
import FilterPanel from './FilterPanel.tsx';
import TemplateCard, { floorsLabel } from './TemplateCard.tsx';
import TemplateGrid from './TemplateGrid.tsx';
import './browse.css';

/**
 * Placeholder for the template detail route: issue #6 replaces this with the
 * real detail page (room list, PDF export). It already honors the URL
 * contract — ?template=<id> opens it, browser back returns to the grid.
 */
function TemplateDetailPlaceholder(props: { template: Template; onBack: () => void }) {
  const svg = useMemo(() => renderTemplate(props.template), [props.template]);
  return (
    <div className="template-detail">
      <header>
        <button type="button" onClick={props.onBack}>
          ← All templates
        </button>
        <h1>
          {props.template.id} — {props.template.declaredAreaM2} m² ·{' '}
          {props.template.declaredBedrooms} bd · {floorsLabel(props.template)}
        </h1>
      </header>
      <div className="plan" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

export default function Browse() {
  const [state, setState] = useUrlState();
  const result = useMemo(() => rankTemplates(templates, state.filters), [state.filters]);

  const selected = state.templateId !== null ? getTemplateById(state.templateId) : undefined;
  if (selected) {
    return (
      <TemplateDetailPlaceholder
        template={selected}
        onBack={() => setState({ ...state, templateId: null })}
      />
    );
  }

  return (
    <div className="browse">
      <FilterPanel filters={state.filters} onChange={(filters) => setState({ filters, templateId: null })} />
      <main>
        {result.relaxed.length > 0 && (
          <p className="relaxed-note">Showing closest matches — no template fits every filter.</p>
        )}
        <TemplateGrid
          templates={result.templates}
          onSelect={(templateId) => setState({ ...state, templateId })}
        />
      </main>
    </div>
  );
}
