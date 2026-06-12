import { LanguageProvider, useLanguage, useT, type Lang } from './lib/i18n/index.ts';
import { useUrlState } from './hooks/useUrlState.ts';
import { getTemplateById } from './lib/templates/index.ts';
import Browse from './pages/Browse/index.tsx';
import Detail from './pages/Detail/index.tsx';
import './styles.css';

const LANG_LABELS: Record<Lang, string> = { sq: 'Shqip', en: 'English' };

/** Global header: present on every page so the language toggle persists. */
function AppHeader() {
  const { lang, setLang } = useLanguage();
  const t = useT();
  return (
    <header className="app-header">
      <span className="brand">WoodPlan</span>
      <div className="toggle lang-toggle" role="radiogroup" aria-label={t('ui.language')}>
        {(['sq', 'en'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={value === lang}
            className={value === lang ? 'active' : ''}
            onClick={() => setLang(value)}
          >
            {LANG_LABELS[value]}
          </button>
        ))}
      </div>
    </header>
  );
}

export default function App() {
  const [state, setState] = useUrlState();
  const selected = state.templateId !== null ? getTemplateById(state.templateId) : undefined;

  return (
    <LanguageProvider lang={state.lang} setLang={(lang) => setState({ ...state, lang })}>
      <AppHeader />
      {selected ? (
        // Keyed by template so customization state resets per template.
        <Detail
          key={selected.id}
          template={selected}
          onBack={() => setState({ ...state, templateId: null })}
        />
      ) : (
        <Browse state={state} onChange={setState} />
      )}
    </LanguageProvider>
  );
}
