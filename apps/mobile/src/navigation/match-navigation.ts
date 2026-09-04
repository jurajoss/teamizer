export interface MatchNavigation {
  back(): void;
  canGoBack(): boolean;
  replace(path: '/home'): void;
}

export function leaveMatch(navigation: MatchNavigation): void {
  if (navigation.canGoBack()) {
    navigation.back();
    return;
  }

  navigation.replace('/home');
}

export function matchViewportKey(
  matchStatus: string,
  scoringStatus: string | null = null,
): string {
  return `${matchStatus}:${scoringStatus ?? 'AUTHORITATIVE'}`;
}
