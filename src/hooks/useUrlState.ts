import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_LANG, type Lang } from '../lib/i18n/index.ts';
import {
  NO_FILTERS,
  type BedsFilter,
  type Filters,
  type FloorsFilter,
  type SizeFilter,
} from '../lib/filter/matcher.ts';

/**
 * Browse state <-> URL query string (issues #5, #6).
 *
 * The URL is the only persistence mechanism (no backend): a shared link must
 * restore the exact view. Filters live in ?size=&beds=&floors=, the selected
 * template in ?template=, the language in ?lang= (default sq, omitted).
 * Defaults are omitted so the bare path means "everything, in Albanian".
 *
 * Cosmetic customization params (?mirrored=, ?theme=) are owned by
 * useTemplateCustomization; this hook leaves them alone except when the
 * selected template changes, which resets them.
 */

export interface BrowseState {
  filters: Filters;
  /** Selected template id (?template=tmpl-m01); null while browsing the grid. */
  templateId: string | null;
  lang: Lang;
}

const SIZES: SizeFilter[] = ['small', 'medium', 'large'];
const BEDS: BedsFilter[] = ['1', '2', '3', '4'];
const FLOORS: FloorsFilter[] = ['1', 'attic'];

function pick<T extends string>(value: string | null, allowed: T[]): T | 'any' {
  return value !== null && (allowed as string[]).includes(value) ? (value as T) : 'any';
}

/** Unknown or malformed params degrade to defaults, never throw. */
export function parseUrlState(search: string): BrowseState {
  const params = new URLSearchParams(search);
  return {
    filters: {
      size: pick(params.get('size'), SIZES),
      beds: pick(params.get('beds'), BEDS),
      floors: pick(params.get('floors'), FLOORS),
    },
    templateId: params.get('template'),
    lang: params.get('lang') === 'en' ? 'en' : DEFAULT_LANG,
  };
}

/**
 * Set (string value) or delete (null) the given query params, PRESERVING all
 * params not mentioned — several hooks share the one query string.
 */
export function writeQueryParams(
  updates: Record<string, string | null>,
  mode: 'push' | 'replace',
): void {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
  window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', url);
}

/**
 * useState whose value round-trips through the URL. Selecting or closing a
 * template pushes a history entry (back button returns to the grid); filter
 * and language changes replace the current entry so each click doesn't
 * pollute history.
 */
export function useUrlState(): [BrowseState, (next: BrowseState) => void] {
  const [state, setState] = useState<BrowseState>(() =>
    typeof window === 'undefined'
      ? { filters: NO_FILTERS, templateId: null, lang: DEFAULT_LANG }
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
    writeQueryParams(
      {
        size: next.filters.size === 'any' ? null : next.filters.size,
        beds: next.filters.beds === 'any' ? null : next.filters.beds,
        floors: next.filters.floors === 'any' ? null : next.filters.floors,
        template: next.templateId,
        lang: next.lang === DEFAULT_LANG ? null : next.lang,
        // Opening or leaving a template resets its cosmetic customization;
        // ?mirrored / ?theme describe one template's detail view.
        ...(selectionChanged ? { mirrored: null, theme: null } : {}),
      },
      selectionChanged ? 'push' : 'replace',
    );
  }, []);

  return [state, update];
}
