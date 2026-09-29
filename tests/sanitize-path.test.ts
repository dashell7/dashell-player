import { describe, expect, it } from 'vitest';
import { sanitizePath } from '../src/types/settings';

describe('sanitizePath', () => {
  it('strips traversal segments and leading slashes', () => {
    expect(sanitizePath('/../../LangPlayer//notes/../foo.md')).toBe('LangPlayer/foo.md');
  });

  it('normalizes backslashes', () => {
    expect(sanitizePath('LangPlayer\\recordings\\a.webm')).toBe('LangPlayer/recordings/a.webm');
  });
});
