import { useLanguage, useT, type Lang } from '../../lib/i18n/index.ts';
import type {
  PlanTheme,
  TemplateCustomization,
} from '../../hooks/useTemplateCustomization.ts';
import type { Template } from '../../lib/schema/template.schema.ts';

interface CustomizationPanelProps {
  template: Template;
  customization: TemplateCustomization;
}

const LANG_LABELS: Record<Lang, string> = { sq: 'Shqip', en: 'English' };

/**
 * All cosmetic controls for the detail view. Geometry is untouchable here
 * by design (decision #11): the panel can mirror the drawing, rename room
 * labels, and recolor — nothing else.
 */
export default function CustomizationPanel({ template, customization }: CustomizationPanelProps) {
  const { lang, setLang } = useLanguage();
  const t = useT();

  return (
    <aside className="customization-panel">
      <h2>{t('ui.customize')}</h2>

      <fieldset>
        <legend>{t('ui.language')}</legend>
        <div className="toggle" role="radiogroup" aria-label={t('ui.language')}>
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
      </fieldset>

      <fieldset>
        <legend>{t('ui.mirror')}</legend>
        <div className="toggle">
          <button
            type="button"
            aria-pressed={customization.mirrored}
            className={customization.mirrored ? 'active' : ''}
            onClick={() => customization.setMirrored(!customization.mirrored)}
          >
            {t('ui.mirror')}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('ui.theme')}</legend>
        <div className="toggle" role="radiogroup" aria-label={t('ui.theme')}>
          {(['wood', 'mono'] as PlanTheme[]).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={value === customization.theme}
              className={value === customization.theme ? 'active' : ''}
              onClick={() => customization.setTheme(value)}
            >
              {t(value === 'wood' ? 'ui.themeWood' : 'ui.themeMono')}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('ui.roomNames')}</legend>
        <p className="hint">{t('ui.roomNamesHint')}</p>
        {template.floors.map((floor) => (
          <div key={floor.id} className="room-rename-group">
            {template.floors.length > 1 && <h3>{t(`floor.${floor.level}`)}</h3>}
            {floor.rooms.map((room) => (
              <label key={room.id} className="room-rename">
                <span>{t(room.labelKey)}</span>
                <input
                  type="text"
                  value={customization.roomOverrides[room.id] ?? ''}
                  placeholder={t(room.labelKey)}
                  onChange={(e) => customization.setRoomLabel(room.id, e.target.value)}
                />
              </label>
            ))}
          </div>
        ))}
      </fieldset>

      <fieldset>
        <legend>{t('ui.furniture')}</legend>
        {/* Reserved layer — render pipeline support lands in a later issue. */}
        <div className="toggle">
          <button type="button" disabled aria-disabled="true">
            {t('ui.furniture')} · {t('ui.comingSoon')}
          </button>
        </div>
      </fieldset>
    </aside>
  );
}
