import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

export const teamizerIconNames = [
  'home',
  'matches',
  'players',
  'rankings',
  'back',
  'account',
  'settings',
  'administration',
  'logout',
  'add',
  'remove',
  'complete',
  'next',
  'location',
  'edit',
  'decline',
  'trophy',
  'football',
  'history',
  'regenerate',
  'play',
  'drag',
  'swap',
] as const;

export type TeamizerIconName = (typeof teamizerIconNames)[number];

type TeamizerPlatformSymbol = {
  ios: SFSymbol;
  android: AndroidSymbol;
  web: AndroidSymbol;
};

export const teamizerIconSymbols: Record<
  TeamizerIconName,
  TeamizerPlatformSymbol
> = {
  home: { ios: 'house.fill', android: 'home', web: 'home' },
  matches: {
    ios: 'calendar',
    android: 'calendar_month',
    web: 'calendar_month',
  },
  players: { ios: 'person.3.fill', android: 'groups', web: 'groups' },
  rankings: {
    ios: 'chart.bar.fill',
    android: 'leaderboard',
    web: 'leaderboard',
  },
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  account: {
    ios: 'person.crop.circle',
    android: 'account_circle',
    web: 'account_circle',
  },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  administration: {
    ios: 'shield.lefthalf.filled',
    android: 'admin_panel_settings',
    web: 'admin_panel_settings',
  },
  logout: {
    ios: 'rectangle.portrait.and.arrow.right',
    android: 'logout',
    web: 'logout',
  },
  add: { ios: 'plus', android: 'add', web: 'add' },
  remove: { ios: 'minus', android: 'remove', web: 'remove' },
  complete: { ios: 'checkmark', android: 'check', web: 'check' },
  next: {
    ios: 'chevron.right',
    android: 'chevron_right',
    web: 'chevron_right',
  },
  location: {
    ios: 'mappin.and.ellipse',
    android: 'location_on',
    web: 'location_on',
  },
  edit: { ios: 'pencil', android: 'edit', web: 'edit' },
  decline: { ios: 'xmark', android: 'close', web: 'close' },
  trophy: {
    ios: 'trophy.fill',
    android: 'emoji_events',
    web: 'emoji_events',
  },
  football: {
    ios: 'soccerball',
    android: 'sports_soccer',
    web: 'sports_soccer',
  },
  history: {
    ios: 'clock.arrow.circlepath',
    android: 'history',
    web: 'history',
  },
  regenerate: {
    ios: 'arrow.clockwise',
    android: 'refresh',
    web: 'refresh',
  },
  play: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  drag: {
    ios: 'line.3.horizontal',
    android: 'drag_handle',
    web: 'drag_handle',
  },
  swap: {
    ios: 'arrow.left.arrow.right',
    android: 'swap_horiz',
    web: 'swap_horiz',
  },
};
