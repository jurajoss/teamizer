import type { ReactElement } from 'react';

export type DateTimeFieldProps = {
  label: string;
  mode: 'date' | 'time';
  value: Date | null;
  onChange(value: Date): void;
  error?: string | null | undefined;
  hint?: string;
  minimumDate?: Date;
};

export declare function DateTimeField(props: DateTimeFieldProps): ReactElement;
