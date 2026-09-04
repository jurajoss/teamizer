export const statisticsQueryKeys = {
  root: ['statistics'] as const,
  rankings: ['statistics', 'rankings'] as const,
  player: (playerId: string) => ['statistics', 'player', playerId] as const,
  history: (playerId: string) => ['statistics', 'history', playerId] as const,
};
