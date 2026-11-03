import { describe, expect, it } from 'vitest';
import { appEdgeSwipe } from '../../src/phone/edgeSwipe';

describe('appEdgeSwipe', () => {
  it('is on for the iPhone, which has no system back gesture inside apps', () => {
    expect(appEdgeSwipe('ios')).toBe(true);
  });

  it('is on in a browser or the desktop phone-width window', () => {
    expect(appEdgeSwipe('web')).toBe(true);
    expect(appEdgeSwipe(undefined)).toBe(true);
  });

  it("is off on Android, whose own back gesture would make one flick go back twice", () => {
    expect(appEdgeSwipe('android')).toBe(false);
  });
});
