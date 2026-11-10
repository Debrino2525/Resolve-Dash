import { computeSubscriptionState, readGracePeriodHours } from './subscription-state';

describe('computeSubscriptionState', () => {
  const NOW = new Date('2026-11-10T12:00:00Z');
  const hours = (h: number): Date => new Date(NOW.getTime() + h * 60 * 60 * 1000);
  const none = { trialEndsAt: null, paidUntil: null, graceEndsAt: null };

  it('is ACTIVE while paid_until is in the future', () => {
    expect(computeSubscriptionState({ ...none, paidUntil: hours(5) }, NOW, 24)).toEqual({
      effectiveStatus: 'ACTIVE',
      canAccept: true,
      graceEndsAt: null,
    });
  });

  it('is TRIAL while only the trial covers now', () => {
    const state = computeSubscriptionState({ ...none, trialEndsAt: hours(1) }, NOW, 24);
    expect(state.effectiveStatus).toBe('TRIAL');
    expect(state.canAccept).toBe(true);
  });

  it('prefers ACTIVE when a paid week and a trial overlap', () => {
    const state = computeSubscriptionState(
      { ...none, trialEndsAt: hours(10), paidUntil: hours(2) },
      NOW,
      24,
    );
    expect(state.effectiveStatus).toBe('ACTIVE');
  });

  it('enters automatic GRACE_PERIOD right after a paid week ends', () => {
    const state = computeSubscriptionState({ ...none, paidUntil: hours(-3) }, NOW, 24);
    expect(state.effectiveStatus).toBe('GRACE_PERIOD');
    expect(state.canAccept).toBe(true);
    expect(state.graceEndsAt).toEqual(hours(21));
  });

  it('is SUSPENDED once the grace window after a paid week has passed', () => {
    const state = computeSubscriptionState({ ...none, paidUntil: hours(-25) }, NOW, 24);
    expect(state).toEqual({ effectiveStatus: 'SUSPENDED', canAccept: false, graceEndsAt: null });
  });

  it('gives no automatic grace after a trial (only after paying)', () => {
    const state = computeSubscriptionState({ ...none, trialEndsAt: hours(-1) }, NOW, 24);
    expect(state.effectiveStatus).toBe('SUSPENDED');
  });

  it('honours an explicitly stored grace_ends_at in the future', () => {
    const state = computeSubscriptionState(
      { ...none, trialEndsAt: hours(-48), graceEndsAt: hours(6) },
      NOW,
      24,
    );
    expect(state.effectiveStatus).toBe('GRACE_PERIOD');
    expect(state.graceEndsAt).toEqual(hours(6));
  });

  it('ignores the stored status entirely (stale ACTIVE with no coverage is SUSPENDED)', () => {
    expect(computeSubscriptionState(none, NOW, 24).effectiveStatus).toBe('SUSPENDED');
  });

  it('with zero grace hours suspends exactly at paid_until', () => {
    const state = computeSubscriptionState({ ...none, paidUntil: NOW }, NOW, 0);
    expect(state.effectiveStatus).toBe('SUSPENDED');
  });
});

describe('readGracePeriodHours', () => {
  it.each([
    [undefined, 24],
    ['', 24],
    ['48', 48],
    ['0', 0],
    ['-5', 24],
    ['abc', 24],
  ])('parses %p as %p', (raw, expected) => {
    expect(readGracePeriodHours(raw)).toBe(expected);
  });
});
