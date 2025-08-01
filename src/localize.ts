import { HomeAssistant } from './types';

import de from './translation/de.json';
import en from './translation/en.json';

const translations = {
  de,
  en,
};

interface TranslationObject {
  [key: string]: string | TranslationObject;
}

const typedTranslations: { [key: string]: TranslationObject } = translations;

function _getTranslation(language: string, keys: string[]): string | undefined {
  let translation: string | TranslationObject | undefined = typedTranslations[language];
  for (const key of keys) {
    if (typeof translation !== 'object' || translation === null) {
      return undefined;
    }
    translation = translation[key];
  }
  return typeof translation === 'string' ? translation : undefined;
}

export function localize(hass: HomeAssistant, key: string, placeholders: Record<string, string | number> = {}): string {
  const lang = hass.language || 'en';
  const translationKey = key.replace('component.bge.', '');
  const keyParts = translationKey.split('.');

  const translation = _getTranslation(lang, keyParts) ?? _getTranslation('en', keyParts);

  if (typeof translation === 'string') {
    let finalString = translation;
    for (const placeholder in placeholders) {
      finalString = finalString.replace(`{${placeholder}}`, String(placeholders[placeholder]));
    }
    return finalString;
  }

  return key;
}
