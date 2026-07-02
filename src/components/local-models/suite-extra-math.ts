/**
 * Extra math/arithmetic cases for the local-model benchmark suite.
 *
 * 35 single-turn strict-output cases: GSM-Symbolic-style parameterized
 * word problems with distractor numbers, multi-step rates/ages/work,
 * modular & base arithmetic (hex/binary/base-7), percentage/ratio traps,
 * expected value, conditional probability, unit conversions with traps,
 * sequences, and simple geometry. Cases 1-20 implement
 * docs/design/cases-math-arithmetic.md (all revision fixes applied);
 * the rest draw on the math/probability/stats sections of
 * docs/design/suite-expansion.md, skipping overlaps with builtin-suite.
 *
 * Every case is parameterized via `generate` (re-randomized each run),
 * has exactly one unambiguous answer, weight 1, and — since the answers
 * are plain numbers or fractions and formatting is never the thing under
 * test — opts into the per-case cosmetic softener (`forgiveFormatting`).
 * Regex expectations substitute ONLY numeric vars (or digit-only
 * strings); string answers use `exact`.
 */
import type { InlineCase } from './builtin-suite';

export const SUITE_EXTRA_MATH: readonly InlineCase[] = [
  // ── Word problems with distractor numbers (GSM-Symbolic / GSM-NoOp style) ──
  {
    id: 'math-two-step-restock',
    input:
      '{{name}} had {{a}} {{obj}}. {{name}} gave away {{b}} of them, then bought {{c}} more. How many {{obj}} does {{name}} have now? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        name: { expr: "['Mara', 'Deniz', 'Kofi', 'Ines', 'Talia', 'Ravi'][idx]" },
        obj: { expr: "['stamps', 'marbles', 'pins', 'shells', 'coins', 'beads'][idx]" },
        b: { int: { min: 6, max: 20 } },
        d: { int: { min: 10, max: 30 } },
        // a = b + d guarantees a > b (never gives away more than owned).
        a: { expr: 'b + d' },
        c: { int: { min: 3, max: 15 } },
        // a - b + c = (b + d) - b + c = d + c.
        ans: { expr: 'd + c' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'arithmetic'],
    forgiveFormatting: true,
  },
  {
    id: 'math-noop-smaller-clause',
    input:
      "{{name}} picks {{a}} apples on Monday and {{b}} apples on Tuesday. {{c}} of Tuesday's apples are a bit smaller than average, but they are all still normal apples. How many apples does {{name}} have in total? Reply with ONLY the integer, no commentary.",
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3] },
        name: { expr: "['Oliver', 'Mia', 'Ravi', 'Lena'][idx]" },
        a: { int: { min: 23, max: 58 } },
        b: { int: { min: 31, max: 69 } },
        c: { int: { min: 3, max: 9 } },
        // The size clause is a no-op; the trap answer a + b - c is always
        // distinct since c >= 3.
        ans: { expr: 'a + b' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'arithmetic', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'math-offtopic-number-distractor',
    input:
      "{{name1}} has {{a}} stickers. {{name2}}'s cousin is {{x}} years old. {{name1}} buys {{b}} more stickers. How many stickers does {{name1}} have? Reply with ONLY the integer, no commentary.",
    generate: {
      vars: {
        // Parallel arrays keep name1 != name2 in every row.
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        name1: { expr: "['Petra', 'Yusuf', 'Carla', 'Ede', 'Nina', 'Tomas'][idx]" },
        name2: { expr: "['Marko', 'Alice', 'Dario', 'Sara', 'Owen', 'Julia'][idx]" },
        a: { int: { min: 12, max: 48 } },
        b: { int: { min: 5, max: 25 } },
        // The age concerns a different entity/unit; traps a+b±x always
        // differ from a+b since x >= 7.
        x: { int: { min: 7, max: 19 } },
        ans: { expr: 'a + b' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'gotcha'],
    forgiveFormatting: true,
  },

  // ── Multi-step rates / ages / work ──
  {
    id: 'math-pipe-fill-drain',
    input:
      'A tap can fill an empty tank in {{a}} hours. A drain at the bottom can empty the full tank in {{b}} hours. If the tank starts empty and both the tap and the drain are open, how many hours does it take to fill the tank? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        // time = 1/(1/a - 1/b) = ab/(b-a); every row hand-verified integer,
        // and b > a in every row so the tank always fills.
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        a: { expr: '[3, 4, 6, 4, 10, 6][idx]' },
        b: { expr: '[6, 12, 12, 6, 15, 8][idx]' },
        ans: { expr: '[6, 6, 12, 12, 30, 24][idx]' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math'],
    forgiveFormatting: true,
  },
  {
    id: 'math-age-gap-invariant',
    input:
      '{{name}} is {{d}} years older than her brother. In {{y}} years, how many years older than her brother will {{name}} be? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4] },
        name: { expr: "['Nora', 'Priya', 'Lena', 'Amara', 'Sofia'][idx]" },
        d: { int: { min: 4, max: 9 } },
        // Age gaps are invariant over time: the answer is d regardless of y.
        y: { int: { min: 5, max: 30 } },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{d}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'math-speed-trip-minutes',
    input:
      'A cyclist rides {{dst}} km at a constant speed of {{v}} km/h. How many MINUTES does the ride take? Reply with ONLY the integer number of minutes, no units, no commentary.',
    generate: {
      vars: {
        // v divisible by 4 keeps dst = v*q/4 an integer; time = q/4 hours
        // = 15q minutes (75-165). Answering in hours fails the regex.
        v: { pick: [12, 16, 20, 24, 28] },
        q: { int: { min: 5, max: 11 } },
        dst: { expr: 'v * q / 4' },
        ans: { expr: '15 * q' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'arithmetic'],
    forgiveFormatting: true,
  },
  {
    id: 'math-avg-speed-harmonic',
    input:
      'You drive to town at {{v1}} km/h and return along the same road at {{v2}} km/h. What is your average speed for the whole round trip, in km/h? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        // Harmonic mean 2*v1*v2/(v1+v2); every row hand-verified integer.
        // The trap is the arithmetic mean (v1+v2)/2, always distinct.
        idx: { pick: [0, 1, 2, 3, 4] },
        v1: { expr: '[60, 60, 20, 12, 40][idx]' },
        v2: { expr: '[30, 20, 5, 4, 10][idx]' },
        ans: { expr: '[40, 30, 8, 6, 16][idx]' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'gotcha'],
    forgiveFormatting: true,
  },

  // ── Modular & base arithmetic ──
  {
    id: 'math-clock-hours-later',
    input:
      "A standard 12-hour clock now shows exactly {{h}} o'clock. What number will the hour hand point to exactly {{k}} hours from now? Reply with ONLY the integer (1-12), no commentary.",
    generate: {
      vars: {
        h: { int: { min: 1, max: 12 } },
        // k > 24 forces genuine mod-12 reasoning.
        k: { int: { min: 25, max: 90 } },
        // ((h+k-1) mod 12)+1 maps the 0 residue to 12 correctly.
        ans: { expr: '((h + k - 1) % 12) + 1' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'arithmetic'],
    forgiveFormatting: true,
  },
  {
    id: 'math-hex-to-decimal',
    input:
      'Convert the hexadecimal number {{hex}} to decimal (base 10). Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        n: { int: { min: 100, max: 255 } },
        // The hex string appears only in the prompt; only numeric n enters
        // the expectation regex.
        hex: { expr: 'n.toString(16).toUpperCase()' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{n}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'arithmetic'],
    forgiveFormatting: true,
  },
  {
    id: 'math-binary-addition',
    input:
      'Compute the sum of the two binary numbers {{abin}} and {{bbin}}. Reply with ONLY the sum in binary (only digits 0 and 1, no 0b prefix), no commentary.',
    generate: {
      vars: {
        a: { int: { min: 9, max: 30 } },
        b: { int: { min: 9, max: 30 } },
        abin: { expr: 'a.toString(2)' },
        bbin: { expr: 'b.toString(2)' },
        // Digit-only (0/1) string — safe to substitute into the regex.
        sbin: { expr: '(a + b).toString(2)' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{sbin}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'arithmetic'],
    forgiveFormatting: true,
  },
  {
    id: 'arith-base7-to-decimal',
    input:
      'Convert the base-7 number {{b7}} to decimal (base 10). Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        // 50..342 keeps b7 a three-digit base-7 numeral (343 = 7^3).
        n: { int: { min: 50, max: 342 } },
        b7: { expr: 'n.toString(7)' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{n}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'arithmetic'],
    forgiveFormatting: true,
  },

  // ── Expected value ──
  {
    id: 'math-expected-value-die',
    input:
      'You roll one fair six-sided die and are paid {{k}} dollars per pip shown (i.e. {{k}} times the number rolled). What is the expected value of the payout, in dollars? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        // Even k keeps k * E[roll] = k * 3.5 an integer (7..35).
        k: { pick: [2, 4, 6, 8, 10] },
        ans: { expr: 'k * 3.5' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'probability'],
    forgiveFormatting: true,
  },
  {
    id: 'math-expected-net-raffle',
    input:
      'A raffle ticket costs ${{c}}. With probability 1/{{n}} the ticket wins ${{w}}; otherwise it wins nothing. What is the expected NET profit of buying one ticket, in dollars? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        n: { pick: [10, 20, 25, 50] },
        m: { int: { min: 3, max: 9 } },
        // w = n*m guarantees w/n is an integer; E = w/n - c = m - c >= 1,
        // so no negative-sign regex issues. Trap: forgetting the cost (m).
        w: { expr: 'n * m' },
        c: { pick: [1, 2] },
        ans: { expr: 'm - c' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'probability'],
    forgiveFormatting: true,
  },

  // ── Conditional probability ──
  {
    id: 'math-cond-prob-dice-given-first',
    input:
      'Two fair six-sided dice are rolled one after the other. The first die shows {{k}}. Given this, what is the probability that the TOTAL of the two dice is exactly {{s}}? Reply with ONLY a fraction in lowest terms (e.g. 1/2), no commentary.',
    generate: {
      vars: {
        // s - k = off is always in 1..6, so conditioning reduces to
        // P(second die = off) = 1/6 for every draw; the surface
        // re-randomizes but the answer is invariant. The trap is the
        // memorized UNCONDITIONAL sum distribution (e.g. 5/36 for sum 8).
        k: { int: { min: 1, max: 6 } },
        off: { int: { min: 1, max: 6 } },
        s: { expr: 'k + off' },
      },
    },
    expect: { kind: 'exact', value: '1/6' },
    weight: 1,
    tags: ['reasoning', 'math', 'probability', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'math-cond-prob-second-red',
    input:
      'A bag holds {{r}} red and {{b}} blue marbles. You draw two marbles WITHOUT replacement. Given that the first marble drawn is red, what is the probability that the second is also red? Reply with ONLY a fraction in lowest terms (e.g. 2/5), no commentary.',
    generate: {
      vars: {
        // (r-1)/(r+b-1), each row pre-reduced and hand-verified:
        // 3/9=1/3, 4/9, 2/9, 5/9, 6/9=2/3, 4/11.
        // Trap: ignoring the condition and answering r/(r+b).
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        r: { expr: '[4, 5, 3, 6, 7, 5][idx]' },
        b: { expr: '[6, 5, 7, 4, 3, 7][idx]' },
        ans: { expr: "['1/3', '4/9', '2/9', '5/9', '2/3', '4/11'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'math', 'probability', 'gotcha'],
    forgiveFormatting: true,
  },

  // ── Simple probability & stats ──
  {
    id: 'prob-exactly-k-heads',
    input:
      '{{n}} fair coins are flipped. What is the probability of getting exactly {{k}} heads? Reply with ONLY a fraction in lowest terms (e.g. 1/2), no commentary.',
    generate: {
      vars: {
        // C(n,k)/2^n, pre-reduced: C(3,1)/8=3/8, C(3,2)/8=3/8,
        // C(4,1)/16=1/4, C(4,2)/16=3/8, C(4,3)/16=1/4.
        idx: { pick: [0, 1, 2, 3, 4] },
        n: { expr: '[3, 3, 4, 4, 4][idx]' },
        k: { expr: '[1, 2, 1, 2, 3][idx]' },
        ans: { expr: "['3/8', '3/8', '1/4', '3/8', '1/4'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'math', 'probability'],
    forgiveFormatting: true,
  },
  {
    id: 'prob-die-greater',
    input:
      'One fair six-sided die is rolled. What is the probability of rolling a number GREATER than {{k}}? Reply with ONLY a fraction in lowest terms (e.g. 1/2), no commentary.',
    generate: {
      vars: {
        // (6-k)/6 pre-reduced: 5/6, 4/6=2/3, 3/6=1/2, 2/6=1/3.
        idx: { pick: [0, 1, 2, 3] },
        k: { expr: '[1, 2, 3, 4][idx]' },
        ans: { expr: "['5/6', '2/3', '1/2', '1/3'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'math', 'probability'],
    forgiveFormatting: true,
  },
  {
    id: 'prob-marble-red',
    input:
      'A bag contains {{r}} red marbles and {{b}} blue marbles. One marble is drawn at random. What is the probability that it is red? Reply with ONLY a fraction in lowest terms (e.g. 1/2), no commentary.',
    generate: {
      vars: {
        // r/(r+b) pre-reduced: 2/8=1/4, 3/12=1/4, 4/10=2/5, 5/15=1/3, 6/8=3/4.
        idx: { pick: [0, 1, 2, 3, 4] },
        r: { expr: '[2, 3, 4, 5, 6][idx]' },
        b: { expr: '[6, 9, 6, 10, 2][idx]' },
        ans: { expr: "['1/4', '1/4', '2/5', '1/3', '3/4'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'math', 'probability'],
    forgiveFormatting: true,
  },
  {
    id: 'prob-complement-pct',
    input:
      'The probability of rain tomorrow is {{p}}%. What is the probability that it does NOT rain tomorrow, as an integer percent? Reply with ONLY the integer, no percent sign, no commentary.',
    generate: {
      vars: {
        p: { int: { min: 5, max: 95, step: 5 } },
        q: { expr: '100 - p' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{q}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'probability', 'fast'],
    forgiveFormatting: true,
  },
  {
    id: 'math-mean-of-five',
    input:
      'What is the mean (average) of these five numbers: {{l1}}, {{l2}}, {{l3}}, {{l4}}, {{l5}}? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        // Offsets -2, +3, 0, -4, +3 sum to 0, so the list sums to 5m and
        // the mean is exactly m; m >= 10 keeps every value positive.
        m: { int: { min: 10, max: 30 } },
        l1: { expr: 'm - 2' },
        l2: { expr: 'm + 3' },
        l3: { expr: 'm' },
        l4: { expr: 'm - 4' },
        l5: { expr: 'm + 3' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{m}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'arithmetic'],
    forgiveFormatting: true,
  },
  {
    id: 'math-mode-of-list',
    input:
      'What is the mode (most frequent value) of this list: {{a}}, {{b}}, {{a}}, {{c}}, {{a}}? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        // b and c are distinct from a by construction; a appears 3 times.
        a: { int: { min: 2, max: 9 } },
        b: { expr: 'a + 3' },
        c: { expr: 'a + 7' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{a}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'fast'],
    forgiveFormatting: true,
  },
  {
    id: 'math-range-of-list',
    input:
      'What is the range (maximum minus minimum) of this list: {{v1}}, {{v2}}, {{v3}}, {{v4}}, {{v5}}? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        v1: { int: { min: 1, max: 99 } },
        v2: { int: { min: 1, max: 99 } },
        v3: { int: { min: 1, max: 99 } },
        v4: { int: { min: 1, max: 99 } },
        v5: { int: { min: 1, max: 99 } },
        r: { expr: 'max(v1, v2, v3, v4, v5) - min(v1, v2, v3, v4, v5)' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{r}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'arithmetic'],
    forgiveFormatting: true,
  },

  // ── Unit conversions with traps ──
  {
    id: 'math-hours-minutes-to-seconds',
    input:
      'How many seconds are there in {{h}} hours and {{m}} minutes? Reply with ONLY the integer, no commas, no commentary.',
    generate: {
      vars: {
        // 3600h + 60m spans 3900-14340; the trap is the 60-vs-3600 factor.
        h: { int: { min: 1, max: 3 } },
        m: { int: { min: 5, max: 59 } },
        ans: { expr: 'h * 3600 + m * 60' },
        // Comma-grouped split of ans (hi numeric, lo3 digit-only string —
        // both regex-safe): 3900 -> 3,900 … 14340 -> 14,340.
        hi: { expr: 'floor(ans / 1000)' },
        lo3: { expr: "('00' + (ans % 1000)).slice(-3)" },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    acceptWithRemark: [
      {
        kind: 'regex',
        value: '^\\s*{{hi}},{{lo3}}\\s*$',
        remark: 'used a thousands separator despite the prompt forbidding commas',
      },
    ],
    weight: 1,
    tags: ['reasoning', 'arithmetic'],
    forgiveFormatting: true,
  },
  {
    id: 'math-area-m2-to-cm2',
    input:
      'A square has sides {{n}} meters long. What is its area in square CENTIMETERS? Reply with ONLY the integer, no commas, no thousands separators, no commentary.',
    generate: {
      vars: {
        // (100n)^2 = 10000*n^2; the squared-unit trap answer 100*n^2 is
        // always distinct.
        n: { int: { min: 2, max: 9 } },
        ans: { expr: 'n * n * 10000' },
        // Comma-grouped form of ans is always g followed by ',000'
        // (ans = n^2 * 10^4): n=2 -> 40,000 … n=9 -> 810,000. The grouped
        // trap answer (at most '8,100') never matches the g,000 shape.
        g: { expr: 'n * n * 10' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    acceptWithRemark: [
      {
        kind: 'regex',
        value: '^\\s*{{g}},000\\s*$',
        remark: 'used a thousands separator despite the prompt forbidding commas',
      },
    ],
    weight: 1,
    tags: ['reasoning', 'math', 'geometry', 'gotcha'],
    forgiveFormatting: true,
  },

  // ── Percentage / ratio traps ──
  {
    id: 'math-percent-updown-trap',
    input:
      'A jacket costs ${{a}}. The price is increased by {{p}}%, and the new price is then decreased by {{p}}%. What is the final price in dollars? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        // final = a*(1 - p^2/10000); a is a multiple of 100 and p of 10,
        // so the result is always an integer (e.g. 300, 30 -> 273).
        // The trap answer is a (assuming the price returns to original).
        a: { pick: [100, 200, 300, 400, 500] },
        p: { pick: [10, 20, 30, 50] },
        ans: { expr: 'a * (10000 - p * p) / 10000' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'math-ratio-split-larger',
    input:
      'A prize of ${{t}} is split between two people in the ratio {{r1}}:{{r2}}. How many dollars does the person with the LARGER share receive? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        // r2 > r1 in every row; t = k*(r1+r2) keeps the shares integral.
        // Larger share = k*r2. Traps: t/2 (even split) or the smaller share.
        idx: { pick: [0, 1, 2, 3, 4] },
        r1: { expr: '[2, 3, 1, 2, 3][idx]' },
        r2: { expr: '[3, 4, 4, 5, 5][idx]' },
        k: { int: { min: 4, max: 15 } },
        t: { expr: 'k * (r1 + r2)' },
        ans: { expr: 'k * r2' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'arithmetic'],
    forgiveFormatting: true,
  },

  // ── Simple geometry ──
  {
    id: 'math-triangle-third-angle',
    input:
      'Two angles of a triangle measure {{a}} degrees and {{b}} degrees. What is the measure of the third angle, in degrees? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        a: { int: { min: 35, max: 75 } },
        b: { int: { min: 40, max: 80 } },
        // 180 - a - b is in [25, 105] — always a valid positive angle.
        ans: { expr: '180 - a - b' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'geometry'],
    forgiveFormatting: true,
  },
  {
    id: 'math-rectangle-perimeter',
    input:
      'A rectangle is {{l}} cm long and {{w}} cm wide. What is its PERIMETER in cm? Reply with ONLY the integer, no units, no commentary.',
    generate: {
      vars: {
        // Ranges chosen so perimeter != area for every combination
        // (2(l+w) = lw requires (l-2)(w-2) = 4 -> l <= 6, excluded),
        // keeping the perimeter-vs-area confusion diagnostic.
        l: { int: { min: 7, max: 19 } },
        w: { int: { min: 3, max: 6 } },
        ans: { expr: '2 * (l + w)' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'geometry'],
    forgiveFormatting: true,
  },

  // ── Sequences ──
  {
    id: 'seq-arith-next',
    input:
      'What number comes next in this sequence: {{t1}}, {{t2}}, {{t3}}, {{t4}}, ? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        s: { int: { min: 2, max: 9 } },
        d: { int: { min: 3, max: 9 } },
        t1: { expr: 's' },
        t2: { expr: 's + d' },
        t3: { expr: 's + 2 * d' },
        t4: { expr: 's + 3 * d' },
        // Constant difference d over four shown terms fixes the rule.
        ans: { expr: 's + 4 * d' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'sequence'],
    forgiveFormatting: true,
  },
  {
    id: 'math-geometric-sequence-next',
    input:
      'What number comes next in this sequence: {{a}}, {{t2}}, {{t3}}, {{t4}}, ? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        a: { int: { min: 2, max: 6 } },
        r: { pick: [2, 3] },
        t2: { expr: 'a * r' },
        t3: { expr: 'a * r * r' },
        t4: { expr: 'a * r * r * r' },
        // Constant ratio r over four shown terms determines the rule
        // uniquely; next = a * r^4.
        ans: { expr: 'a * r * r * r * r' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'sequence'],
    forgiveFormatting: true,
  },
  {
    id: 'math-fibonacci-like-next',
    input:
      'Each number in this sequence is the sum of the two numbers before it. What comes next: {{a}}, {{b}}, {{t3}}, {{t4}}, {{t5}}, ? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        // Rule stated explicitly, so zero ambiguity; random seeds kill the
        // memorized 1,1,2,3,5,8 instance. next = t4 + t5 = 3a + 5b.
        a: { int: { min: 2, max: 9 } },
        b: { int: { min: 2, max: 9 } },
        t3: { expr: 'a + b' },
        t4: { expr: 'a + 2 * b' },
        t5: { expr: '2 * a + 3 * b' },
        ans: { expr: '3 * a + 5 * b' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'sequence'],
    forgiveFormatting: true,
  },

  // ── Algebra & plain arithmetic ──
  {
    id: 'math-sum-difference-larger',
    input:
      'The sum of two numbers is {{s}} and their difference is {{d}}. What is the LARGER of the two numbers? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        // y < x always, so s and d are positive and parity is consistent
        // by construction; larger = (s+d)/2 = x.
        x: { int: { min: 12, max: 40 } },
        y: { int: { min: 3, max: 9 } },
        s: { expr: 'x + y' },
        d: { expr: 'x - y' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{x}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'algebra'],
    forgiveFormatting: true,
  },
  {
    id: 'arith-subtraction-borrow',
    input: 'Compute {{a}} - {{b}}. Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        // a > b always, so the difference is positive (1..888).
        a: { int: { min: 500, max: 999 } },
        b: { int: { min: 111, max: 499 } },
        dd: { expr: 'a - b' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{dd}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'arithmetic', 'fast'],
    forgiveFormatting: true,
  },
  {
    id: 'math-gcd-pair',
    input:
      'What is the greatest common divisor of {{x}} and {{y}}? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        // Each row hand-verified: gcd(12,18)=6, gcd(24,36)=12, gcd(21,14)=7,
        // gcd(45,60)=15, gcd(16,40)=8, gcd(27,18)=9.
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        x: { expr: '[12, 24, 21, 45, 16, 27][idx]' },
        y: { expr: '[18, 36, 14, 60, 40, 18][idx]' },
        ans: { expr: '[6, 12, 7, 15, 8, 9][idx]' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math'],
    forgiveFormatting: true,
  },
  {
    id: 'math-perfect-square-root',
    input:
      'What is the positive square root of {{sq}}? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        // sq = n^2 (121..625) is a perfect square by construction.
        n: { int: { min: 11, max: 25 } },
        sq: { expr: 'n * n' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{n}}\\s*$' },
    weight: 1,
    tags: ['reasoning', 'math', 'fast'],
    forgiveFormatting: true,
  },
];
