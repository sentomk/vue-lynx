import { describe, expect, it } from 'vitest';

import { bottomDistance, calculateBottomSpacer, isNearBottom } from '../src/lib/chat-viewport';

describe('chat viewport geometry', () => {
  it('treats the user as near the bottom within a small tolerance', () => {
    const metrics = { scrollTop: 508, scrollHeight: 1200, viewportHeight: 640 };

    expect(bottomDistance(metrics)).toBe(52);
    expect(isNearBottom(metrics)).toBe(true);
    expect(isNearBottom({ ...metrics, scrollTop: 400 })).toBe(false);
  });

  it('clamps bounce and undersized-content distances to zero', () => {
    expect(bottomDistance({ scrollTop: -20, scrollHeight: 500, viewportHeight: 640 })).toBe(0);
    expect(
      bottomDistance({
        scrollTop: 600,
        scrollHeight: 1200,
        viewportHeight: 640,
      }),
    ).toBe(0);
  });

  it('uses the measured composer height as the normal bottom spacer', () => {
    expect(
      calculateBottomSpacer({
        composerHeight: 116,
        keyboardHeight: 0,
        viewportHeight: 640,
      }),
    ).toBe(116);
  });

  it('shrinks intentional blank space while the keyboard or answer consumes it', () => {
    const closed = calculateBottomSpacer({
      composerHeight: 104,
      keyboardHeight: 0,
      viewportHeight: 700,
      anchoredTurnHeight: 84,
    });
    const opened = calculateBottomSpacer({
      composerHeight: 104,
      keyboardHeight: 300,
      viewportHeight: 700,
      anchoredTurnHeight: 84,
    });

    expect(closed).toBe(600);
    expect(opened).toBe(600);
    expect(
      calculateBottomSpacer({
        composerHeight: 104,
        keyboardHeight: 300,
        viewportHeight: 700,
        anchoredTurnHeight: 640,
      }),
    ).toBe(404);
  });
});
