import type { TFunction } from 'i18next';

import { ApiClientError } from '../api/authenticated-api-client';
import { localizedErrorMessage } from '../i18n/localized-error';

export type OpenMatchFeedback = {
  tone: 'error' | 'success' | 'info' | 'warning';
  title?: string | undefined;
  text: string;
};

export type SetOpenMatchFeedback = (feedback: OpenMatchFeedback | null) => void;

export function openMatchErrorFeedback(
  error: unknown,
  fallback: string,
  t: TFunction,
): OpenMatchFeedback {
  if (error instanceof ApiClientError) {
    return {
      tone: 'error',
      title: undefined,
      text: localizedErrorMessage(error, t) || fallback,
    };
  }

  return { tone: 'error', text: fallback };
}
