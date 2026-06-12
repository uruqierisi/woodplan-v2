import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';
import en from './en.json';
import sq from './sq.json';

/**
 * Translation system (issue #6). Albanian is the primary market and the
 * default; the dictionaries cover UI strings AND the i18n keys stored in
 * template JSON (room.* labelKeys, template.*.name nameKeys, floor.*).
 *
 * `translate` is a pure function so non-React consumers (the SVG renderer,
 * later the PDF exporter in #7) share the exact same dictionaries as the UI.
 * The React layer on top is just a context carrying the current language.
 */

export type Lang = 'sq' | 'en';
export const DEFAULT_LANG: Lang = 'sq';
export const LANGS: Lang[] = ['sq', 'en'];

const DICTIONARIES: Record<Lang, Record<string, string>> = { sq, en };

export function translate(lang: Lang, key: string): string {
  const hit = DICTIONARIES[lang][key];
  if (hit !== undefined) return hit;
  // Unknown key: humanize the last segment so authoring drafts with new
  // keys still get a readable label instead of a raw key.
  const tail = key.split('.').pop() ?? key;
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: DEFAULT_LANG,
  setLang: () => {},
});

/** Language lives in the URL (?lang=); the owner of that state feeds it in here. */
export function LanguageProvider(props: {
  lang: Lang;
  setLang: (lang: Lang) => void;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ lang: props.lang, setLang: props.setLang }),
    [props.lang, props.setLang],
  );
  return createElement(LanguageContext.Provider, { value }, props.children);
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

/** `const t = useT()` — translate in the context language. */
export function useT(): (key: string) => string {
  const { lang } = useLanguage();
  return (key: string) => translate(lang, key);
}
