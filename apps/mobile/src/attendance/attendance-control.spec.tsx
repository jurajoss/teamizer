import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  activityIndicator: 'ActivityIndicator',
  pressable: 'Pressable',
  view: 'View',
}));

vi.mock('react-native', () => ({
  ActivityIndicator: native.activityIndicator,
  Pressable: native.pressable,
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: native.view,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@teamizer/ui', () => ({
  AppText: 'AppText',
  borderWidths: { subtle: 1 },
  radii: { md: 14, sm: 10 },
  sizes: {
    compactControl: 36,
    controlHeight: 52,
    icon: { small: 16 },
    minimumTouchTarget: 48,
  },
  spacing: { md: 16, sm: 12, xs: 8, xxs: 4 },
  useTheme: () => ({
    colors: {
      accent: 'accent',
      accentSoft: 'accentSoft',
      background: 'background',
      border: 'border',
      danger: 'danger',
      success: 'success',
      textDisabled: 'textDisabled',
    },
  }),
}));
vi.mock('../ui/icons/app-icon', () => ({ AppIcon: 'AppIcon' }));

import {
  applyPersonalAttendanceSelection,
  AttendanceChoiceButtons,
  AttendanceStatusRow,
  PersonalAttendanceContent,
} from './attendance-control';

type TestElement = ReactElement<{
  [key: string]: unknown;
  children?: ReactNode;
}>;

