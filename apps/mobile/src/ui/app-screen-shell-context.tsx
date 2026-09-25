import { createContext, useContext, type ReactNode } from 'react';

import type { AppScreenShellSafeAreaOwnership } from './app-screen-safe-area';

const defaultOwnership: AppScreenShellSafeAreaOwnership = {
  bottom: false,
  left: false,
};

const ShellSafeAreaOwnershipContext = createContext(defaultOwnership);

export function AppScreenShellProvider({
  children,
  ownership,
}: {
  children: ReactNode;
  ownership: AppScreenShellSafeAreaOwnership;
}) {
  return (
    <ShellSafeAreaOwnershipContext.Provider value={ownership}>
      {children}
    </ShellSafeAreaOwnershipContext.Provider>
  );
}

export function useShellSafeAreaOwnership(): AppScreenShellSafeAreaOwnership {
  return useContext(ShellSafeAreaOwnershipContext);
}
