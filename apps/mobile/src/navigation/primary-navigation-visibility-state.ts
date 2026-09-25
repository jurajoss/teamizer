export type PrimaryNavigationVisibilitySetter = (hidden: boolean) => void;

export function registerPrimaryNavigationVisibility(
  setPrimaryNavigationHidden: PrimaryNavigationVisibilitySetter | null,
  hidden: boolean,
): () => void {
  setPrimaryNavigationHidden?.(hidden);

  return () => setPrimaryNavigationHidden?.(false);
}
