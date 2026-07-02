/**
 * Extra vision cases — counting, color, spatial, size-comparison, and
 * grid-position reads over the procedurally-generated fixtures in
 * vision-fixtures-extra.ts. Every case carries `requires: 'vision'`
 * so non-VLM models record an honest skip instead of a fail.
 */

import type { InlineCase } from './builtin-suite';
import {
  VISION_EXTRA_FIVE_BLACK_CIRCLES,
  VISION_EXTRA_GRID_BOTTOM_RIGHT,
  VISION_EXTRA_LARGE_GREEN_CIRCLE,
  VISION_EXTRA_LARGER_YELLOW_SMALLER_RED,
  VISION_EXTRA_ONE_BLUE_AMONG_RED,
  VISION_EXTRA_RED_LEFT_BLUE_RIGHT,
  VISION_EXTRA_THREE_RED_SQUARES,
  VISION_EXTRA_TWO_CIRCLES_THREE_SQUARES,
} from './vision-fixtures-extra';

export const SUITE_EXTRA_VISION: readonly InlineCase[] = [
  {
    id: 'vision-count-squares',
    input:
      'How many squares are in the attached image? Reply with ONLY the integer — no prose.',
    image: { dataUrl: VISION_EXTRA_THREE_RED_SQUARES, alt: 'three red squares on white' },
    expect: { kind: 'regex', value: '^\\s*3\\s*$' },
    requires: 'vision',
    weight: 1,
    tags: ['vision', 'counting'],
    forgiveFormatting: true,
  },
  {
    id: 'vision-count-circles-distractors',
    input:
      'The attached image contains circles AND squares. How many CIRCLES are there? Reply with ONLY the integer.',
    image: {
      dataUrl: VISION_EXTRA_TWO_CIRCLES_THREE_SQUARES,
      alt: 'two blue circles and three green squares on white',
    },
    expect: { kind: 'regex', value: '^\\s*2\\s*$' },
    requires: 'vision',
    weight: 1,
    tags: ['vision', 'counting', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'vision-count-row-of-five',
    input: 'How many circles are in the attached image? Reply with ONLY the integer.',
    image: { dataUrl: VISION_EXTRA_FIVE_BLACK_CIRCLES, alt: 'five black circles in a row' },
    expect: { kind: 'regex', value: '^\\s*5\\s*$' },
    requires: 'vision',
    weight: 1,
    tags: ['vision', 'counting'],
    forgiveFormatting: true,
  },
  {
    id: 'vision-color-identify',
    input:
      'What color is the circle in the attached image? Reply with ONLY one lowercase word: red, green, blue, or yellow.',
    image: { dataUrl: VISION_EXTRA_LARGE_GREEN_CIRCLE, alt: 'one large green circle on white' },
    expect: { kind: 'regex', value: '^\\s*green\\s*$' },
    requires: 'vision',
    weight: 1,
    tags: ['vision', 'classification'],
    forgiveFormatting: true,
  },
  {
    id: 'vision-spatial-left-right',
    input:
      'In the attached image, is the SQUARE on the LEFT or the RIGHT side? Reply with ONLY one word: LEFT or RIGHT.',
    image: {
      dataUrl: VISION_EXTRA_RED_LEFT_BLUE_RIGHT,
      alt: 'red square on the left, blue circle on the right',
    },
    expect: { kind: 'regex', value: '^\\s*LEFT\\s*$' },
    requires: 'vision',
    weight: 1,
    tags: ['vision', 'spatial'],
    forgiveFormatting: true,
  },
  {
    id: 'vision-size-compare',
    input:
      'The attached image contains two circles of different sizes. What color is the LARGER circle? Reply with ONLY one lowercase word.',
    image: {
      dataUrl: VISION_EXTRA_LARGER_YELLOW_SMALLER_RED,
      alt: 'a large yellow circle and a small red circle',
    },
    expect: { kind: 'regex', value: '^\\s*yellow\\s*$' },
    requires: 'vision',
    weight: 1,
    tags: ['vision', 'spatial', 'comparison'],
    forgiveFormatting: true,
  },
  {
    id: 'vision-grid-position',
    input:
      'The attached image shows a 3×3 grid with exactly one filled cell. Which corner is it in? Reply with ONLY one of: top-left, top-right, bottom-left, bottom-right.',
    image: {
      dataUrl: VISION_EXTRA_GRID_BOTTOM_RIGHT,
      alt: 'a 3x3 grid with the bottom-right cell filled blue',
    },
    expect: { kind: 'regex', value: '^\\s*bottom-right\\s*$' },
    requires: 'vision',
    weight: 1,
    tags: ['vision', 'spatial'],
    forgiveFormatting: true,
  },
  {
    id: 'vision-odd-color-out',
    input:
      'In the attached image, how many shapes are BLUE? Reply with ONLY the integer.',
    image: {
      dataUrl: VISION_EXTRA_ONE_BLUE_AMONG_RED,
      alt: 'three red squares and one blue circle',
    },
    expect: { kind: 'regex', value: '^\\s*1\\s*$' },
    requires: 'vision',
    weight: 1,
    tags: ['vision', 'counting', 'classification'],
    forgiveFormatting: true,
  },
];
