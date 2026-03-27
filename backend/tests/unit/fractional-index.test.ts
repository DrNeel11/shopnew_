import {
  generatePosition,
  positionAtStart,
  positionAtEnd,
  rebalancePositions,
  needsRebalance,
  comparePositions,
} from '../../src/services/fractional-index.service';

describe('FractionalIndexService', () => {
  describe('generatePosition', () => {
    it('returns 1.0 when both prev and next are null', () => {
      expect(generatePosition(null, null)).toBe('1.0');
    });

    it('inserts between two positions (midpoint)', () => {
      const pos = generatePosition('1', '3');
      expect(parseFloat(pos)).toBeCloseTo(2.0);
    });

    it('inserts at end when next is null', () => {
      const pos = generatePosition('5', null);
      expect(parseFloat(pos)).toBeGreaterThan(5);
    });

    it('inserts at beginning when prev is null', () => {
      const pos = generatePosition(null, '5');
      expect(parseFloat(pos)).toBeLessThan(5);
    });

    it('throws GAP_TOO_SMALL when positions are too close', () => {
      const a = '1.0';
      const b = (1.0 + 1e-10).toString();
      expect(() => generatePosition(a, b)).toThrow('GAP_TOO_SMALL');
    });

    it('generates consistent ordering for multiple inserts', () => {
      const p1 = generatePosition(null, null); // 1.0
      const p2 = generatePosition(p1, null);    // 2.0
      const p3 = generatePosition(p2, null);    // 3.0
      const pMid = generatePosition(p1, p2);   // 1.5

      const positions = [p1, p2, p3, pMid].map(parseFloat).sort((a, b) => a - b);
      expect(positions[0]).toBeCloseTo(1.0);
      expect(positions[1]).toBeCloseTo(1.5);
      expect(positions[2]).toBeCloseTo(2.0);
      expect(positions[3]).toBeCloseTo(3.0);
    });
  });

  describe('positionAtStart', () => {
    it('returns 1.0 when list is empty', () => {
      expect(positionAtStart(null)).toBe('1.0');
    });

    it('returns value less than first position', () => {
      const pos = positionAtStart('5.0');
      expect(parseFloat(pos)).toBeLessThan(5.0);
    });
  });

  describe('positionAtEnd', () => {
    it('returns 1.0 when list is empty', () => {
      expect(positionAtEnd(null)).toBe('1.0');
    });

    it('returns value greater than last position', () => {
      const pos = positionAtEnd('3.0');
      expect(parseFloat(pos)).toBeGreaterThan(3.0);
    });
  });

  describe('rebalancePositions', () => {
    it('assigns evenly spaced positions', () => {
      const ids = ['a', 'b', 'c'];
      const result = rebalancePositions(ids);

      expect(parseFloat(result.get('a')!)).toBe(1.0);
      expect(parseFloat(result.get('b')!)).toBe(2.0);
      expect(parseFloat(result.get('c')!)).toBe(3.0);
    });

    it('handles empty array', () => {
      const result = rebalancePositions([]);
      expect(result.size).toBe(0);
    });

    it('handles single item', () => {
      const result = rebalancePositions(['x']);
      expect(parseFloat(result.get('x')!)).toBe(1.0);
    });
  });

  describe('needsRebalance', () => {
    it('returns false for normal gap', () => {
      expect(needsRebalance('1.0', '2.0')).toBe(false);
    });

    it('returns true when gap is below threshold', () => {
      const a = '1.0';
      const b = (1.0 + 1e-10).toString();
      expect(needsRebalance(a, b)).toBe(true);
    });
  });

  describe('comparePositions', () => {
    it('returns negative when a < b', () => {
      expect(comparePositions('1.0', '2.0')).toBeLessThan(0);
    });

    it('returns positive when a > b', () => {
      expect(comparePositions('3.0', '1.0')).toBeGreaterThan(0);
    });

    it('returns zero when equal', () => {
      expect(comparePositions('2.0', '2.0')).toBe(0);
    });
  });
});
