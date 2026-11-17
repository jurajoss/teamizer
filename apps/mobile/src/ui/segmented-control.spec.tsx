import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  pressable: 'Pressable',
  view: 'View',
}));

vi.mock('react-native', () => ({
  Pressable: native.pressable,
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: native.view,
}));
vi.mock('@teamizer/ui', () => ({
  AppText: 'AppText',
  borderWidths: { subtle: 1 },
  radii: { md: 14, sm: 10 },
  sizes: { minimumTouchTarget: 48 },
  spacing: { xxs: 4 },
  useTheme: () => ({
    colors: {
      accent: 'accent',
      accentContrast: 'accentContrast',
      border: 'border',
      surface: 'surface',
      surfaceSubtle: 'surfaceSubtle',
      textPrimary: 'textPrimary',
    },
  }),
}));

import { SegmentedControl } from './segmented-control';

type TestElement = ReactElement<{
  [key: string]: unknown;
  children?: ReactNode;
}>;

describe('shared segmented control', () => {
  it('renders three accessible equal segments and announces selection', () => {
    const control = renderControl('system');
    const segments = descendants(control).filter(
      ({ type }) => type === native.pressable,
    );

    expect(control.props).toMatchObject({
      accessibilityLabel: 'Theme',
      accessibilityRole: 'tablist',
    });
    expect(segments.map(({ props }) => props.accessibilityState)).toEqual([
      { selected: true },
      { selected: false },
      { selected: false },
    ]);
    segments.forEach((segment) => {
      expect(resolveStyle(segment)).toContainEqual(
        expect.objectContaining({ flex: 1, minHeight: 48 }),
      );
    });
  });

  it('uses mint selection, dark selected text, and compact label fitting', () => {
    const control = renderControl('light');
    const segments = descendants(control).filter(
      ({ type }) => type === native.pressable,
    );
    const labels = descendants(control).filter(
      ({ type }) => type === 'AppText',
    );
    const selectedSegment = segments[1];
    if (!selectedSegment) throw new Error('Expected the selected segment.');

    expect(resolveStyle(selectedSegment)).toContainEqual({
      backgroundColor: 'accent',
    });
    expect(labels[1]?.props).toMatchObject({
      adjustsFontSizeToFit: true,
      minimumFontScale: 0.75,
      numberOfLines: 1,
      variant: 'label',
    });
    expect(labels[1]?.props.style).toEqual({ color: 'accentContrast' });
    expect(labels[0]?.props.style).toEqual({ color: 'textPrimary' });
  });

  it('supports two segments and sends the selected value once', () => {
    const onChange = vi.fn();
    const control = SegmentedControl({
      accessibilityLabel: 'Language',
      items: [
        { label: 'Čeština', value: 'cs' },
        { label: 'English', value: 'en' },
      ],
      onChange,
      value: 'cs',
    }) as TestElement;
    const segments = descendants(control).filter(
      ({ type }) => type === native.pressable,
    );

    invoke(segments[1]?.props.onPress);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('en');
  });

  it('can preserve the native label size without changing control geometry', () => {
    const control = SegmentedControl({
      accessibilityLabel: 'Ranking criterion',
      items: [
        { label: 'Win rate', value: 'winRate' },
        { label: 'Goals / match', value: 'goalsPerMatch' },
        { label: 'Participation', value: 'participation' },
      ],
      onChange: vi.fn(),
      shrinkLabelsToFit: false,
      value: 'winRate',
    }) as TestElement;
    const labels = descendants(control).filter(
      ({ type }) => type === 'AppText',
    );
    const segments = descendants(control).filter(
      ({ type }) => type === native.pressable,
    );

    labels.forEach(({ props }) => {
      expect(props).toMatchObject({ numberOfLines: 1, variant: 'label' });
      expect(props).not.toHaveProperty('adjustsFontSizeToFit');
      expect(props).not.toHaveProperty('minimumFontScale');
    });
    segments.forEach((segment) => {
      expect(resolveStyle(segment)).toContainEqual(
        expect.objectContaining({ minHeight: 48, paddingHorizontal: 4 }),
      );
    });
  });
});

function renderControl(value: 'system' | 'light' | 'dark') {
  return SegmentedControl({
    accessibilityLabel: 'Theme',
    items: [
      { label: 'System', value: 'system' },
      { label: 'Light', value: 'light' },
      { label: 'Dark', value: 'dark' },
    ],
    onChange: vi.fn(),
    value,
  }) as TestElement;
}

function descendants(node: ReactNode): TestElement[] {
  if (!isValidElement(node)) return [];
  const element = node as TestElement;
  return [
    element,
    ...Children.toArray(element.props.children).flatMap(descendants),
  ];
}

function resolveStyle(element: TestElement) {
  const style = element.props.style;
  const resolved =
    typeof style === 'function' ? style({ pressed: false }) : style;
  return Array.isArray(resolved) ? resolved : [resolved];
}

function invoke(handler: unknown) {
  if (typeof handler === 'function') handler();
}
