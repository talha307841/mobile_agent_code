import {colors} from './theme';

export function taskStateColor(state: string): string {
  if (state === 'COMPLETED') return colors.success;
  if (state === 'FAILED' || state === 'CANCELLED') return colors.danger;
  if (state === 'QUEUED' || state === 'STARTING') return colors.warning;
  return colors.cyan;
}
