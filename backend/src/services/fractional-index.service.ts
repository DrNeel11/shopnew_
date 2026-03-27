/**
 * Fractional Indexing Service
 *
 * Provides O(1) amortized task ordering using fractional positions.
 * Tasks use string-comparable decimal positions (e.g. "0.5", "0.75").
 * When the gap between positions becomes too small (< MIN_GAP),
 * the positions in that column are rebalanced.
 */

const MIN_GAP = 1e-9;
const INITIAL_STEP = 1.0;
const REBALANCE_STEP = 1.0;

/**
 * Generate a position string for a task to be inserted between prev and next.
 * If prev is null, insert at the beginning.
 * If next is null, insert at the end.
 */
export function generatePosition(prev: string | null, next: string | null): string {
  const prevVal = prev !== null ? parseFloat(prev) : 0;
  const nextVal = next !== null ? parseFloat(next) : prevVal + INITIAL_STEP * 2;

  if (prev === null && next === null) {
    return '1.0';
  }

  if (prev === null) {
    // Insert before first item
    const result = nextVal - INITIAL_STEP;
    return result.toString();
  }

  if (next === null) {
    // Insert after last item
    const result = prevVal + INITIAL_STEP;
    return result.toString();
  }

  const mid = (prevVal + nextVal) / 2;

  if (nextVal - prevVal < MIN_GAP) {
    throw new Error('GAP_TOO_SMALL');
  }

  return mid.toString();
}

/**
 * Generate a position for inserting at the beginning of a list.
 */
export function positionAtStart(firstPosition: string | null): string {
  if (firstPosition === null) {
    return '1.0';
  }
  const val = parseFloat(firstPosition);
  return (val - INITIAL_STEP).toString();
}

/**
 * Generate a position for inserting at the end of a list.
 */
export function positionAtEnd(lastPosition: string | null): string {
  if (lastPosition === null) {
    return '1.0';
  }
  const val = parseFloat(lastPosition);
  return (val + INITIAL_STEP).toString();
}

/**
 * Rebalance positions for an array of task IDs.
 * Returns a map of taskId -> new position.
 */
export function rebalancePositions(taskIds: string[]): Map<string, string> {
  const result = new Map<string, string>();
  taskIds.forEach((id, index) => {
    result.set(id, ((index + 1) * REBALANCE_STEP).toString());
  });
  return result;
}

/**
 * Check if a gap between two positions is too small for further subdivision.
 */
export function needsRebalance(prev: string, next: string): boolean {
  return parseFloat(next) - parseFloat(prev) < MIN_GAP;
}

/**
 * Compare two positions as strings (lexicographic works since we use numbers).
 * Returns negative, zero, or positive.
 */
export function comparePositions(a: string, b: string): number {
  return parseFloat(a) - parseFloat(b);
}
