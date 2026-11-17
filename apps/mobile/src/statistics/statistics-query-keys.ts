export const statisticsQueryKeys = {
  root: ['statistics'] as const,
  rankings: ['statistics', 'rankings'] as const,
  player: (playerId: string) => ['statistics', 'player', playerId] as const,
  summary: (playerId: string) => ['statistics', 'summary', playerId] as const,
  recentHistory: (playerId: string) =>
    ['statistics', 'recent-history', playerId] as const,
  history: (playerId: string) => ['statistics', 'history', playerId] as const,
};
