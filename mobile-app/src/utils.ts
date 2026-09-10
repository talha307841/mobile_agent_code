import {colors} from './theme';

export function taskStateColor(state: string): string {
  if (state === 'COMPLETED') return colors.primary;
  if (state === 'FAILED' || state === 'CANCELLED') return colors.danger;
  return colors.warning;
}

