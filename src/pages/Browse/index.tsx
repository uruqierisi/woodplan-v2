import { useMemo } from 'react';
import type { BrowseState } from '../../hooks/useUrlState.ts';
import { useT } from '../../lib/i18n/index.ts';
import { rankTemplates } from '../../lib/filter/matcher.ts';
import { templates } from '../../lib/templates/index.ts';
import FilterPanel from './FilterPanel.tsx';
import TemplateGrid from './TemplateGrid.tsx';
import './browse.css';

interface BrowseProps {
  state: BrowseState;
  onChange: (next: BrowseState) => void;
}

export default function Browse({ state, onChange }: BrowseProps) {
  const t = useT();
  const result = useMemo(() => rankTemplates(templates, state.filters), [state.filters]);

  return (
    <div className="browse">
      <FilterPanel
        filters={state.filters}
        onChange={(filters) => onChange({ ...state, filters, templateId: null })}
      />
      <main>
        {result.relaxed.length > 0 && (
          <p className="relaxed-note">{t('ui.closestMatches')}</p>
        )}
        <TemplateGrid
          templates={result.templates}
          onSelect={(templateId) => onChange({ ...state, templateId })}
        />
      </main>
    </div>
  );
}
