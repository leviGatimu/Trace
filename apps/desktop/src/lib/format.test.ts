import { describe, expect, it } from 'vitest';
import { duration, liveDuration, localDayRange, tidyWindowTitle } from './format';

describe('duration', () => {
  it('reads the way a person would say it', () => {
    expect(duration(0)).toBe('0s');
    expect(duration(42)).toBe('42s');
    expect(duration(60)).toBe('1m');
    expect(duration(8020)).toBe('2h 14m');
  });

  it('drops a trailing zero minutes rather than saying "2h 0m"', () => {
    expect(duration(7200)).toBe('2h');
  });
});

describe('liveDuration', () => {
  it('keeps seconds visible, since the point is that it is ticking', () => {
    expect(liveDuration(41)).toBe('0m 41s');
    expect(liveDuration(1421)).toBe('23m 41s');
    expect(liveDuration(3852)).toBe('1h 04m 12s');
  });
});

describe('localDayRange', () => {
  it('covers exactly one local day', () => {
    const range = localDayRange(new Date(2026, 7, 9, 14, 30));
    const hours = (range.toUtcMs - range.fromUtcMs) / 3_600_000;

    // 24 on an ordinary day; 23 or 25 across a daylight-saving change, which is
    // the point of using local date arithmetic rather than adding 86,400,000.
    expect([23, 24, 25]).toContain(hours);
  });

  it('starts at local midnight', () => {
    const range = localDayRange(new Date(2026, 7, 9, 14, 30));
    const start = new Date(range.fromUtcMs);

    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getDate()).toBe(9);
  });
});

describe('tidyWindowTitle', () => {
  it("removes the application's own suffix", () => {
    expect(tidyWindowTitle('GitHub - Google Chrome', 'Google Chrome')).toBe('GitHub');
  });

  it('leaves a title that merely contains a dash alone', () => {
    expect(tidyWindowTitle('trace - tracker - notes', 'Notepad')).toBe('trace - tracker - notes');
  });

  it('handles a window with no title', () => {
    expect(tidyWindowTitle(null, 'Notepad')).toBeNull();
  });
});
