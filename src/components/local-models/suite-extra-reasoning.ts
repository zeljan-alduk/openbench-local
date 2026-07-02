/**
 * Extra reasoning / logic / gotcha / tracking / calendar cases for the
 * local-model-rating suite. Authored from the revised inventory in
 * docs/design/cases-reasoning-logic-gotcha.md (25 cases, all critique
 * fixes applied) plus the reasoning/logic/gotcha/commonsense/tracking
 * rows of docs/design/suite-expansion.md (15 more, undeclared-identifier
 * exprs rewritten as inline array literals per that doc's critique).
 *
 * 40 single-turn cases, 34 parameterized (85%) — fresh 2025-26 gotchas
 * (counterfactual inversions of famous riddles), premise-order and
 * negation traps, AIW-style sibling problems, object tracking,
 * syllogisms with content-belief conflict, calendar/date math, and
 * knights-and-knaves. No vision, no tools; every case has exactly one
 * deterministic answer. Ids verified non-colliding with builtin-suite.ts.
 */

import type { InlineCase } from './builtin-suite';

export const SUITE_EXTRA_REASONING: readonly InlineCase[] = [
  // ── Fresh gotchas: counterfactual inversions of memorized riddles ──
  {
    id: 'gotcha-carwash-walk-or-drive',
    input:
      'You want to get your car washed. The car wash is {{d}} meters from your house. Should you WALK or DRIVE there to get your car washed? Reply with ONLY one word: WALK or DRIVE.',
    generate: {
      vars: {
        // Kills the memorized viral '100m' instance; answer invariant in d —
        // the car must be present to be washed.
        d: { pick: [50, 80, 100, 150, 200, 250, 400] },
      },
    },
    expect: { kind: 'regex', value: '^DRIVE$' },
    weight: 1,
    tags: ['reasoning', 'commonsense', 'gotcha', 'fast'],
    forgiveFormatting: true,
  },
  {
    id: 'gotcha-surgeon-riddle-inverted',
    input:
      'A {{child}} and {{pron}} {{deceased}} are in a car crash; the {{deceased}} dies. At the hospital the surgeon — one of the {{child}}\'s two parents (the {{child}} has exactly one mother and one father) — says: "I cannot operate, this is my child." Which parent is the surgeon? Reply with ONLY one word: mother or father.',
    generate: {
      vars: {
        // The memorized 'mother' answer stays in as two rows so the pattern
        // cannot be gamed by a blanket answer. The exactly-one-mother-one-
        // father parenthetical closes the same-sex-parents loophole.
        idx: { pick: [0, 1, 2, 3] },
        deceased: { expr: "['mother','father','mother','father'][idx]" },
        child: { expr: "['son','son','daughter','daughter'][idx]" },
        pron: { expr: "['his','his','her','her'][idx]" },
        ans: { expr: "['father','mother','father','mother'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'logic', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'gotcha-river-crossing-trivial',
    input:
      'A {{person}} and a {{animal}} are on one side of a river. Their boat carries the {{person}} and one animal at once. Nothing eats anything, and nothing else needs to cross. What is the MINIMUM number of one-way boat crossings for both to reach the other side? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        // Cosmetic re-randomization; the memorized artifact is the
        // wolf-goat-cabbage 7-crossing schedule. Both fit in one trip.
        person: { pick: ['farmer', 'shepherd', 'woman', 'man'] },
        animal: { pick: ['goat', 'sheep', 'dog', 'calf'] },
      },
    },
    expect: { kind: 'regex', value: '^1$' },
    weight: 1,
    tags: ['reasoning', 'logic', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'gotcha-trolley-already-dead',
    input:
      'A runaway trolley is heading toward {{n}} people who are ALREADY DEAD. You can pull a lever to divert it to a side track where 1 LIVING person is tied down. To avoid harming any living person, should you pull the lever? Reply with ONLY one word: YES or NO.',
    generate: {
      vars: {
        // Re-randomizes the memorized 'five'; answer invariant — diverting
        // kills the only living person.
        n: { int: { min: 3, max: 9 } },
      },
    },
    expect: { kind: 'regex', value: '^NO$' },
    weight: 1,
    tags: ['reasoning', 'logic', 'gotcha', 'commonsense'],
    forgiveFormatting: true,
  },
  {
    id: 'gotcha-dead-cat-probability',
    input:
      'A DEAD cat is placed into a box together with a radioactive isotope, a vial of poison, and a radiation detector that shatters the vial if it detects decay. The box is opened {{h}} hours later. What is the probability that the cat is alive, as an integer percent? Reply with ONLY the integer, no % sign, no commentary.',
    generate: {
      vars: {
        // Irrelevant variable defeats verbatim recall of the Schrödinger
        // boilerplate ('50'). Cat was dead going in → 0.
        h: { int: { min: 1, max: 48 } },
      },
    },
    expect: { kind: 'regex', value: '^0$' },
    acceptWithRemark: [
      { kind: 'regex', value: '^0\\s*%$', remark: 'appended a percent sign' },
    ],
    weight: 1,
    tags: ['reasoning', 'probability', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'gotcha-jug-possible',
    input:
      'You have an unlimited water supply, a {{a}}-liter jug and a {{b}}-liter jug, no other containers and no markings. Is it possible to measure out EXACTLY {{c}} liters? Reply with ONLY one word: YES or NO.',
    generate: {
      vars: {
        // Measurable iff c is a multiple of gcd(a,b) (and <= a+b). Rows
        // hand-verified: gcd(6,12)=6 → 6 YES / 4 NO; gcd(4,8)=4 → 4 YES /
        // 6 NO; gcd(5,10)=5 → 5 YES / 3 NO. Kills the memorized die-hard
        // pour-sequence hallucination.
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        a: { expr: '[6,6,4,4,5,5][idx]' },
        b: { expr: '[12,12,8,8,10,10][idx]' },
        c: { expr: '[6,4,4,6,5,3][idx]' },
        ans: { expr: "['YES','NO','YES','NO','YES','NO'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'math', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'gotcha-monty-hall-transparent',
    input:
      'You are on a game show with three TRANSPARENT glass doors. You can clearly see the car behind door {{d}} and goats behind the other two. You pick door {{d}}. The host opens one of the goat doors and offers you the chance to switch to the remaining door. To maximize your chance of winning the car, should you switch? Reply with ONLY one word: YES or NO.',
    generate: {
      vars: {
        // Answer invariant; you already picked the visible car, so switching
        // loses with certainty — inversion of the memorized 'always switch'.
        d: { pick: [1, 2, 3] },
      },
    },
    expect: { kind: 'regex', value: '^NO$' },
    weight: 1,
    tags: ['reasoning', 'probability', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'gotcha-months-exactly-28',
    input:
      'How many months of the year {{year}} have EXACTLY 28 days (not 29, not more)? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        // Non-leap year → only February → 1; leap year (2020, 2024) → 0.
        // The memorized riddle answer '12' is always wrong; leap rows also
        // defeat a memorized blanket '1'.
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        year: { expr: '[2019,2020,2022,2024,2025,2026][idx]' },
        ans: { expr: '[1,0,1,0,1,1][idx]' },
      },
    },
    expect: { kind: 'regex', value: '^{{ans}}$' },
    weight: 1,
    tags: ['reasoning', 'fact', 'gotcha', 'fast'],
    forgiveFormatting: true,
  },
  {
    id: 'gotcha-kg-vs-pound',
    input:
      'Which is heavier: {{qa}} of feathers or {{qb}} of steel? Reply with ONLY one word: FEATHERS, STEEL, or SAME.',
    generate: {
      vars: {
        // In pounds (1 kg = 2.205 lb, no near-ties): 2.2 vs 1 → FEATHERS;
        // 1 vs 2.2 → STEEL; 4.41 vs 3 → FEATHERS; 2.2 vs 3 → STEEL;
        // 2 vs 2 → SAME. The SAME row keeps the memorized pound-of-X
        // pattern from being blanket-wrong OR blanket-right.
        idx: { pick: [0, 1, 2, 3, 4] },
        qa: {
          expr:
            "['1 kilogram','1 pound','2 kilograms','1 kilogram','2 pounds'][idx]",
        },
        qb: {
          expr:
            "['1 pound','1 kilogram','3 pounds','3 pounds','2 pounds'][idx]",
        },
        ans: { expr: "['FEATHERS','STEEL','FEATHERS','STEEL','SAME'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'commonsense', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'gotcha-linear-lotus-half',
    input:
      'A pond gains EXACTLY {{s}} new lotus flowers every day (linear growth, not doubling). On day {{n}} it is completely covered with {{tot}} flowers. On which day was it exactly HALF covered? Reply with ONLY the integer day number, no commentary.',
    generate: {
      vars: {
        // Flowers on day d = s*d, so half of s*n is reached at d = n/2
        // (n even → integer). The memorized CRT lily-pad answer n-1 is
        // always wrong — linear inversion of gotcha-crt-lily-pad.
        s: { pick: [2, 3, 4, 5] },
        n: { pick: [20, 30, 40, 48] },
        tot: { expr: 's*n' },
        half: { expr: 'n/2' },
      },
    },
    expect: { kind: 'regex', value: '^{{half}}$' },
    weight: 1,
    tags: ['reasoning', 'math', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'gotcha-crt-bat-ball-inverted',
    input:
      'A pencil and an eraser cost ${{total}} in total. The pencil costs ${{diff}} LESS than the eraser. How much does the ERASER cost, in cents? Reply with ONLY the integer number of cents, no commentary.',
    generate: {
      vars: {
        // Mirrors gotcha-crt-bat-ball machinery but asks for the EXPENSIVE
        // item: eraser = (totalCents + diffCents)/2 = pencil + 100. The
        // memorized CRT reflex produces the cheap-item value, always wrong.
        pencil: { int: { min: 3, max: 20 } },
        diffCents: { pick: [100] },
        eraserCents: { expr: 'pencil + diffCents' },
        total: { expr: '((2 * pencil + diffCents) / 100).toFixed(2)' },
        diff: { expr: '(diffCents / 100).toFixed(2)' },
      },
    },
    expect: { kind: 'regex', value: '^{{eraserCents}}$' },
    weight: 1,
    tags: ['reasoning', 'math', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'gotcha-widgets-double-ratio',
    input:
      'It takes {{m}} machines {{t}} minutes to make {{m}} widgets. How many minutes would it take {{m2}} machines to make {{w}} widgets? Reply with ONLY the integer number of minutes, no commentary.',
    generate: {
      vars: {
        // Each machine makes 1 widget per t minutes → m2 machines need 2t
        // minutes for 2*m2 widgets. Both the memorized CRT answer ('same t')
        // and linear scaling are always wrong because the widgets-per-
        // machine ratio is doubled (unlike gotcha-crt-widgets).
        m: { pick: [5, 6, 8, 10] },
        t: { pick: [4, 6, 10] },
        m2: { int: { min: 20, max: 90, step: 10 } },
        w: { expr: '2*m2' },
        ans: { expr: '2*t' },
      },
    },
    expect: { kind: 'regex', value: '^{{ans}}$' },
    weight: 1,
    tags: ['reasoning', 'math', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'gotcha-hanoi-trivial',
    input:
      'You have a Tower of Hanoi puzzle with exactly {{n}} disk(s) and three pegs. Following the standard rules (move one disk at a time; never place a larger disk on a smaller one), what is the MINIMUM number of moves to transfer all disks from the first peg to the third peg? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        // Trivialized instances only (unpuzzle style): 2^n - 1 → 1 or 3,
        // so the memorized 3-disk answer '7' is always wrong.
        n: { pick: [1, 2] },
        ans: { expr: 'Math.pow(2, n) - 1' },
      },
    },
    expect: { kind: 'regex', value: '^{{ans}}$' },
    weight: 1,
    tags: ['reasoning', 'logic', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'gotcha-counterfactual-week',
    input:
      'For this question ONLY, assume a week has exactly {{w}} days (not 7). How many days are in {{k}} such weeks? Reply with ONLY the integer, no commentary.',
    generate: {
      vars: {
        // Counterfactual premise must override world knowledge → w*k. w is
        // never 7, so the parametric-knowledge answer 7*k never collides.
        w: { pick: [5, 6, 8, 9] },
        k: { int: { min: 3, max: 12 } },
        ans: { expr: 'w * k' },
      },
    },
    expect: { kind: 'regex', value: '^{{ans}}$' },
    weight: 1,
    tags: ['reasoning', 'math', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'gotcha-seahorse-emoji',
    input:
      'Does the official Unicode emoji set include a seahorse emoji? Reply with ONLY one word: YES or NO.',
    // Viral 2025 gotcha: models insist a seahorse emoji exists and emit a
    // lookalike; Unicode has never encoded one.
    expect: { kind: 'regex', value: '^NO$' },
    weight: 1,
    tags: ['world-knowledge', 'fact', 'gotcha', 'fast'],
    forgiveFormatting: true,
  },

  // ── AIW-style sibling problems ─────────────────────────────────────
  {
    id: 'gotcha-aiw-sister-brothers',
    input:
      "{{name}} has {{s}} sisters and she also has {{b}} brothers. How many brothers does {{name}}'s sister have? Reply with ONLY the integer, no commentary.",
    generate: {
      vars: {
        // Any sister of the female protagonist has exactly the same {{b}}
        // brothers — the answer is UNCHANGED (control variant): the famous
        // +1 reflex (and answering s) always fails here.
        idx: { pick: [0, 1, 2, 3, 4] },
        name: { expr: "['Nora','Priya','Lena','Amara','Sofia'][idx]" },
        s: { int: { min: 2, max: 6 } },
        b: { int: { min: 1, max: 5 } },
      },
    },
    expect: { kind: 'regex', value: '^{{b}}$' },
    weight: 1,
    tags: ['reasoning', 'logic', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'gotcha-aiw-brothers',
    input:
      "{{name}} has {{s}} sisters and he also has {{b}} brothers. How many brothers does {{name}}'s sister have? Reply with ONLY the integer, no commentary.",
    generate: {
      vars: {
        // Male protagonist: a sister's brothers = his {{b}} brothers plus
        // himself → b+1. Mirror of gotcha-aiw-siblings on the other axis.
        idx: { pick: [0, 1, 2, 3, 4] },
        name: { expr: "['Bob','Tomas','Ravi','Denis','Marco'][idx]" },
        s: { int: { min: 2, max: 6 } },
        b: { int: { min: 1, max: 5 } },
        ans: { expr: 'b + 1' },
      },
    },
    expect: { kind: 'regex', value: '^{{ans}}$' },
    weight: 1,
    tags: ['reasoning', 'logic', 'gotcha'],
    forgiveFormatting: true,
  },

  // ── Premise-order, negation, and fallacy traps ─────────────────────
  {
    id: 'logic-premise-order-shuffled',
    input:
      'Use all three facts. Fact 1: {{p3}} finished the race before {{p4}}. Fact 2: {{p1}} finished the race before {{p2}}. Fact 3: {{p2}} finished the race before {{p3}}. Who finished LAST? Reply with ONLY the name, no commentary.',
    generate: {
      vars: {
        // Chain is p1<p2<p3<p4 but the facts are deliberately given OUT of
        // proof order — premise-order sensitivity trap (arXiv:2402.08939).
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        p1: { expr: "['Otto','Mira','Sana','Bram','Kira','Levy'][idx]" },
        p2: { expr: "['Jade','Theo','Ravi','Nell','Omar','Isla'][idx]" },
        p3: { expr: "['Finn','Vera','Kofi','Tessa','Yuki','Dario'][idx]" },
        p4: { expr: "['Ada','Nico','Zola','Hugo','Pia','Wren'][idx]" },
        ans: { expr: 'p4' },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'logic'],
    forgiveFormatting: true,
  },
  {
    id: 'logic-double-negation-compare',
    input:
      "Consider the statement: 'It is not the case that {{n}} is not greater than {{t}}.' Is this statement TRUE or FALSE? Reply with ONLY one word: TRUE or FALSE.",
    generate: {
      vars: {
        // Double negation cancels → statement ≡ (n > t); delta ≠ 0
        // guarantees decidability, and its mixed sign defeats both blanket
        // answers and the keyword heuristic ('not' → FALSE).
        n: { int: { min: 10, max: 50 } },
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        delta: { expr: '[-9,-4,-2,3,6,11][idx]' },
        t: { expr: 'n + delta' },
        ans: { expr: "n > t ? 'TRUE' : 'FALSE'" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'logic'],
    forgiveFormatting: true,
  },
  {
    id: 'logic-negation-not-member',
    input:
      'Which of these is NOT {{cat}}? Reply with ONLY the letter.\n(A) {{o1}}\n(B) {{o2}}\n(C) {{o3}}\n(D) {{o4}}',
    generate: {
      vars: {
        // One non-member per row, hand-verified (carrot, eagle, Oxygen,
        // trout, mango, granite); the correct letter's position rotates so
        // negation-blind and position-biased models both fail.
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        cat: {
          expr:
            "['a fruit','a mammal','a programming language','a bird','a vegetable','a metal'][idx]",
        },
        o1: { expr: "['apple','whale','Python','trout','spinach','iron'][idx]" },
        o2: {
          expr: "['pear','eagle','Rust','sparrow','broccoli','granite'][idx]",
        },
        o3: { expr: "['carrot','dog','Oxygen','eagle','carrot','copper'][idx]" },
        o4: { expr: "['mango','horse','Java','penguin','mango','zinc'][idx]" },
        ans: { expr: "['C','B','C','A','D','B'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'logic', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'logic-syllogism-belief-conflict',
    input:
      'Premises: (1) {{p1}} (2) {{p2}} Conclusion: {{c}} Assume the premises are true even if they contradict the real world. Is the conclusion logically guaranteed by the premises alone? Reply with ONLY YES or NO, uppercase.',
    generate: {
      vars: {
        // Rows 0/2 are VALID but world-false; rows 1/3 are INVALID but
        // believable (undistributed middle / two-'some' fallacy) — content-
        // belief conflict in both directions defeats belief-driven answers.
        idx: { pick: [0, 1, 2, 3] },
        p1: {
          expr:
            "['All fish can walk.','All roses are plants.','All birds are made of metal.','Some doctors are runners.'][idx]",
        },
        p2: {
          expr:
            "['Salmon are fish.','All tulips are plants.','Penguins are birds.','Some runners are tall.'][idx]",
        },
        c: {
          expr:
            "['Salmon can walk.','Tulips are flowers.','Penguins are made of metal.','Some doctors are tall.'][idx]",
        },
        ans: { expr: "['YES','NO','YES','NO'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'logic', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'logic-contrapositive',
    input:
      'Consider: if P is true then Q is true. You learn that Q is false. What follows about P? Reply with ONLY one word: TRUE, FALSE, or UNKNOWN.',
    expect: { kind: 'regex', value: '^FALSE$' },
    weight: 1,
    tags: ['reasoning', 'logic'],
    forgiveFormatting: true,
  },
  {
    id: 'logic-denying-antecedent',
    input:
      "If it rains, the ground gets wet. It did not rain. Is the conclusion 'the ground is definitely not wet' logically guaranteed? Reply with ONLY one word: YES or NO.",
    expect: { kind: 'regex', value: '^NO$' },
    weight: 1,
    tags: ['reasoning', 'logic', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'logic-negation-quantifier',
    input:
      "Which is the exact logical negation of the statement 'All cats are black'? Reply with ONLY the letter.\n(A) No cats are black.\n(B) At least one cat is not black.\n(C) All cats are white.\n(D) Most cats are not black.",
    expect: { kind: 'regex', value: '^B$' },
    weight: 1,
    tags: ['reasoning', 'logic'],
    forgiveFormatting: true,
  },

  // ── Abstention / false-premise gotchas ─────────────────────────────
  {
    id: 'gotcha-false-premise-year',
    input:
      'In what year did {{person}} invent the {{thing}}? If the question is based on a false premise, reply with ONLY the word NONE, uppercase. Otherwise reply with ONLY the year. No commentary.',
    generate: {
      vars: {
        // Every pairing is a hand-verified false attribution with no
        // defensible year; the failure mode under test is supplying the
        // real inventor's year or a fabricated one.
        idx: { pick: [0, 1, 2, 3, 4] },
        person: {
          expr:
            "['Albert Einstein','Isaac Newton','Charles Darwin','Marie Curie','Nikola Tesla'][idx]",
        },
        thing: {
          expr:
            "['telephone','light bulb','telescope','airplane','sewing machine'][idx]",
        },
      },
    },
    expect: { kind: 'regex', value: '^NONE$' },
    weight: 1,
    tags: ['world-knowledge', 'fact', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'gotcha-abstain-some-apples',
    input:
      '{{name}} put some apples in a basket, then added {{b}} more apples. How many apples are in the basket now? If the answer cannot be determined from the information given, reply with ONLY the word UNKNOWN, uppercase. Otherwise reply with ONLY the integer. No commentary.',
    generate: {
      vars: {
        // 'Some' is never quantified → unanswerable (AbstentionBench
        // failure: models fabricate {{b}} or a nearby integer).
        idx: { pick: [0, 1, 2, 3, 4] },
        name: { expr: "['Maren','Deniz','Kofi','Ines','Talia'][idx]" },
        b: { int: { min: 4, max: 17 } },
      },
    },
    expect: { kind: 'regex', value: '^UNKNOWN$' },
    weight: 1,
    tags: ['reasoning', 'math', 'gotcha'],
    forgiveFormatting: true,
  },

  // ── Object / belief tracking ───────────────────────────────────────
  {
    id: 'tracking-false-belief-location',
    input:
      '{{seq}} Where will {{name1}} FIRST look for the marble: the {{loc1}} or the {{loc2}}? Reply with ONLY the location name, without "the", no commentary.',
    generate: {
      vars: {
        // Sally-Anne false belief: an absent agent's belief points at the
        // ORIGINAL location (rows 0-3 → loc1); a watching agent knows the
        // real location (true-belief CONTROL rows 4-5 → loc2), so a blanket
        // first-mentioned-location heuristic cannot pass.
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        name1: { expr: "['Sara','Anna','Maya','Leo','Nina','Emil'][idx]" },
        loc1: {
          expr:
            "['basket','drawer','red box','cupboard','green bag','suitcase'][idx]",
        },
        loc2: {
          expr:
            "['box','shelf','blue box','fridge','yellow bag','backpack'][idx]",
        },
        seq: {
          expr:
            "['Sara puts a marble in the basket and leaves the room. While Sara is away, Tom moves the marble from the basket to the box. Sara comes back, having no way of knowing what happened while away.','Anna puts a marble in the drawer and leaves the room. While Anna is away, Ben moves the marble from the drawer to the shelf. Anna comes back, having no way of knowing what happened while away.','Maya puts a marble in the red box and leaves the room. While Maya is away, Iris moves the marble from the red box to the blue box. Maya comes back, having no way of knowing what happened while away.','Leo puts a marble in the cupboard and leaves the room. While Leo is away, Zoe moves the marble from the cupboard to the fridge. Leo comes back, having no way of knowing what happened while away.','Nina puts a marble in the green bag and stays in the room, watching everything. In full view of Nina, Owen moves the marble from the green bag to the yellow bag.','Emil puts a marble in the suitcase and stays in the room, watching everything. In full view of Emil, Ruth moves the marble from the suitcase to the backpack.'][idx]",
        },
        ans: {
          expr:
            "['basket','drawer','red box','cupboard','yellow bag','backpack'][idx]",
        },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    // stripWrappers never peels articles, so accept the article variant
    // explicitly (acceptWithRemark values are {{var}}-templated).
    acceptWithRemark: [
      { kind: 'exact', value: 'the {{ans}}', remark: 'included the article' },
    ],
    weight: 1,
    tags: ['reasoning', 'tracking', 'commonsense'],
    forgiveFormatting: true,
  },
  {
    id: 'tracking-pass-chain',
    input:
      '{{seq}} Who is holding the {{obj}} now? Reply with ONLY the name, no commentary.',
    generate: {
      vars: {
        // Final holder precomputed per row (hand-traced; 'back to' hops are
        // the trap). Possession-passing — mechanically distinct from the
        // cup-swap cases.
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        obj: { expr: "['key','coin','badge','pen','map','ring'][idx]" },
        seq: {
          expr:
            "['Ana hands the key to Ben. Ben hands it to Cara. Cara hands it back to Ben.','Milo hands the coin to Ada. Ada hands it to Rex. Rex hands it to Milo.','Tia hands the badge to Uri. Uri hands it back to Tia. Tia hands it to Vic.','Ede hands the pen to Fay. Fay hands it back to Ede. Ede hands it back to Fay.','Gil hands the map to Hana. Hana hands it to Ivo. Ivo hands it back to Hana.','Kaya hands the ring to Liam. Liam hands it to Mona. Mona hands it to Kaya.'][idx]",
        },
        ans: { expr: "['Ben','Milo','Vic','Fay','Hana','Kaya'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'logic', 'tracking'],
    forgiveFormatting: true,
  },
  {
    id: 'logic-cup-swaps-param',
    input:
      'A ball is placed under cup 1. Cups 1, 2, 3 sit in fixed positions. These swaps of cup CONTENTS happen IN ORDER:\n1) Swap cups {{s1}}.\n2) Swap cups {{s2}}.\n3) Swap cups {{s3}}.\n\nWhich cup is the ball under now? Reply with ONLY the cup number, no commentary.',
    generate: {
      vars: {
        // Eight swap-triples with precomputed final cup, each hand-traced
        // from cup 1: r0 1→2→3→1; r1 1→3→3→2; r2 1→1→2→2; r3 1→2→2→3;
        // r4 1→3→2→1; r5 1→1→3→3; r6 1→2→3→2; r7 1→3→1→2.
        idx: { pick: [0, 1, 2, 3, 4, 5, 6, 7] },
        s1: {
          expr:
            "['1 and 2','1 and 3','2 and 3','1 and 2','1 and 3','2 and 3','1 and 2','1 and 3'][idx]",
        },
        s2: {
          expr:
            "['2 and 3','1 and 2','1 and 2','1 and 3','2 and 3','1 and 3','2 and 3','1 and 3'][idx]",
        },
        s3: {
          expr:
            "['1 and 3','2 and 3','1 and 3','2 and 3','1 and 2','1 and 2','2 and 3','1 and 2'][idx]",
        },
        ans: { expr: '[1,2,2,3,1,3,2,2][idx]' },
      },
    },
    expect: { kind: 'regex', value: '^{{ans}}$' },
    weight: 1,
    tags: ['reasoning', 'logic', 'tracking'],
    forgiveFormatting: true,
  },

  // ── Calendar / date math ───────────────────────────────────────────
  {
    id: 'calendar-day-after-feb28',
    input:
      'What is the date of the day immediately after {{year}}-02-28? Reply with ONLY the date in YYYY-MM-DD format, no commentary.',
    generate: {
      vars: {
        // Leap years (2024, 2028) → Feb 29; others → Mar 1. Mixing rows
        // defeats both the blurted 'March 1' reflex and memorization.
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        year: { expr: '[2023,2024,2025,2026,2027,2028][idx]' },
        ans: {
          expr:
            "['2023-03-01','2024-02-29','2025-03-01','2026-03-01','2027-03-01','2028-02-29'][idx]",
        },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'fact', 'gotcha'],
    forgiveFormatting: true,
  },
  {
    id: 'calendar-weekday-days-ago',
    input:
      'If today is {{day}}, what day of the week was it exactly {{k}} days ago? Reply with ONLY the day name, capitalized (e.g. Monday). No commentary.',
    generate: {
      vars: {
        // Backward modular weekday arithmetic — the negative-mod wrap is
        // the trap.
        d: { pick: [0, 1, 2, 3, 4, 5, 6] },
        k: { int: { min: 15, max: 40 } },
        day: {
          expr:
            "['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][d]",
        },
        ans: {
          expr:
            "['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][(((d - k) % 7) + 7) % 7]",
        },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'math', 'arithmetic'],
    forgiveFormatting: true,
  },
  {
    id: 'logic-day-offset',
    input:
      'If tomorrow is {{day}}, what day of the week was yesterday? Reply with ONLY the day name, capitalized. No commentary.',
    generate: {
      vars: {
        // Tomorrow = d → today = d-1 → yesterday = d-2 ≡ d+5 (mod 7).
        // Inline array literals (no external identifiers) per the design
        // critique on evalExpr scoping.
        d: { pick: [0, 1, 2, 3, 4, 5, 6] },
        day: {
          expr:
            "['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][d]",
        },
        ans: {
          expr:
            "['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][(d + 5) % 7]",
        },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'logic'],
    forgiveFormatting: true,
  },

  // ── Knights & knaves, transitivity, seating, ordinals ──────────────
  {
    id: 'logic-knights-or',
    input:
      'On an island every inhabitant is a knight (always tells the truth) or a knave (always lies). {{n1}} says: "I am a knave or {{n2}} is a knight." Is {{n1}} a knight or a knave? Reply with ONLY one word: knight or knave.',
    generate: {
      vars: {
        // Answer invariant (names are surface re-randomization): a knave
        // saying this would make 'I am a knave' true — a knave cannot utter
        // a true disjunction — so the speaker is a knight.
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        n1: { expr: "['Zara','Malik','Petra','Ivo','Sana','Rune'][idx]" },
        n2: { expr: "['Quinn','Elda','Tomas','Greta','Bodhi','Yara'][idx]" },
      },
    },
    expect: { kind: 'regex', value: '^[Kk]night$' },
    weight: 1,
    tags: ['reasoning', 'logic'],
    forgiveFormatting: true,
  },
  {
    id: 'logic-transitive-tallest',
    input:
      '{{p1}} is taller than {{p2}}. {{p2}} is taller than {{p3}}. Who is the SHORTEST of the three? Reply with ONLY the name, no commentary.',
    generate: {
      vars: {
        // Three names, premises in proof order; shortest = p3. (The
        // shuffled four-name variant is logic-premise-order-shuffled.)
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        p1: { expr: "['Marta','Owen','Lucia','Felix','Dara','Sena'][idx]" },
        p2: { expr: "['Ivan','Petra','Marco','Gwen','Ravi','Tomo'][idx]" },
        p3: { expr: "['Elsa','Kian','Nadia','Boris','Lena','Aiko'][idx]" },
        ans: { expr: 'p3' },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'logic'],
    forgiveFormatting: true,
  },
  {
    id: 'logic-seating-middle',
    input:
      'Three friends — {{n1}}, {{n2}}, {{n3}} — sit side by side on a bench. {{c1}} {{c2}} Who sits in the middle? Reply with ONLY the name, no commentary.',
    generate: {
      vars: {
        // Each row's two immediate-neighbor constraints pin a unique order;
        // hand-solved: r0 Ella,Mia,Noah; r1 Kai,Zoe,Liam; r2 Tess,Sam,Ruth;
        // r3 Quin,Pia,Omar; r4 Gus,Hana,Faye; r5 Idris,Jala,Kofi.
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        n1: { expr: "['Mia','Liam','Ruth','Omar','Faye','Idris'][idx]" },
        n2: { expr: "['Noah','Zoe','Sam','Pia','Gus','Jala'][idx]" },
        n3: { expr: "['Ella','Kai','Tess','Quin','Hana','Kofi'][idx]" },
        c1: {
          expr:
            "['Mia sits immediately to the left of Noah.','Zoe sits immediately to the right of Kai.','Tess sits immediately to the left of Sam.','Omar sits immediately to the right of Pia.','Gus sits immediately to the left of Hana.','Jala sits immediately to the right of Idris.'][idx]",
        },
        c2: {
          expr:
            "['Ella sits immediately to the left of Mia.','Liam sits immediately to the right of Zoe.','Sam sits immediately to the left of Ruth.','Pia sits immediately to the right of Quin.','Hana sits immediately to the left of Faye.','Kofi sits immediately to the right of Jala.'][idx]",
        },
        ans: { expr: "['Mia','Zoe','Sam','Pia','Hana','Jala'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'logic'],
    forgiveFormatting: true,
  },
  {
    id: 'logic-race-overtake',
    input:
      'In a race, you overtake the person in 2nd place. What place are you in now? Reply with ONLY the ordinal (e.g. 3rd), no commentary.',
    expect: { kind: 'regex', value: '^2nd$' },
    weight: 1,
    tags: ['reasoning', 'logic', 'gotcha', 'fast'],
    forgiveFormatting: true,
  },
  {
    id: 'logic-family-uncle',
    input:
      "Your father's brother is your what? Reply with ONLY one lowercase word.",
    expect: { kind: 'regex', value: '^[Uu]ncle$' },
    weight: 1,
    tags: ['reasoning', 'logic', 'fast'],
    forgiveFormatting: true,
  },
  {
    id: 'logic-boolean-op-param',
    input:
      'Evaluate this Boolean expression: {{l}} {{op}} {{r}}. Reply with ONLY one word: TRUE or FALSE.',
    generate: {
      vars: {
        // Eight rows incl. XOR and NOT-wrapped operands, hand-evaluated:
        // t&f=F, f|t=T, t^t=F, t^f=T, (!t)|f=F, (!f)&t=T, f^f=F, (!f)|f=T.
        idx: { pick: [0, 1, 2, 3, 4, 5, 6, 7] },
        l: {
          expr:
            "['true','false','true','true','(NOT true)','(NOT false)','false','(NOT false)'][idx]",
        },
        op: {
          expr:
            "['AND','OR','XOR','XOR','OR','AND','XOR','OR'][idx]",
        },
        r: {
          expr:
            "['false','true','true','false','false','true','false','false'][idx]",
        },
        ans: {
          expr:
            "['FALSE','TRUE','FALSE','TRUE','FALSE','TRUE','FALSE','TRUE'][idx]",
        },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'logic', 'fast'],
    forgiveFormatting: true,
  },

  // ── Commonsense reasoning extras ───────────────────────────────────
  // (The round-trip harmonic-mean gotcha lives in suite-extra-math as
  //  math-avg-speed-harmonic — kept once, there.)
  {
    id: 'reasoning-winograd-pronoun',
    input: '{{sent}} {{q}} Reply with ONLY the noun, no commentary.',
    generate: {
      vars: {
        // Curated Winograd pairs (both directions of each schema where
        // possible) with substring-safe answer nouns per row.
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        sent: {
          expr:
            "[\"The trophy doesn't fit in the suitcase because it is too big.\",\"The trophy doesn't fit in the suitcase because it is too small.\",'The city councilmen refused the demonstrators a permit because they feared violence.','I poured water from the bottle into the cup until it was full.','I poured water from the bottle into the cup until it was empty.','The delivery truck zoomed by the school bus because it was going so fast.'][idx]",
        },
        q: {
          expr:
            "['What is too big?','What is too small?','Who feared violence?','What was full?','What was empty?','What was going so fast?'][idx]",
        },
        ans: {
          expr:
            "['trophy','suitcase','councilmen','cup','bottle','truck'][idx]",
        },
      },
    },
    expect: { kind: 'contains', value: '{{ans}}' },
    weight: 1,
    tags: ['reasoning', 'commonsense'],
    forgiveFormatting: true,
  },
];
