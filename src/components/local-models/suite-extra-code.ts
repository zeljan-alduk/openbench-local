/**
 * Extra code-focused cases for the local-model-rating suite:
 * predict-output traces (loops · recursion · off-by-one), spot-the-bug,
 * Big-O, SQL result prediction, regex behavior, short-circuit /
 * precedence gotchas, mutable-default / closure traps, string-method
 * semantics, exception prediction, JS coercion, and language ID of
 * short obscure snippets.
 *
 * Authored from docs/design/cases-code.md (20 specs, all review fixes
 * applied) plus the non-overlapping rows of docs/design/
 * suite-expansion.md §2.1. Every parameterized trace's answer formula
 * was hand-verified over its full sampling range. `forgiveFormatting`
 * is set per-case inline here (this file does not pass through
 * builtin-suite.ts's FORGIVE_FORMATTING_IDS set).
 */

import type { InlineCase } from './builtin-suite';

export const SUITE_EXTRA_CODE: readonly InlineCase[] = [
  // ── Predict-output traces: loops / recursion / off-by-one ─────────

  {
    id: 'code-trace-while-halving',
    input:
      'What does this Python program print?\n\nx = {{n}}\ncount = 0\nwhile x > 1:\n    x = x // 2\n    count += 1\nprint(count)\n\nReply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        n: { int: { min: 5, max: 60 } },
        // floor(log2(n)) over 5–60 via chained ternary — hand-verified:
        // 5–7→2, 8–15→3, 16–31→4, 32–60→5.
        c: { expr: 'n > 31 ? 5 : n > 15 ? 4 : n > 7 ? 3 : 2' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{c}}\\s*$' },
    weight: 1,
    tags: ['code', 'reasoning'],
    forgiveFormatting: true,
  },
  {
    id: 'code-trace-loop-continue',
    input:
      'What does this Python program print?\n\ntotal = 0\nfor i in range({{n}}):\n    if i == {{k}}:\n        continue\n    total += i\nprint(total)\n\nReply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        n: { int: { min: 6, max: 9 } },
        // k ≤ 5 < 6 ≤ n, so the skipped value is always inside the range.
        k: { int: { min: 1, max: 5 } },
        ans: { expr: 'n * (n - 1) / 2 - k' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['code', 'reasoning', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'code-trace-recursion-fib',
    input:
      'def f(n):\n    if n < 2:\n        return n\n    return f(n-1) + f(n-2)\n\nWhat does f({{n}}) return? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        n: { int: { min: 6, max: 10 } },
        // Fibonacci with F0=0, F1=1 — lookup indexed by n; f(6)=8 … f(10)=55.
        ans: { expr: '[0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55][n]' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['code', 'reasoning'],
    forgiveFormatting: true,
  },
  {
    id: 'code-trace-range-last',
    input:
      'What is the LAST value this Python loop prints?\n\nfor i in range({{a}}, {{b}}):\n    print(i)\n\nReply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        a: { int: { min: 2, max: 9 } },
        d: { int: { min: 4, max: 12 } },
        b: { expr: 'a + d' },
        // range excludes the stop value — off-by-one trap is answering b.
        last: { expr: 'a + d - 1' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{last}}\\s*$' },
    weight: 1,
    tags: ['code', 'reasoning', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'code-trace-sum-range',
    input:
      'What does this Python program print?\n\ntotal = 0\nfor i in range({{n}}):\n    total += i\nprint(total)\n\nReply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        n: { int: { min: 5, max: 12 } },
        // sum 0..n-1 = n(n-1)/2, always an integer for consecutive n.
        ans: { expr: 'n * (n - 1) / 2' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['code', 'reasoning'],
    forgiveFormatting: true,
  },
  {
    id: 'code-trace-recursion-fact',
    input:
      'What does this Python program print?\n\ndef f(n):\n    return 1 if n <= 1 else n * f(n - 1)\n\nprint(f({{n}}))\n\nReply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        n: { int: { min: 4, max: 7 } },
        // Factorial lookup indexed by n: 4!=24 … 7!=5040.
        ans: { expr: '[1, 1, 2, 6, 24, 120, 720, 5040][n]' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['code', 'reasoning'],
    forgiveFormatting: true,
  },
  {
    id: 'code-trace-list-length',
    input:
      'What does this Python program print?\n\nxs = [0] * {{n}}\nxs.append(1)\nxs.pop()\nxs.append(2)\nxs.append(3)\nprint(len(xs))\n\nReply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        n: { int: { min: 3, max: 9 } },
        // n +1 (append) −1 (pop) +1 +1 = n+2.
        ans: { expr: 'n + 2' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['code', 'reasoning', 'fast'],
    forgiveFormatting: true,
  },
  {
    id: 'code-trace-ternary',
    input:
      "What does this Python line print?\n\nprint('yes' if {{a}} > {{b}} else 'no')\n\nReply with ONLY the printed word, no commentary.",
    generate: {
      vars: {
        a: { int: { min: 1, max: 20 } },
        b: { int: { min: 1, max: 20 } },
        // a == b falls to the else branch: strictly-greater comparison.
        ans: { expr: "a > b ? 'yes' : 'no'" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['code', 'reasoning', 'fast'],
    forgiveFormatting: true,
  },

  // ── Short-circuit & operator-precedence gotchas ────────────────────

  {
    id: 'code-trace-shortcircuit',
    input:
      'What does this Python line print?\n\nprint(0 or {{x}})\n\nReply with ONLY the printed value, no commentary.',
    generate: {
      vars: { x: { int: { min: 2, max: 9 } } },
    },
    // `or` returns the first truthy operand — the value x, not True.
    expect: { kind: 'regex', value: '^\\s*{{x}}\\s*$' },
    weight: 1,
    tags: ['code', 'reasoning', 'gotcha', 'fast'],
    forgiveFormatting: true,
  },
  {
    id: 'code-trace-and-value',
    input:
      'What does this Python line print?\n\nprint({{x}} and {{y}})\n\nReply with ONLY the printed value, no commentary.',
    generate: {
      vars: {
        x: { int: { min: 2, max: 9 } },
        y: { int: { min: 11, max: 99 } },
      },
    },
    // `and` returns the LAST operand when the first is truthy — y, not True.
    expect: { kind: 'regex', value: '^\\s*{{y}}\\s*$' },
    weight: 1,
    tags: ['code', 'reasoning', 'gotcha', 'fast'],
    forgiveFormatting: true,
  },
  {
    id: 'code-precedence-unary-minus-pow',
    input:
      'What does this Python expression evaluate to?\n\n-{{a}} ** 2\n\nReply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        a: { int: { min: 2, max: 9 } },
        q: { expr: 'a * a' },
      },
    },
    // ** binds tighter than unary minus → -(a²). The minus is a fixed
    // literal in the pattern; only the positive number q is substituted.
    expect: { kind: 'regex', value: '^\\s*-{{q}}\\s*$' },
    weight: 1,
    tags: ['code', 'reasoning', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'code-precedence-shift-add',
    input:
      'What does this Python expression evaluate to?\n\n1 << {{k}} + 1\n\nReply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        k: { int: { min: 2, max: 6 } },
        // + binds tighter than << → 1 << (k+1) = 2^(k+1). The trap
        // (1<<k)+1 differs for every k in range (8 vs 5 … 128 vs 65).
        ans: { expr: 'Math.pow(2, k + 1)' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['code', 'reasoning', 'gotcha'],
    forgiveFormatting: true,
  },

  // ── Mutable-default / closure / aliasing traps ─────────────────────

  {
    id: 'code-trace-mutable-default',
    input:
      'What does this Python program print?\n\ndef f(item, box=[]):\n    box.append(item)\n    return len(box)\n\nfor i in range({{k}}):\n    f(i)\nprint(f({{k}}))\n\nReply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        k: { pick: [3, 4, 5, 6] },
        // The default list is created ONCE and shared: the loop makes k
        // calls, the printed call is the (k+1)-th. Traps: 1 (fresh-list
        // misconception) and k (echoing the prompt's salient number).
        ans: { expr: 'k + 1' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['code', 'reasoning', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'code-trace-closure-late-binding',
    input:
      'What does this Python program print?\n\nfuncs = [lambda: i for i in range({{n}})]\nprint(funcs[0]())\n\nReply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        n: { int: { min: 4, max: 9 } },
        // Every lambda closes over the SAME i (late binding); after the
        // comprehension finishes, i = n-1. Trap: 0.
        m: { expr: 'n - 1' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{m}}\\s*$' },
    weight: 1,
    tags: ['code', 'reasoning', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'code-trace-tuple-swap',
    input:
      'What does this Python program print?\n\na, b = {{a}}, {{b}}\na, b = b, a + b\nprint(a, b)\n\nReply with ONLY the two printed numbers separated by a single space, no commentary.',
    generate: {
      vars: {
        // Disjoint ranges guarantee a ≠ b, so the sequential-evaluation
        // trap value (b 2b) always differs from the correct (b a+b).
        a: { int: { min: 3, max: 9 } },
        b: { int: { min: 10, max: 20 } },
        s: { expr: 'a + b' },
      },
    },
    // Tuple assignment evaluates the right side with OLD values.
    expect: { kind: 'regex', value: '^\\s*{{b}}\\s+{{s}}\\s*$' },
    weight: 1,
    tags: ['code', 'reasoning', 'gotcha'],
    forgiveFormatting: true,
  },

  // ── String-method semantics ────────────────────────────────────────

  {
    id: 'code-trace-string-slice',
    input:
      "In Python, what does '{{w}}'[{{i}}:{{j}}] evaluate to? Reply with ONLY the resulting substring, no quotes, no commentary.",
    generate: {
      vars: {
        w: { pick: ['benchmark', 'keyboard', 'elephant', 'umbrella', 'chocolate'] },
        i: { int: { min: 1, max: 3 } },
        j: { expr: 'i + 3' },
        // Python s[i:j] == JS slice(i, j) here: 0 ≤ i < j ≤ 6 ≤ len(w).
        ans: { expr: 'w.slice(i, j)' },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['code', 'reasoning', 'character-level'],
  },
  {
    id: 'code-string-split-count',
    input:
      "In Python, how many elements does '{{s}}'.split('-') return? Reply with ONLY the integer, no commentary.",
    generate: {
      vars: {
        s: { pick: ['a-b-c', 'x-y', 'one-two-three-four', 'red-green-blue', 'a-b-c-d-e'] },
        // separators + 1: 'a-b-c'→3, 'x-y'→2, 'one-two-three-four'→4,
        // 'red-green-blue'→3, 'a-b-c-d-e'→5 (hand-verified).
        ans: { expr: "count(s, '-') + 1" },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['code', 'reasoning', 'character-level'],
    forgiveFormatting: true,
  },

  // ── Integer division / modulo semantics ────────────────────────────

  {
    id: 'code-python-int-division',
    input:
      'What does {{a}} // {{b}} evaluate to in Python? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        a: { int: { min: 17, max: 99 } },
        b: { int: { min: 2, max: 9 } },
        // Python // on positives is floor division.
        ans: { expr: 'floor(a / b)' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['code', 'reasoning', 'arithmetic'],
    forgiveFormatting: true,
  },
  {
    id: 'code-python-negative-modulo',
    input:
      'What does -7 % 3 evaluate to in Python? Reply with ONLY the integer, no commentary.',
    // Python's % takes the sign of the divisor: -7 % 3 == 2 (not -1).
    expect: { kind: 'regex', value: '^\\s*2\\s*$' },
    weight: 1,
    tags: ['code', 'reasoning', 'gotcha'],
    forgiveFormatting: true,
  },

  // ── JS gotchas: coercion, typeof null ──────────────────────────────

  {
    id: 'code-trace-js-coercion',
    input:
      'What does this JavaScript line print to the console?\n\nconsole.log({{snip}})\n\nReply with ONLY the printed value, no quotes, no commentary.',
    generate: {
      vars: {
        x: { int: { min: 2, max: 9 } },
        y: { int: { min: 2, max: 9 } },
        idx: { pick: [0, 1, 2, 3, 4] },
        // Operand digits are generated per run; idx picks only the
        // operator/operand shape, so no row is a memorized fixed literal.
        snip: {
          expr:
            "[`'${x}' + ${y}`, `'${x}' - ${y}`, `'${x}' * '${y}'`, `${x} + '${y}'`, `${x * 2 + y} - '${y}'`][idx]",
        },
        // Per row: 0 concat "xy"; 1 numeric x−y; 2 numeric x·y;
        // 3 concat "xy"; 4 numeric 2x. Trap distinctness holds over the
        // full ranges: concat answers are 2-digit ≥22 vs sums ≤18;
        // x·y = 10x+y has no solution with x,y ∈ 2..9.
        ans: {
          expr: "['' + x + y, String(x - y), String(x * y), '' + x + y, String(x * 2)][idx]",
        },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['code', 'reasoning', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'code-js-typeof-null',
    input:
      'In JavaScript, what does typeof null evaluate to? Reply with ONLY the value, no quotes, no commentary.',
    expect: { kind: 'regex', value: '^\\s*object\\s*$' },
    weight: 1,
    tags: ['code', 'gotcha', 'fact', 'fast'],
    forgiveFormatting: true,
  },

  // ── Exception prediction ───────────────────────────────────────────

  {
    id: 'code-predict-exception',
    input:
      'What exception type does running this Python code raise?\n\n{{snip}}\n\nReply with ONLY the exception class name (e.g. ValueError), no commentary.',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        snip: {
          expr: `['[1, 2, 3][5]', "{'a': 1}['b']", "int('hello')", 'len(42)', 'print(undefined_variable)', '1 / 0'][idx]`,
        },
        // Each row raises exactly one canonical exception (hand-verified).
        ans: {
          expr: "['IndexError', 'KeyError', 'ValueError', 'TypeError', 'NameError', 'ZeroDivisionError'][idx]",
        },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['code', 'reasoning'],
    forgiveFormatting: true,
  },

  // ── Spot the bug line / fix / generate ─────────────────────────────

  {
    id: 'code-spot-bug-line',
    input:
      'Exactly one line of this Python function has a logic bug. Reply with ONLY the line number (the number before the colon), no commentary.\n\n{{snip}}',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3] },
        // Each snippet has exactly one branch that contradicts the
        // function's name (hand-verified): is_even returns True twice
        // (bug line 5), is_negative returns False for n<0 (line 3),
        // absolute returns n for n<0 (line 3), maximum returns a twice
        // (line 5).
        snip: {
          expr: `['1: def is_even(n):\\n2:     if n % 2 == 0:\\n3:         return True\\n4:     else:\\n5:         return True', '1: def is_negative(n):\\n2:     if n < 0:\\n3:         return False\\n4:     else:\\n5:         return False', '1: def absolute(n):\\n2:     if n < 0:\\n3:         return n\\n4:     else:\\n5:         return n', '1: def maximum(a, b):\\n2:     if a > b:\\n3:         return a\\n4:     else:\\n5:         return a'][idx]`,
        },
        ans: { expr: '[5, 3, 3, 5][idx]' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['code', 'debugging', 'reasoning'],
    forgiveFormatting: true,
  },
  {
    id: 'code-fix-off-by-one',
    input:
      'This Python loop is meant to print the numbers 1 through n INCLUSIVE, but it stops at n-1:\n\nfor i in range(1, n):\n    print(i)\n\nOutput ONLY the corrected range(...) call, nothing else. No commentary.',
    expect: { kind: 'regex', value: 'range\\(\\s*1\\s*,\\s*n\\s*\\+\\s*1\\s*\\)' },
    weight: 1,
    tags: ['code', 'debugging'],
  },
  {
    id: 'code-gen-is-even',
    input:
      'Write a single Python expression that evaluates to True if and only if the integer variable n is even. Reply with ONLY the expression, no commentary.',
    expect: { kind: 'regex', value: '\\(?\\s*n\\s*%\\s*2\\s*\\)?\\s*==\\s*0' },
    acceptWithRemark: [
      { kind: 'contains', value: 'not n % 2', remark: 'truthiness variant (not n % 2)' },
    ],
    weight: 1,
    tags: ['code', 'fast'],
  },

  // ── Big-O ──────────────────────────────────────────────────────────

  {
    id: 'code-big-o-single-loop',
    input:
      'What is the time complexity of this snippet?\n\nfor i in range(n):\n    total += i\n\nReply with Big-O notation only, e.g. O(n log n). No commentary.',
    expect: { kind: 'regex', value: '^\\s*O\\(\\s*n\\s*\\)\\s*$' },
    weight: 1,
    tags: ['code', 'reasoning', 'fast'],
    forgiveFormatting: true,
  },
  {
    id: 'code-big-o-sequential-loops',
    input:
      'What is the time complexity of this snippet?\n\nfor i in range(n):\n    a += i\nfor j in range(n):\n    b += j\n\nReply with Big-O notation only, e.g. O(n log n). No commentary.',
    // Two SEQUENTIAL (not nested) loops → O(n). Trap: O(n^2).
    expect: { kind: 'regex', value: '^\\s*O\\(\\s*n\\s*\\)\\s*$' },
    acceptWithRemark: [
      {
        kind: 'regex',
        value: '^\\s*O\\(\\s*2\\s*\\*?\\s*n\\s*\\)\\s*$',
        remark: 'gave unsimplified O(2n)',
      },
    ],
    weight: 1,
    tags: ['code', 'reasoning', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'code-big-o-triple-nested',
    input:
      'What is the time complexity of this snippet?\n\nfor i in range(n):\n    for j in range(n):\n        for k in range(n):\n            total += i * j * k\n\nReply with Big-O notation only, e.g. O(n). No commentary.',
    expect: {
      kind: 'regex',
      value: '^\\s*O\\(\\s*n\\s*(?:\\^\\s*3|\\*\\*\\s*3|³)\\s*\\)\\s*$',
    },
    weight: 1,
    tags: ['code', 'reasoning'],
    forgiveFormatting: true,
  },
  {
    id: 'code-big-o-binary-search',
    input:
      'What is the time complexity of binary search on a sorted array of n elements? Reply with Big-O notation only, e.g. O(n). No commentary.',
    expect: {
      kind: 'regex',
      value: '^\\s*O\\(\\s*log_?2?\\s*\\(?\\s*n\\s*\\)?\\s*\\)\\s*$',
    },
    weight: 1,
    tags: ['code', 'reasoning'],
    forgiveFormatting: true,
  },

  // ── SQL result prediction (small inline tables) ────────────────────

  {
    id: 'code-sql-sum-where',
    input:
      "Given this table `sales`:\n\n| id | region | amount |\n| 1 | north | {{a1}} |\n| 2 | south | {{b1}} |\n| 3 | north | {{a2}} |\n| 4 | south | {{b2}} |\n| 5 | north | {{a3}} |\n\nWhat single number does this query return?\n\nSELECT SUM(amount) FROM sales WHERE region = 'north';\n\nReply with ONLY the integer, no commentary.",
    generate: {
      vars: {
        a1: { int: { min: 11, max: 99 } },
        a2: { int: { min: 11, max: 99 } },
        a3: { int: { min: 11, max: 99 } },
        b1: { int: { min: 11, max: 99 } },
        b2: { int: { min: 11, max: 99 } },
        s: { expr: 'a1 + a2 + a3' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{s}}\\s*$' },
    weight: 1,
    tags: ['code', 'sql', 'reasoning', 'arithmetic'],
    forgiveFormatting: true,
  },
  {
    id: 'code-sql-count-null',
    input:
      'A table `users` has exactly {{n}} rows. The `email` column is NULL in exactly {{k}} of those rows; every other column contains no NULLs.\n\nWhat single number does this query return?\n\nSELECT COUNT(email) FROM users;\n\nReply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        h: { int: { min: 4, max: 9 } },
        // n = 2h+1 ∈ 9..19, always ODD, so n−k and k have opposite
        // parity: the trap answer k can never equal the true n−k, and
        // n ≠ n−k since k ≥ 2.
        n: { expr: '2 * h + 1' },
        k: { int: { min: 2, max: 6 } },
        // COUNT(column) skips NULLs (unlike COUNT(*)).
        ans: { expr: 'n - k' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['code', 'sql', 'reasoning', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'sql-count-rows-filter',
    input:
      'Given this table `orders`:\n\n| id | amount |\n| 1 | 3 |\n| 2 | 7 |\n| 3 | 12 |\n| 4 | 18 |\n| 5 | 25 |\n\nWhat single number does this query return?\n\nSELECT COUNT(*) FROM orders WHERE amount > {{t}};\n\nReply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        t: { pick: [5, 10, 15, 20] },
        // t=5→4, t=10→3, t=15→2, t=20→1 (hand-verified).
        ans: { expr: '[3, 7, 12, 18, 25].filter((v) => v > t).length' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    weight: 1,
    tags: ['code', 'sql', 'reasoning'],
    forgiveFormatting: true,
  },

  // ── Regex behavior prediction ──────────────────────────────────────

  {
    id: 'code-regex-greedy-match',
    input:
      'Using standard greedy regex matching (e.g. Python re.search), what is the FULL text matched by the pattern ".*" (a double quote, dot-star, double quote) in this string?\n\nsay "{{w1}}" then "{{w2}}" later\n\nReply with ONLY the matched text, including the quote characters. No commentary.',
    generate: {
      vars: {
        w1: { pick: ['hi', 'up', 'go', 'ok'] },
        w2: { pick: ['bye', 'down', 'stop', 'now'] },
        // Greedy .* spans from the FIRST quote to the LAST quote. The
        // inter-quote filler is 'then' (not 'and') so an English
        // enumeration of the two lazy matches can never collide.
        ans: { expr: `'"' + w1 + '" then "' + w2 + '"'` },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    acceptWithRemark: [
      {
        kind: 'contains',
        value: '{{w1}}" then "{{w2}}',
        remark: 'greedy span correct but wrapped in extra formatting',
      },
    ],
    weight: 1,
    tags: ['code', 'regex', 'reasoning', 'gotcha', 'character-level'],
    // Strict on purpose: the exact matched span including quote
    // characters IS the test.
  },
  {
    id: 'code-regex-count-matches',
    input:
      'How many NON-OVERLAPPING matches does the regex pattern aba find in the string below, scanning left to right (like Python re.findall)?\n\n{{s}}\n\nReply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        n: { int: { min: 3, max: 8 } },
        s: { expr: "'ab'.repeat(n) + 'a'" },
        // findall consumes 3 chars per match and resumes after it —
        // matches = ceil(n/2) (hand-verified n=3→2, 4→2, 5→3, 6→3,
        // 7→4, 8→4). Trap: counting overlapping occurrences (n).
        m: { expr: 'ceil(n / 2)' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{m}}\\s*$' },
    weight: 1,
    tags: ['code', 'regex', 'reasoning', 'character-level'],
    forgiveFormatting: true,
  },

  // ── Language identification of short snippets ──────────────────────

  {
    id: 'code-identify-language-obscure',
    input:
      'What programming language is this snippet?\n\n{{snip}}\n\nReply with ONLY the language name, one word, no commentary.',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        // Each row carries an unmistakable language-unique marker. The
        // Prolog row includes a `Y is X + 1` arithmetic goal, which
        // Datalog does not have — 'Datalog' is not a defensible answer.
        snip: {
          expr: `['-module(hello).\\n-export([start/0]).\\nstart() -> io:format("hi~n").', 'likes(mary, wine).\\nplus_one(X, Y) :- Y is X + 1.\\nolder(john, X) :- likes(mary, X).', 'program hello\\n  print *, "hi"\\nend program hello', 'IDENTIFICATION DIVISION.\\nPROGRAM-ID. HELLO.\\nPROCEDURE DIVISION.\\n    DISPLAY "HI".', 'defmodule Hello do\\n  def hi do\\n    IO.puts("hi")\\n  end\\nend', 'local function greet(name)\\n  print("hi " .. name)\\nend'][idx]`,
        },
        ans: {
          expr: "['Erlang', 'Prolog', 'Fortran', 'COBOL', 'Elixir', 'Lua'][idx]",
        },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['code', 'classification'],
    forgiveFormatting: true,
  },
  {
    id: 'code-identify-language-variants',
    input:
      'What programming language is this snippet?\n\n{{snip}}\n\nReply with ONLY the language name, one word, no commentary.',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4] },
        snip: {
          expr: `['def greet(name)\\n  puts "hi #{name}"\\nend', 'package main\\n\\nimport "fmt"\\n\\nfunc main() {\\n    fmt.Println("hi")\\n}', '<?php\\necho "hi";\\n?>', 'fun main() {\\n    println("hi")\\n}', 'main :: IO ()\\nmain = putStrLn "hi"'][idx]`,
        },
        ans: { expr: "['Ruby', 'Go', 'PHP', 'Kotlin', 'Haskell'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['code', 'classification'],
    forgiveFormatting: true,
  },
];
