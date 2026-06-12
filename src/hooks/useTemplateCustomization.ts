import { useCallback, useEffect, useState } from 'react';
import { writeQueryParams } from './useUrlState.ts';

/**
 * Cosmetic template customization (issue #6). HARD LINE per decision #11:
 * nothing here ever touches template geometry — mirror is a render-time
 * reflection, renames are display-label overrides, theme is palette only.
 *
 * Mirror and theme sync to the URL (?mirrored=1, ?theme=mono) so they
 * survive sharing. Room renames are deliberately NOT in the URL — a rename
 * per room is too verbose for a query string — so they live in component
 * state only and are lost on share/reload. NOTE for issue #7 (PDF export):
 * read roomOverrides from this live session state, not from the URL.
 */

export type PlanTheme = 'wood' | 'mono';

export interface CustomizationUrlState {
  mirrored: boolean;
  theme: PlanTheme;
}

/** Malformed values degrade to the defaults (unmirrored wood), never throw. */
export function parseCustomization(search: string): CustomizationUrlState {
  const params = new URLSearchParams(search);
  return {
    mirrored: params.get('mirrored') === '1',
    theme: params.get('theme') === 'mono' ? 'mono' : 'wood',
  };
}

/**
 * Returns a new override map with the label set for the room; an empty label
 * removes the override (the input falls back to the translated default).
 * Never mutates the map it was given.
 */
export function withRoomLabel(
  overrides: Record<string, string>,
  roomId: string,
  label: string,
): Record<string, string> {
  const next = { ...overrides };
  if (label === '') delete next[roomId];
  else next[roomId] = label;
  return next;
}

export interface TemplateCustomization {
  mirrored: boolean;
  theme: PlanTheme;
  /** Room id -> display label. Session-only; see the module note for #7. */
  roomOverrides: Record<string, string>;
  setMirrored: (mirrored: boolean) => void;
  setTheme: (theme: PlanTheme) => void;
  setRoomLabel: (roomId: string, label: string) => void;
}

export function useTemplateCustomization(): TemplateCustomization {
  const [urlState, setUrlState] = useState<CustomizationUrlState>(() =>
    parseCustomization(window.location.search),
  );
  const [roomOverrides, setRoomOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    const onPopState = () => setUrlState(parseCustomization(window.location.search));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const setMirrored = useCallback((mirrored: boolean) => {
    setUrlState((s) => ({ ...s, mirrored }));
    writeQueryParams({ mirrored: mirrored ? '1' : null }, 'replace');
  }, []);

  const setTheme = useCallback((theme: PlanTheme) => {
    setUrlState((s) => ({ ...s, theme }));
    writeQueryParams({ theme: theme === 'wood' ? null : theme }, 'replace');
  }, []);

  const setRoomLabel = useCallback((roomId: string, label: string) => {
    setRoomOverrides((overrides) => withRoomLabel(overrides, roomId, label));
  }, []);

  return {
    mirrored: urlState.mirrored,
    theme: urlState.theme,
    roomOverrides,
    setMirrored,
    setTheme,
    setRoomLabel,
  };
}
