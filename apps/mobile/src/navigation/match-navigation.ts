export function matchViewportKey(
  matchStatus: string,
  scoringStatus: string | null = null,
): string {
  return `${matchStatus}:${scoringStatus ?? 'AUTHORITATIVE'}`;
}
