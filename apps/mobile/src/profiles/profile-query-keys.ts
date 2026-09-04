export const profileQueryKeys = {
  root: ['profiles'] as const,
  current: (playerId: string) => ['profiles', 'current', playerId] as const,
  adminList: (status: string, query: string) =>
    ['profiles', 'admin-list', status, query] as const,
  adminDetail: (playerId: string) =>
    ['profiles', 'admin-detail', playerId] as const,
};
