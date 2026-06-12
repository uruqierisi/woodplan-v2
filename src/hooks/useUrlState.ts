import { useCallback, useEffect, useState } from 'react';
import {
  NO_FILTERS,
  type BedsFilter,
  type Filters,
  type FloorsFilter,
  type SizeFilter,
} from '../lib/filter/matcher.ts';

/**
 * Browse state <-> URL query string (issue #5).
 *
 * The URL is the only persistence mechanism (no backend): a shared link must
 * restore the exact view. Filters live in ?size=&beds=&floors= and the
 * selected template in ?template=, e.g. ?size=medium&beds=2&template=tmpl-m01.
 * 'any' filters are omitted so the bare path means "everything".
 */

export interface BrowseState {
  filters: Filters;
  /** Selected template id (?template=tmpl-m01); null while browsing the grid. */
  templateId: string | null;
}

const SIZES: SizeFilter[] = ['small', 'medium', 'large'];
const BEDS: BedsFilter[] = ['1', '2', '3', '4'];
const FLOORS: FloorsFilter[] = ['1', 'attic'];

function pick<T extends string>(value: string | null, allowed: T[]): T | 'any' {
  return value !== null && (allowed as string[]).includes(value) ? (value as T) : 'any';
}

/** Unknown or malformed params degrade to 'any' / no selection, never throw. */
export function parseUrlState(search: string): BrowseState {
  const params = new URLSearchParams(search);
  return {
    filters: {
      size: pick(params.get('size'), SIZES),
      beds: pick(params.get('beds'), BEDS),
      floors: pick(params.get('floors'), FLOORS),
    },
    templateId: params.get('template'),
  };
}

export function serializeUrlState(state: BrowseState): string {
  const params = new URLSearchParams();
  for (const dim of ['size', 'beds', 'floors'] as const) {
    if (state.filters[dim] !== 'any') params.set(dim, state.filters[dim]);
  }
  if (state.templateId !== null) params.set('template', state.templateId);
  return params.toString();
}

/**
 * useState whose value round-trips through the URL. Selecting or closing a
 * template pushes a history entry (back button returns to the grid); filter
 * changes replace the current entry so each click doesn't pollute history.
 */
export function useUrlState(): [BrowseState, (next: BrowseState) => void] {
  const [state, setState] = useState<BrowseState>(() =>
    typeof window === 'undefined'
      ? { filters: NO_FILTERS, templateId: null }
      : parseUrlState(window.location.search),
  );

  useEffect(() => {
    const onPopState = () => setState(parseUrlState(window.location.search));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const update = useCallback((next: BrowseState) => {
    const selectionChanged =
      next.templateId !== parseUrlState(window.location.search).templateId;
    setState(next);
    const query = serializeUrlState(next);
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history[selectionChanged ? 'pushState' : 'replaceState'](null, '', url);
  }, []);

  return [state, update];
}
