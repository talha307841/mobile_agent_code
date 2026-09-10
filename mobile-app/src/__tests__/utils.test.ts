import {colors} from '../theme';
import {taskStateColor} from '../utils';

describe('task state presentation', () => {
  it('distinguishes success, failure, and active work', () => {
    expect(taskStateColor('COMPLETED')).toBe(colors.primary);
    expect(taskStateColor('FAILED')).toBe(colors.danger);
    expect(taskStateColor('TESTING')).toBe(colors.warning);
  });
});
