import { resolveBaileysBrowser } from './baileys-lifecycle';

describe('resolveBaileysBrowser', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('defaults to OpenWA/Chrome/120.0.0 when neither env var is set', () => {
    expect(resolveBaileysBrowser({})).toEqual(['OpenWA', 'Chrome', '120.0.0']);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('uses BAILEYS_BROWSER_NAME as the platform only, keeping Chrome/120.0.0 defaults', () => {
    expect(resolveBaileysBrowser({ BAILEYS_BROWSER_NAME: 'Nucleux' })).toEqual(['Nucleux', 'Chrome', '120.0.0']);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('trims whitespace around BAILEYS_BROWSER_NAME', () => {
    expect(resolveBaileysBrowser({ BAILEYS_BROWSER_NAME: '  Nucleux  ' })).toEqual(['Nucleux', 'Chrome', '120.0.0']);
  });

  it('treats a blank BAILEYS_BROWSER_NAME as unset and falls back to the default', () => {
    expect(resolveBaileysBrowser({ BAILEYS_BROWSER_NAME: '   ' })).toEqual(['OpenWA', 'Chrome', '120.0.0']);
  });

  it('uses a valid 3-segment BAILEYS_USER_AGENT verbatim', () => {
    expect(resolveBaileysBrowser({ BAILEYS_USER_AGENT: 'Nucleux/Chrome/120.0.0' })).toEqual([
      'Nucleux',
      'Chrome',
      '120.0.0',
    ]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('trims whitespace around each BAILEYS_USER_AGENT segment', () => {
    expect(resolveBaileysBrowser({ BAILEYS_USER_AGENT: ' Nucleux / Edge / 121.0.1 ' })).toEqual([
      'Nucleux',
      'Edge',
      '121.0.1',
    ]);
  });

  it('prefers BAILEYS_USER_AGENT over BAILEYS_BROWSER_NAME when both are set and valid', () => {
    expect(
      resolveBaileysBrowser({
        BAILEYS_USER_AGENT: 'Nucleux/Edge/121.0.1',
        BAILEYS_BROWSER_NAME: 'ShouldBeIgnored',
      }),
    ).toEqual(['Nucleux', 'Edge', '121.0.1']);
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
  ])('falls back to the default when BAILEYS_USER_AGENT is %s (treated as unset)', (_label, value) => {
    expect(resolveBaileysBrowser({ BAILEYS_USER_AGENT: value })).toEqual(['OpenWA', 'Chrome', '120.0.0']);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['0 segments', 'NoSlashesHere'],
    ['a trailing slash (2 segments, one empty)', 'Nucleux/'],
    ['2 segments', 'Nucleux/Chrome'],
    ['4 segments', 'Nucleux/Chrome/120.0.0/extra'],
    ['an empty middle segment', 'Nucleux//120.0.0'],
    ['a whitespace-only segment', 'Nucleux/   /120.0.0'],
  ])('logs a warning and falls through to BAILEYS_BROWSER_NAME when BAILEYS_USER_AGENT is malformed (%s)', (_label, value) => {
    expect(resolveBaileysBrowser({ BAILEYS_USER_AGENT: value, BAILEYS_BROWSER_NAME: 'Nucleux' })).toEqual([
      'Nucleux',
      'Chrome',
      '120.0.0',
    ]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toEqual(expect.stringContaining(value));
  });

  it('falls through to the default when BAILEYS_USER_AGENT is malformed and BAILEYS_BROWSER_NAME is unset', () => {
    expect(resolveBaileysBrowser({ BAILEYS_USER_AGENT: 'Malformed' })).toEqual(['OpenWA', 'Chrome', '120.0.0']);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('never throws for a malformed BAILEYS_USER_AGENT', () => {
    expect(() => resolveBaileysBrowser({ BAILEYS_USER_AGENT: '///' })).not.toThrow();
  });
});
