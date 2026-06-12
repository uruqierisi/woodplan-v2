import { useT } from '../../lib/i18n/index.ts';
import type {
  BedsFilter,
  Filters,
  FloorsFilter,
  SizeFilter,
} from '../../lib/filter/matcher.ts';

interface FilterPanelProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

/** label is a literal ("2"), labelKey an i18n key; exactly one is set. */
interface Option<T extends string> {
  value: T;
  label?: string;
  labelKey?: string;
}

const SIZE_OPTIONS: Option<SizeFilter>[] = [
  { value: 'any', labelKey: 'ui.any' },
  { value: 'small', labelKey: 'ui.sizeSmall' },
  { value: 'medium', labelKey: 'ui.sizeMedium' },
  { value: 'large', labelKey: 'ui.sizeLarge' },
];

const BEDS_OPTIONS: Option<BedsFilter>[] = [
  { value: 'any', labelKey: 'ui.any' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4+' },
];

const FLOORS_OPTIONS: Option<FloorsFilter>[] = [
  { value: 'any', labelKey: 'ui.any' },
  { value: '1', labelKey: 'ui.oneFloor' },
  { value: 'attic', labelKey: 'ui.groundAttic' },
];

function ToggleGroup<T extends string>(props: {
  legend: string;
  options: Option<T>[];
  value: T;
  onSelect: (value: T) => void;
}) {
  const t = useT();
  return (
    <fieldset>
      <legend>{props.legend}</legend>
      <div className="toggle filter-toggle" role="radiogroup" aria-label={props.legend}>
        {props.options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === props.value}
            className={option.value === props.value ? 'active' : ''}
            onClick={() => props.onSelect(option.value)}
          >
            {option.label ?? t(option.labelKey!)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function FilterPanel({ filters, onChange }: FilterPanelProps) {
  const t = useT();
  return (
    <aside className="filter-panel">
      <ToggleGroup
        legend={t('ui.size')}
        options={SIZE_OPTIONS}
        value={filters.size}
        onSelect={(size) => onChange({ ...filters, size })}
      />
      <ToggleGroup
        legend={t('ui.bedrooms')}
        options={BEDS_OPTIONS}
        value={filters.beds}
        onSelect={(beds) => onChange({ ...filters, beds })}
      />
      <ToggleGroup
        legend={t('ui.floors')}
        options={FLOORS_OPTIONS}
        value={filters.floors}
        onSelect={(floors) => onChange({ ...filters, floors })}
      />
    </aside>
  );
}
