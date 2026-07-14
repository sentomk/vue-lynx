const DEFAULT_NEAR_BOTTOM_THRESHOLD = 72;
const NEW_TURN_TOP_GAP = 16;

interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  viewportHeight: number;
}

interface BottomSpacerMetrics {
  composerHeight: number;
  keyboardHeight: number;
  viewportHeight: number;
  anchoredTurnHeight?: number;
}

function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function bottomDistance(metrics: ScrollMetrics): number {
  const scrollTop = Math.max(0, Number.isFinite(metrics.scrollTop) ? metrics.scrollTop : 0);
  return Math.max(0, positive(metrics.scrollHeight) - positive(metrics.viewportHeight) - scrollTop);
}

export function isNearBottom(
  metrics: ScrollMetrics,
  threshold = DEFAULT_NEAR_BOTTOM_THRESHOLD,
): boolean {
  return bottomDistance(metrics) <= positive(threshold);
}

export function calculateBottomSpacer(metrics: BottomSpacerMetrics): number {
  const composerHeight = positive(metrics.composerHeight);
  const keyboardHeight = positive(metrics.keyboardHeight);
  const obstruction = composerHeight + keyboardHeight;

  if (metrics.anchoredTurnHeight === undefined) return obstruction;

  const blankSpace = Math.max(
    0,
    positive(metrics.viewportHeight) -
      obstruction -
      positive(metrics.anchoredTurnHeight) -
      NEW_TURN_TOP_GAP,
  );
  return obstruction + blankSpace;
}
