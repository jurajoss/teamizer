import { useFocusEffect } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  type Dispatch,
  type SetStateAction,
} from 'react';

import { registerPrimaryNavigationVisibility } from './primary-navigation-visibility-state';

const PrimaryNavigationVisibilityContext = createContext<Dispatch<
  SetStateAction<boolean>
> | null>(null);

export const PrimaryNavigationVisibilityProvider =
  PrimaryNavigationVisibilityContext.Provider;

export function usePrimaryNavigationHiddenWhileFocused(hidden: boolean): void {
  const setPrimaryNavigationHidden = useContext(
    PrimaryNavigationVisibilityContext,
  );

  useFocusEffect(
    useCallback(
      () =>
        registerPrimaryNavigationVisibility(setPrimaryNavigationHidden, hidden),
      [hidden, setPrimaryNavigationHidden],
    ),
  );
}
