import { describe, it, expect } from 'vitest';
import { headingOf, sliceOf, addHeading, emptyCoverage, countSeen, mergeCoverage, coverageText } from '../src/coverage.js';

describe('coverage ring', () => {
  it('reads the compass heading from both kinds of phone event', () => {
    expect(headingOf({ webkitCompassHeading: 90 })).toBe(90);
    expect(headingOf({ alpha: 90, absolute: true })).toBe(270); // alpha turns the other way
    expect(headingOf({ alpha: 0 })).toBe(0);
    expect(headingOf({ alpha: null })).toBe(null);
    expect(headingOf(null)).toBe(null);
  });

  it('puts headings into 12 slices of 30 degrees, wrapping at north', () => {
    expect(sliceOf(0)).toBe(0);
    expect(sliceOf(29.9)).toBe(0);
    expect(sliceOf(30)).toBe(1);
    expect(sliceOf(359)).toBe(11);
    expect(sliceOf(360)).toBe(0);
    expect(sliceOf(-10)).toBe(11);
  });

  it('counts each direction once, however long the phone points there', () => {
    const seen = emptyCoverage();
    for (const d of [5, 10, 15, 95, 100, 200, null, NaN]) addHeading(seen, d);
    expect(countSeen(seen)).toBe(3);
    expect(coverageText(seen)).toBe('You checked 3 of 12 directions.');
  });

  it('combines the lens and night-vision rings', () => {
    const a = addHeading(emptyCoverage(), 10), b = addHeading(emptyCoverage(), 200);
    expect(countSeen(mergeCoverage(a, b))).toBe(2);
    expect(countSeen(mergeCoverage(undefined, b))).toBe(1);
  });
});
