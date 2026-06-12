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

interface Option<T extends string> {
  value: T;
  label: string;
}

const SIZE_OPTIONS: Option<SizeFilter>[] = [
  { value: 'any', label: 'Any' },
  { value: 'small', label: 'Small · 40–60 m²' },
  { value: 'medium', label: 'Medium · 60–90 m²' },
  { value: 'large', label: 'Large · 90–120 m²' },
];

const BEDS_OPTIONS: Option<BedsFilter>[] = [
  { value: 'any', label: 'Any' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4+' },
];

const FLOORS_OPTIONS: Option<FloorsFilter>[] = [
  { value: 'any', label: 'Any' },
  { value: '1', label: '1 floor' },
  { value: 'attic', label: 'Ground + attic' },
];

function ToggleGroup<T extends string>(props: {
  legend: string;
  options: Option<T>[];
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend>{props.legend}</legend>
      <div className="toggle" role="radiogroup" aria-label={props.legend}>
        {props.options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === props.value}
            className={option.value === props.value ? 'active' : ''}
            onClick={() => props.onSelect(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function FilterPanel({ filters, onChange }: FilterPanelProps) {
  return (
    <aside className="filter-panel">
      <h1>WoodPlan</h1>
      <ToggleGroup
        legend="Size"
        options={SIZE_OPTIONS}
        value={filters.size}
        onSelect={(size) => onChange({ ...filters, size })}
      />
      <ToggleGroup
        legend="Bedrooms"
        options={BEDS_OPTIONS}
        value={filters.beds}
        onSelect={(beds) => onChange({ ...filters, beds })}
      />
      <ToggleGroup
        legend="Floors"
        options={FLOORS_OPTIONS}
        value={filters.floors}
        onSelect={(floors) => onChange({ ...filters, floors })}
      />
    </aside>
  );
}