describe('shared attendance controls', () => {
  it('renders unanswered as equal Going and Not-going outline actions', () => {
    const onChange = vi.fn();
    const choices = AttendanceChoiceButtons({
      attendance: null,
      onChange,
    }) as TestElement;
    const options = directChildren(choices);

    expect(options.map(({ props }) => props.attendance)).toEqual([
      'GOING',
      'NOT_GOING',
    ]);
    expect(options.map(({ props }) => props.selected)).toEqual([false, false]);

    const going = renderFunctionElement(options[0]);
    const notGoing = renderFunctionElement(options[1]);
    expect(resolveStyle(going)).toContainEqual({
      backgroundColor: 'transparent',
      borderColor: 'success',
    });
    expect(resolveStyle(going)).toContainEqual({ opacity: 1 });
    expect(resolveStyle(notGoing)).toContainEqual({
      backgroundColor: 'transparent',
      borderColor: 'danger',
    });
    expect(resolveStyle(notGoing)).toContainEqual({ opacity: 1 });
    expect(
      descendants(going).some(
        ({ type, props }) =>
          type === 'AppText' && props.children === 'attendance.going',
      ),
    ).toBe(true);
    expect(
      descendants(notGoing).some(
        ({ type, props }) =>
          type === 'AppText' && props.children === 'attendance.notGoing',
      ),
    ).toBe(true);

    invoke(options[0]?.props.onPress);
    invoke(options[1]?.props.onPress);
    expect(onChange).toHaveBeenNthCalledWith(1, 'GOING');
    expect(onChange).toHaveBeenNthCalledWith(2, 'NOT_GOING');
  });

  it.each([
    ['GOING', 'success', [true, false]],
    ['NOT_GOING', 'danger', [false, true]],
  ] as const)(
    'uses semantic fill only for the selected %s state',
    (attendance, selectedColor, selectedStates) => {
      const choices = AttendanceChoiceButtons({
        attendance,
        onChange: vi.fn(),
      }) as TestElement;
      const options = directChildren(choices);
      const selected = renderFunctionElement(
        options.find(({ props }) => props.selected === true),
      );

      expect(options.map(({ props }) => props.selected)).toEqual(
        selectedStates,
      );
      expect(resolveStyle(selected)).toContainEqual({
        backgroundColor: selectedColor,
        borderColor: selectedColor,
      });
      expect(resolveStyle(selected)).toContainEqual({ opacity: 1 });
    },
  );

  it('renders answered compact ADMIN actions as equal icon-only targets', () => {
    const choices = AttendanceChoiceButtons({
      attendance: 'GOING',
      compact: true,
      onChange: vi.fn(),
    }) as TestElement;
    const options = directChildren(choices);
    const going = renderFunctionElement(options[0]);
    const notGoing = renderFunctionElement(options[1]);
    const goingSurface = compactSurface(going);
    const notGoingSurface = compactSurface(notGoing);

    expect(resolveStyle(goingSurface)).toContainEqual({
      backgroundColor: 'success',
      borderColor: 'success',
    });
    expect(resolveStyle(notGoingSurface)).toContainEqual({
      backgroundColor: 'transparent',
      borderColor: 'danger',
    });
    expect(
      [...descendants(going), ...descendants(notGoing)].some(
        ({ type }) => type === 'AppText',
      ),
    ).toBe(false);
    expect(
      descendants(going).find(({ type }) => type === 'AppIcon')?.props,
    ).toMatchObject({ color: 'background', name: 'complete' });
    expect(
      descendants(notGoing).find(({ type }) => type === 'AppIcon')?.props,
    ).toMatchObject({ color: 'danger', name: 'decline' });
    expect(resolveStyle(going)).toContainEqual({
      alignItems: 'center',
      flex: 0,
      height: 48,
      justifyContent: 'center',
      width: 48,
    });
    expect(resolveStyle(notGoing)).toContainEqual({
      alignItems: 'center',
      flex: 0,
      height: 48,
      justifyContent: 'center',
      width: 48,
    });
    expect(resolveStyle(goingSurface)).toContainEqual(
      expect.objectContaining({ height: 40, width: 40 }),
    );
    expect(resolveStyle(notGoingSurface)).toContainEqual(
      expect.objectContaining({ height: 40, width: 40 }),
    );
  });

  it('keeps both semantic outlines prominent for unanswered compact controls', () => {
    const choices = AttendanceChoiceButtons({
      attendance: null,
      compact: true,
      onChange: vi.fn(),
    }) as TestElement;
    const options = directChildren(choices);

    expect(
      resolveStyle(compactSurface(renderFunctionElement(options[0]))),
    ).toContainEqual({
      backgroundColor: 'transparent',
      borderColor: 'success',
    });
    expect(
      resolveStyle(compactSurface(renderFunctionElement(options[1]))),
    ).toContainEqual({
      backgroundColor: 'transparent',
      borderColor: 'danger',
    });
  });

  it.each([
    ['GOING', 'attendance.going', 'complete', 'success'],
    ['NOT_GOING', 'attendance.notGoing', 'decline', 'danger'],
  ] as const)(
    'renders answered %s as a compact status with an explicit Edit action',
    (attendance, label, icon, color) => {
      const onEdit = vi.fn();
      const row = AttendanceStatusRow({
        attendance,
        onEdit,
      }) as TestElement;
      const elements = descendants(row);
      const edit = elements.find(({ type }) => type === native.pressable);

      expect(row.type).toBe(native.view);
      expect(resolveStyle(row)).toContainEqual(
        expect.objectContaining({
          borderRadius: 14,
          borderWidth: 1,
          minHeight: 52,
          paddingLeft: 12,
          paddingRight: 4,
          width: '100%',
        }),
      );
      expect(resolveStyle(row)).toContainEqual({ borderColor: 'border' });
      expect(
        elements.some(
          ({ type, props }) => type === 'AppText' && props.children === label,
        ),
      ).toBe(true);
      expect(
        elements.some(
          ({ type, props }) =>
            type === 'AppIcon' && props.name === icon && props.color === color,
        ),
      ).toBe(true);
      expect(
        elements.some(
          ({ type, props }) => type === 'AppIcon' && props.name === 'edit',
        ),
      ).toBe(true);
      expect(
        elements.some(
          ({ type, props }) => type === 'AppIcon' && props.name === 'next',
        ),
      ).toBe(false);
      expect(edit?.props.accessibilityLabel).toBe('attendance.edit');
      invoke(edit?.props.onPress);
      expect(onEdit).toHaveBeenCalledOnce();
    },
  );

  it('switches an answered state inline to the shared two-choice editor', () => {
    const editor = PersonalAttendanceContent({
      attendance: 'GOING',
      disabled: false,
      editing: true,
      onChange: vi.fn(),
      onEdit: vi.fn(),
    }) as TestElement;

    expect(editor.type).toBe(AttendanceChoiceButtons);
    expect(editor.props.attendance).toBe('GOING');
  });

  it('uses no modal or bottom-sheet presentation for answered attendance', () => {
    const content = PersonalAttendanceContent({
      attendance: 'NOT_GOING',
      disabled: false,
      editing: false,
      onChange: vi.fn(),
      onEdit: vi.fn(),
    }) as TestElement;

    expect(content.type).toBe(AttendanceStatusRow);
    expect(descendants(content).some(({ type }) => type === 'Modal')).toBe(
      false,
    );
  });

  it('returns to read-only only after a successful changed selection', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();

    await expect(
      applyPersonalAttendanceSelection(
        'GOING',
        'NOT_GOING',
        onChange,
        onSuccess,
      ),
    ).resolves.toBe('UPDATED');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('NOT_GOING');
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('closes inline editing without a request when the value is unchanged', async () => {
    const onChange = vi.fn();
    const onSuccess = vi.fn();

    await expect(
      applyPersonalAttendanceSelection('GOING', 'GOING', onChange, onSuccess),
    ).resolves.toBe('UNCHANGED');
    expect(onChange).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('keeps inline editing open when the mutation fails', async () => {
    const onSuccess = vi.fn();

    await expect(
      applyPersonalAttendanceSelection(
        'GOING',
        'NOT_GOING',
        () => Promise.reject(new Error('failed')),
        onSuccess,
      ),
    ).rejects.toThrow('failed');
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

function renderFunctionElement(element: TestElement | undefined): TestElement {
  if (!element || typeof element.type !== 'function') {
    throw new Error('Expected a function component element.');
  }
  return (element.type as (props: TestElement['props']) => ReactNode)(
    element.props,
  ) as TestElement;
}

function compactSurface(choice: TestElement): TestElement {
  const surface = directChildren(choice).find(
    ({ type }) => type === native.view,
  );
  if (!surface) throw new Error('Expected a compact choice surface.');
  return surface;
}

function resolveStyle(element: TestElement): unknown[] {
  const style = element.props.style;
  const resolved =
    typeof style === 'function' ? style({ pressed: false }) : style;
  return Array.isArray(resolved) ? resolved : [resolved];
}

function descendants(element: TestElement): TestElement[] {
  return directChildren(element).flatMap((child) => [
    child,
    ...descendants(child),
  ]);
}

function directChildren(element: TestElement): TestElement[] {
  return Children.toArray(element.props.children).filter(
    (child): child is TestElement => isValidElement(child),
  );
}

function invoke(value: unknown): void {
  if (typeof value === 'function') value();
}
