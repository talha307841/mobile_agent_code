import {colors} from '../theme';
import {taskStateColor} from '../utils';

describe('task state presentation', () => {
  it('distinguishes success, failure, and active work', () => {
    expect(taskStateColor('COMPLETED')).toBe(colors.success);
    expect(taskStateColor('FAILED')).toBe(colors.danger);
    expect(taskStateColor('TESTING')).toBe(colors.cyan);
    expect(taskStateColor('QUEUED')).toBe(colors.warning);
  });
});
