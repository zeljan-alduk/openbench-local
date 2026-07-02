# Case inventory: reasoning-logic-gotcha (25 cases, critique: needs-changes, 3 issues fixed)

# Category inventory: reasoning-logic-gotcha (25 cases) — REVISED

All 25 cases parameterized (100%; target >=60%). Verified non-overlapping with the 100 existing ids in `src/components/local-models/builtin-suite.ts` and the first expansion inventory (`scratchpad/designs/suite-expansion.md`). Regex expectations substitute NUMBERS only; string answers use `exact`. idx-table = one `pick`ed index + parallel inline-array `expr` lookups (pattern of `gotcha-decimal-compare`, builtin-suite.ts:1181).

Revision notes (all three required fixes applied):
1. gotcha-surgeon-riddle-inverted — prompt now states the child has exactly one mother and one father, closing the two-mother-family loophole while preserving the counterfactual-inversion trap.
2. gotcha-aiw-sister-brothers — gender now explicit in the prompt text ('and she also has'), mirroring builtin `gotcha-aiw-siblings` (builtin-suite.ts:1225); decidable from stated facts, and prompt text now clearly differs from the expansion's `gotcha-aiw-brothers`.
3. tracking-false-belief-location — question now says 'without "the"' AND carries acceptWithRemark `{kind:'exact', value:'the {{ans}}'}` (templating of acceptWithRemark values verified in case-generate.ts:118-120; stripWrappers in evaluator-direct.ts:242 never peels articles). Also added 2 true-belief control rows (watcher stays -> ans = loc2) so a blanket first-mentioned-location heuristic cannot pass; narrative moved into a per-row seq table to support the control rows.

---

## gotcha-carwash-walk-or-drive
- **tags**: reasoning, commonsense, gotcha, fast
- **kind**: regex
- **prompt**: "You want to get your car washed. The car wash is {{d}} meters from your house. Should you WALK or DRIVE there to get your car washed? Reply with ONLY one word: WALK or DRIVE."
- **parameterization**: `d: {pick: [50, 80, 100, 150, 200, 250, 400]}` — kills the memorized viral '100m' instance; answer invariant in d.
- **derivation**: The car must be present to be washed, so the trip's purpose forces bringing the car regardless of distance → `^DRIVE$`.
- **forgiveFormatting**: yes

## gotcha-surgeon-riddle-inverted
- **tags**: reasoning, logic, gotcha
- **kind**: exact
- **prompt**: "A {{child}} and {{pron}} {{deceased}} are in a car crash; the {{deceased}} dies. At the hospital the surgeon — one of the {{child}}'s two parents (the {{child}} has exactly one mother and one father) — says: \"I cannot operate, this is my child.\" Which parent is the surgeon? Reply with ONLY one word: mother or father."
- **parameterization**: idx-table, `idx: {pick: [0,1,2,3]}`; `deceased: {expr: "['mother','father','mother','father'][idx]"}`; `child: {expr: "['son','son','daughter','daughter'][idx]"}`; `pron: {expr: "['his','his','her','her'][idx]"}`; `ans: {expr: "['father','mother','father','mother'][idx]"}`. The memorized 'mother' answer stays in as two rows so the pattern can't be gamed by a blanket answer.
- **derivation**: With exactly one mother and one father stated, the surviving parent = the one NOT named as deceased → exact `{{ans}}`. The parenthetical closes the same-sex-parents alternate resolution that modern models are trained to mention, so the legitimate-alternate and memorized-trap answers can no longer coincide.
- **forgiveFormatting**: yes

## gotcha-river-crossing-trivial
- **tags**: reasoning, logic, gotcha
- **kind**: regex
- **prompt**: "A {{person}} and a {{animal}} are on one side of a river. Their boat carries the {{person}} and one animal at once. Nothing eats anything, and nothing else needs to cross. What is the MINIMUM number of one-way boat crossings for both to reach the other side? Reply with ONLY the integer, no commentary."
- **parameterization**: `person: {pick: ['farmer','shepherd','woman','man']}`; `animal: {pick: ['goat','sheep','dog','calf']}` — cosmetic re-randomization; the memorized artifact is the wolf-goat-cabbage 7-crossing schedule, not these nouns. Answer invariant.
- **derivation**: Both fit in one trip → `^1$`.
- **forgiveFormatting**: yes

## gotcha-trolley-already-dead
- **tags**: reasoning, logic, gotcha, commonsense
- **kind**: regex
- **prompt**: "A runaway trolley is heading toward {{n}} people who are ALREADY DEAD. You can pull a lever to divert it to a side track where 1 LIVING person is tied down. To avoid harming any living person, should you pull the lever? Reply with ONLY one word: YES or NO."
- **parameterization**: `n: {int: {min: 3, max: 9}}` — re-randomizes the memorized 'five'; answer invariant.
- **derivation**: Diverting kills the only living person; not diverting harms nobody alive → `^NO$`.
- **forgiveFormatting**: yes

## gotcha-dead-cat-probability
- **tags**: reasoning, probability, gotcha
- **kind**: regex
- **prompt**: "A DEAD cat is placed into a box together with a radioactive isotope, a vial of poison, and a radiation detector that shatters the vial if it detects decay. The box is opened {{h}} hours later. What is the probability that the cat is alive, as an integer percent? Reply with ONLY the integer, no % sign, no commentary."
- **parameterization**: `h: {int: {min: 1, max: 48}}` — irrelevant variable defeats verbatim recall of the Schrödinger boilerplate ('50').
- **derivation**: Cat was dead going in → `^0$`. Plus `acceptWithRemark: [{kind:'regex', value:'^0\\s*%$', remark:'appended a percent sign'}]`.
- **forgiveFormatting**: yes

## gotcha-jug-possible
- **tags**: reasoning, math, gotcha
- **kind**: exact
- **prompt**: "You have an unlimited water supply, a {{a}}-liter jug and a {{b}}-liter jug, no other containers and no markings. Is it possible to measure out EXACTLY {{c}} liters? Reply with ONLY one word: YES or NO."
- **parameterization**: idx-table, `idx: {pick: [0,1,2,3,4,5]}`; `a: {expr: '[6,6,4,4,5,5][idx]'}`; `b: {expr: '[12,12,8,8,10,10][idx]'}`; `c: {expr: '[6,4,4,6,5,3][idx]'}`; `ans: {expr: "['YES','NO','YES','NO','YES','NO'][idx]"}`.
- **derivation**: Measurable iff c is a multiple of gcd(a,b) (and <= a+b). Rows hand-verified: gcd(6,12)=6 → 6 YES / 4 NO; gcd(4,8)=4 → 4 YES / 6 NO; gcd(5,10)=5 → 5 YES / 3 NO. Exact `{{ans}}`. Kills the memorized die-hard pour-sequence hallucination.
- **forgiveFormatting**: yes

## gotcha-monty-hall-transparent
- **tags**: reasoning, probability, gotcha
- **kind**: regex
- **prompt**: "You are on a game show with three TRANSPARENT glass doors. You can clearly see the car behind door {{d}} and goats behind the other two. You pick door {{d}}. The host opens one of the goat doors and offers you the chance to switch to the remaining door. To maximize your chance of winning the car, should you switch? Reply with ONLY one word: YES or NO."
- **parameterization**: `d: {pick: [1, 2, 3]}` — answer invariant; surface re-randomization.
- **derivation**: You already picked the visible car; switching loses with certainty → `^NO$` (opposite of existing `gotcha-monty-hall`'s YES — counterfactual inversion of the memorized 'always switch').
- **forgiveFormatting**: yes

## gotcha-months-exactly-28
- **tags**: reasoning, fact, gotcha, fast
- **kind**: regex
- **prompt**: "How many months of the year {{year}} have EXACTLY 28 days (not 29, not more)? Reply with ONLY the integer, no commentary."
- **parameterization**: idx-table, `idx: {pick: [0,1,2,3,4,5]}`; `year: {expr: '[2019,2020,2022,2024,2025,2026][idx]'}`; `ans: {expr: '[1,0,1,0,1,1][idx]'}`.
- **derivation**: Non-leap year → only February → 1; leap year (2020, 2024) → none → 0. Regex `^{{ans}}$` (numeric). Memorized riddle answer '12' is always wrong; the leap-year rows also defeat a memorized blanket '1'.
- **forgiveFormatting**: yes

## gotcha-kg-vs-pound
- **tags**: reasoning, commonsense, gotcha
- **kind**: exact
- **prompt**: "Which is heavier: {{qa}} of feathers or {{qb}} of steel? Reply with ONLY one word: FEATHERS, STEEL, or SAME."
- **parameterization**: idx-table, `idx: {pick: [0,1,2,3,4]}`; `qa: {expr: "['1 kilogram','1 pound','2 kilograms','1 kilogram','2 pounds'][idx]"}`; `qb: {expr: "['1 pound','1 kilogram','3 pounds','3 pounds','2 pounds'][idx]"}`; `ans: {expr: "['FEATHERS','STEEL','FEATHERS','STEEL','SAME'][idx]"}`.
- **derivation**: Convert to pounds (1 kg = 2.205 lb, no near-ties): 2.2 vs 1 → FEATHERS; 1 vs 2.2 → STEEL; 4.41 vs 3 → FEATHERS; 2.2 vs 3 → STEEL; 2 vs 2 → SAME. Exact `{{ans}}`. The SAME row keeps the memorized 'a pound of X = a pound of Y' pattern from being blanket-wrong OR blanket-right. Distinct from existing fixed `gotcha-weight-feathers-bricks` (units there are identical; here they actually differ).
- **forgiveFormatting**: yes

## gotcha-linear-lotus-half
- **tags**: reasoning, math, gotcha
- **kind**: regex
- **prompt**: "A pond gains EXACTLY {{s}} new lotus flowers every day (linear growth, not doubling). On day {{n}} it is completely covered with {{tot}} flowers. On which day was it exactly HALF covered? Reply with ONLY the integer day number, no commentary."
- **parameterization**: `s: {pick: [2,3,4,5]}`; `n: {pick: [20,30,40,48]}` (all even → half-day is an integer); `tot: {expr: 's*n'}`; `half: {expr: 'n/2'}`.
- **derivation**: Flowers on day d = s·d, so half of s·n is reached at d = n/2 → `^{{half}}$`. The memorized CRT lily-pad answer n−1 is always wrong. Distinct from existing fixed `gotcha-crt-lily-pad` (doubling, 47) — this is its linear inversion.
- **forgiveFormatting**: yes

## gotcha-crt-bat-ball-inverted
- **tags**: reasoning, math, gotcha
- **kind**: regex
- **prompt**: "A pencil and an eraser cost ${{total}} in total. The pencil costs ${{diff}} LESS than the eraser. How much does the ERASER cost, in cents? Reply with ONLY the integer number of cents, no commentary."
- **parameterization**: `pencil: {int: {min: 3, max: 20}}`; `diffCents: {pick: [100]}`; `eraserCents: {expr: 'pencil + diffCents'}`; `total: {expr: '((2 * pencil + diffCents) / 100).toFixed(2)'}`; `diff: {expr: '(diffCents / 100).toFixed(2)'}` — mirrors existing `gotcha-crt-bat-ball` machinery but flips which item is asked for (the EXPENSIVE one) and swaps the nouns.
- **derivation**: eraser = (totalCents + diffCents)/2 = pencil + 100 → `^{{eraserCents}}$`. The memorized CRT reflex produces the cheap-item value ({{pencil}}), always wrong here.
- **forgiveFormatting**: yes

## gotcha-widgets-double-ratio
- **tags**: reasoning, math, gotcha
- **kind**: regex
- **prompt**: "It takes {{m}} machines {{t}} minutes to make {{m}} widgets. How many minutes would it take {{m2}} machines to make {{w}} widgets? Reply with ONLY the integer number of minutes, no commentary."
- **parameterization**: `m: {pick: [5,6,8,10]}`; `t: {pick: [4,6,10]}`; `m2: {int: {min: 20, max: 90, step: 10}}`; `w: {expr: '2*m2'}`; `ans: {expr: '2*t'}`.
- **derivation**: Each machine makes 1 widget per t minutes → m2 machines need 2t minutes for 2·m2 widgets → `^{{ans}}$`. The memorized CRT answer ('same t') and linear scaling are both always wrong because the widgets-per-machine ratio is doubled. Distinct from existing fixed `gotcha-crt-widgets` (ratio unchanged, answer 5).
- **forgiveFormatting**: yes

## gotcha-aiw-sister-brothers
- **tags**: reasoning, logic, gotcha
- **kind**: regex
- **prompt**: "{{name}} has {{s}} sisters and she also has {{b}} brothers. How many brothers does {{name}}'s sister have? Reply with ONLY the integer, no commentary."
- **parameterization**: `idx: {pick: [0,1,2,3,4]}`; `name: {expr: "['Nora','Priya','Lena','Amara','Sofia'][idx]"}`; `s: {int: {min: 2, max: 6}}`; `b: {int: {min: 1, max: 5}}`.
- **derivation**: Gender is now stated explicitly in the prompt ('she'), mirroring builtin `gotcha-aiw-siblings` — decidable from stated facts alone, no name-based inference required. Any sister of the female protagonist has exactly the same {{b}} brothers — the answer is UNCHANGED (control variant). Regex `^{{b}}$`. The trap is answering b+1 (mirroring the famous +1 variant) or s. Distinct from existing `gotcha-aiw-siblings` (brother's sisters = s+1) and the expansion's `gotcha-aiw-brothers` (male protagonist, sister's brothers = b+1): here the +1 reflex fails, and the 'and she also has' wording cleanly differentiates the prompt text from gotcha-aiw-brothers.
- **forgiveFormatting**: yes

## logic-premise-order-shuffled
- **tags**: reasoning, logic
- **kind**: exact
- **prompt**: "Use all three facts. Fact 1: {{p3}} finished the race before {{p4}}. Fact 2: {{p1}} finished the race before {{p2}}. Fact 3: {{p2}} finished the race before {{p3}}. Who finished LAST? Reply with ONLY the name, no commentary."
- **parameterization**: idx-table, `idx: {pick: [0,1,2,3,4,5]}`; four parallel name arrays with all-distinct names per row: `p1: {expr: "['Otto','Mira','Sana','Bram','Kira','Levy'][idx]"}`, `p2: {expr: "['Jade','Theo','Ravi','Nell','Omar','Isla'][idx]"}`, `p3: {expr: "['Finn','Vera','Kofi','Tessa','Yuki','Dario'][idx]"}`, `p4: {expr: "['Ada','Nico','Zola','Hugo','Pia','Wren'][idx]"}`; `ans: {expr: 'p4'}`.
- **derivation**: Chain is p1<p2<p3<p4 in finish order, but the facts are deliberately given OUT of proof order (the chain's start is Fact 2) — premise-order sensitivity trap (arXiv:2402.08939). Last = p4 → exact `{{ans}}`. Distinct from the expansion's `logic-transitive-tallest` (3 names, premises in proof order).
- **forgiveFormatting**: yes

## logic-double-negation-compare
- **tags**: reasoning, logic, negation
- **kind**: exact
- **prompt**: "Consider the statement: 'It is not the case that {{n}} is not greater than {{t}}.' Is this statement TRUE or FALSE? Reply with ONLY one word: TRUE or FALSE."
- **parameterization**: `n: {int: {min: 10, max: 50}}`; `idx: {pick: [0,1,2,3,4,5]}`; `delta: {expr: '[-9,-4,-2,3,6,11][idx]'}`; `t: {expr: 'n + delta'}`; `ans: {expr: "n > t ? 'TRUE' : 'FALSE'"}`.
- **derivation**: Double negation cancels → statement ≡ (n > t); delta ≠ 0 guarantees decidability; sign of delta is mixed so neither blanket answer nor the keyword-negation heuristic ('not' → FALSE) can pass. Exact `{{ans}}`. Distinct from the expansion's `logic-negation-quantifier` (quantifier-negation MCQ, fixed).
- **forgiveFormatting**: yes (case only)

## logic-negation-not-member
- **tags**: reasoning, logic, negation, gotcha
- **kind**: exact
- **prompt**: "Which of these is NOT {{cat}}? Reply with ONLY the letter.\n(A) {{o1}}\n(B) {{o2}}\n(C) {{o3}}\n(D) {{o4}}"
- **parameterization**: idx-table, `idx: {pick: [0,1,2,3,4,5]}`; `cat: {expr: "['a fruit','a mammal','a programming language','a bird','a vegetable','a metal'][idx]"}`; `o1: {expr: "['apple','whale','Python','trout','spinach','iron'][idx]"}`; `o2: {expr: "['pear','eagle','Rust','sparrow','broccoli','granite'][idx]"}`; `o3: {expr: "['carrot','dog','Oxygen','eagle','carrot','copper'][idx]"}`; `o4: {expr: "['mango','horse','Java','penguin','mango','zinc'][idx]"}`; `ans: {expr: "['C','B','C','A','D','B'][idx]"}`.
- **derivation**: One non-member per row, hand-verified (carrot, eagle, Oxygen, trout, mango, granite); the correct letter's position rotates across rows so lexical-negation-blind models (which name the most category-typical member) and position-biased models both fail. Exact `{{ans}}` (letter is a string → exact, per numbers-only-in-regex rule).
- **forgiveFormatting**: yes

## logic-syllogism-belief-conflict
- **tags**: reasoning, logic, gotcha
- **kind**: exact
- **prompt**: "Premises: (1) {{p1}} (2) {{p2}} Conclusion: {{c}} Assume the premises are true even if they contradict the real world. Is the conclusion logically guaranteed by the premises alone? Reply with ONLY YES or NO, uppercase."
- **parameterization**: idx-table, `idx: {pick: [0,1,2,3]}`; `p1: {expr: "['All fish can walk.','All roses are plants.','All birds are made of metal.','Some doctors are runners.'][idx]"}`; `p2: {expr: "['Salmon are fish.','All tulips are plants.','Penguins are birds.','Some runners are tall.'][idx]"}`; `c: {expr: "['Salmon can walk.','Tulips are flowers.','Penguins are made of metal.','Some doctors are tall.'][idx]"}`; `ans: {expr: "['YES','NO','YES','NO'][idx]"}`.
- **derivation**: Rows 0/2 are VALID but world-false (belief says NO, logic says YES); rows 1/3 are INVALID but world-true/believable (belief says YES, logic says NO — undistributed middle / two-'some' fallacy). Content-belief conflict in both directions defeats belief-driven answering. Exact `{{ans}}`. Distinct from existing `logic-syllogism-swans` (fixed, belief-consistent, always YES).
- **forgiveFormatting**: yes

## gotcha-false-premise-year
- **tags**: world-knowledge, fact, gotcha
- **kind**: regex
- **prompt**: "In what year did {{person}} invent the {{thing}}? If the question is based on a false premise, reply with ONLY the word NONE, uppercase. Otherwise reply with ONLY the year. No commentary."
- **parameterization**: idx-table, `idx: {pick: [0,1,2,3,4]}`; `person: {expr: "['Albert Einstein','Isaac Newton','Charles Darwin','Marie Curie','Nikola Tesla'][idx]"}`; `thing: {expr: "['telephone','light bulb','telescope','airplane','sewing machine'][idx]"}` — each pairing hand-verified as a false attribution with no defensible year.
- **derivation**: Every row presupposes a false fact; the escape hatch is explicitly offered → `^NONE$` (answer invariant; the failure mode under test is supplying the real inventor's year or a fabricated one).
- **forgiveFormatting**: yes (case only)

## gotcha-abstain-some-apples
- **tags**: reasoning, math, gotcha
- **kind**: regex
- **prompt**: "{{name}} put some apples in a basket, then added {{b}} more apples. How many apples are in the basket now? If the answer cannot be determined from the information given, reply with ONLY the word UNKNOWN, uppercase. Otherwise reply with ONLY the integer. No commentary."
- **parameterization**: `idx: {pick: [0,1,2,3,4]}`; `name: {expr: "['Maren','Deniz','Kofi','Ines','Talia'][idx]"}`; `b: {int: {min: 4, max: 17}}` — surface re-randomizes while the answer stays invariant ('some' is never quantified).
- **derivation**: Initial count unspecified → the question is unanswerable → `^UNKNOWN$` (AbstentionBench failure: models fabricate {{b}} or a nearby integer).
- **forgiveFormatting**: yes (case only)

## tracking-false-belief-location
- **tags**: reasoning, tracking, commonsense
- **kind**: exact
- **prompt**: "{{seq}} Where will {{name1}} FIRST look for the marble: the {{loc1}} or the {{loc2}}? Reply with ONLY the location name, without \"the\", no commentary."
- **parameterization**: idx-table, `idx: {pick: [0,1,2,3,4,5]}`; `name1: {expr: "['Sara','Anna','Maya','Leo','Nina','Emil'][idx]"}`; `loc1: {expr: "['basket','drawer','red box','cupboard','green bag','suitcase'][idx]"}`; `loc2: {expr: "['box','shelf','blue box','fridge','yellow bag','backpack'][idx]"}`; `seq: {expr: "['Sara puts a marble in the basket and leaves the room. While Sara is away, Tom moves the marble from the basket to the box. Sara comes back, having no way of knowing what happened while away.','Anna puts a marble in the drawer and leaves the room. While Anna is away, Ben moves the marble from the drawer to the shelf. Anna comes back, having no way of knowing what happened while away.','Maya puts a marble in the red box and leaves the room. While Maya is away, Iris moves the marble from the red box to the blue box. Maya comes back, having no way of knowing what happened while away.','Leo puts a marble in the cupboard and leaves the room. While Leo is away, Zoe moves the marble from the cupboard to the fridge. Leo comes back, having no way of knowing what happened while away.','Nina puts a marble in the green bag and stays in the room, watching everything. In full view of Nina, Owen moves the marble from the green bag to the yellow bag.','Emil puts a marble in the suitcase and stays in the room, watching everything. In full view of Emil, Ruth moves the marble from the suitcase to the backpack.'][idx]"}`; `ans: {expr: "['basket','drawer','red box','cupboard','yellow bag','backpack'][idx]"}` (rows 0-3: false belief → loc1; rows 4-5: true-belief CONTROL, watcher saw the move → loc2). Plus `acceptWithRemark: [{kind:'exact', value:'the {{ans}}', remark:'included the article'}]` — acceptWithRemark values are templated per case-generate.ts:118-120, and stripWrappers (evaluator-direct.ts:242) never forgives a leading article, so this clause is needed.
- **derivation**: Sally-Anne false-belief: an absent agent's belief still points at the ORIGINAL location (loc1); a watching agent knows the real location (loc2). Exact `{{ans}}`. The control rows defeat a blanket answer-loc1 (first-mentioned) heuristic, and the standard trap (answering the real location in false-belief rows) still fails. Parameterized containers/names kill verbatim recall of the canonical basket/box instance.
- **forgiveFormatting**: yes

## tracking-pass-chain
- **tags**: reasoning, logic, tracking
- **kind**: exact
- **prompt**: "{{seq}} Who is holding the {{obj}} now? Reply with ONLY the name, no commentary."
- **parameterization**: idx-table, `idx: {pick: [0,1,2,3,4,5]}`; `obj: {expr: "['key','coin','badge','pen','map','ring'][idx]"}`; `seq: {expr: "['Ana hands the key to Ben. Ben hands it to Cara. Cara hands it back to Ben.','Milo hands the coin to Ada. Ada hands it to Rex. Rex hands it to Milo.','Tia hands the badge to Uri. Uri hands it back to Tia. Tia hands it to Vic.','Ede hands the pen to Fay. Fay hands it back to Ede. Ede hands it back to Fay.','Gil hands the map to Hana. Hana hands it to Ivo. Ivo hands it back to Hana.','Kaya hands the ring to Liam. Liam hands it to Mona. Mona hands it to Kaya.'][idx]"}`; `ans: {expr: "['Ben','Milo','Vic','Fay','Hana','Kaya'][idx]"}`.
- **derivation**: Final holder precomputed per row (each hand-traced; 'back to' hops are the trap). Exact `{{ans}}`. Object tracking via person-to-person possession — mechanically distinct from existing `tracking-shuffled-cups` (cup-content swaps, fixed) and the expansion's `logic-cup-swaps-param` (cup-swap triples).
- **forgiveFormatting**: yes

## calendar-day-after-feb28
- **tags**: reasoning, fact, gotcha
- **kind**: exact
- **prompt**: "What is the date of the day immediately after {{year}}-02-28? Reply with ONLY the date in YYYY-MM-DD format, no commentary."
- **parameterization**: idx-table, `idx: {pick: [0,1,2,3,4,5]}`; `year: {expr: '[2023,2024,2025,2026,2027,2028][idx]'}`; `ans: {expr: "['2023-03-01','2024-02-29','2025-03-01','2026-03-01','2027-03-01','2028-02-29'][idx]"}`.
- **derivation**: Leap years (2024, 2028) → Feb 29; others → Mar 1. Exact `{{ans}}` (date string → exact, not regex). Mixing leap and non-leap rows defeats both the blurted 'March 1' reflex and a memorized single instance. Distinct from existing `date-arithmetic-30days` (fixed, +30 days) and `leap-year-1900` (YES/NO rule).
- **forgiveFormatting**: yes

## calendar-weekday-days-ago
- **tags**: reasoning, math, arithmetic
- **kind**: exact
- **prompt**: "If today is {{day}}, what day of the week was it exactly {{k}} days ago? Reply with ONLY the day name, capitalized (e.g. Monday). No commentary."
- **parameterization**: `d: {pick: [0,1,2,3,4,5,6]}`; `k: {int: {min: 15, max: 40}}`; `day: {expr: "['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][d]"}`; `ans: {expr: "['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][(((d - k) % 7) + 7) % 7]"}`.
- **derivation**: Backward modular weekday arithmetic (negative-mod wrap is the trap) → exact `{{ans}}`. Distinct from existing `puzzle-day-of-week` (fixed, forward '+100 from Tuesday') and the expansion's `logic-day-offset` (tomorrow/yesterday naming): direction is reversed and fully parameterized.
- **forgiveFormatting**: yes

## gotcha-hanoi-trivial
- **tags**: reasoning, logic, gotcha
- **kind**: regex
- **prompt**: "You have a Tower of Hanoi puzzle with exactly {{n}} disk(s) and three pegs. Following the standard rules (move one disk at a time; never place a larger disk on a smaller one), what is the MINIMUM number of moves to transfer all disks from the first peg to the third peg? Reply with ONLY the integer, no commentary."
- **parameterization**: `n: {pick: [1, 2]}`; `ans: {expr: 'Math.pow(2, n) - 1'}` — trivialized instances only (unpuzzle style), so the memorized 3-disk answer '7' is always wrong.
- **derivation**: Minimum moves = 2^n − 1 → 1 or 3 → `^{{ans}}$`.
- **forgiveFormatting**: yes

## gotcha-counterfactual-week
- **tags**: reasoning, math, gotcha
- **kind**: regex
- **prompt**: "For this question ONLY, assume a week has exactly {{w}} days (not 7). How many days are in {{k}} such weeks? Reply with ONLY the integer, no commentary."
- **parameterization**: `w: {pick: [5, 6, 8, 9]}` (never 7, so the parametric-knowledge answer 7·k is always distinct); `k: {int: {min: 3, max: 12}}`; `ans: {expr: 'w * k'}`.
- **derivation**: Counterfactual premise must override world knowledge → w·k → `^{{ans}}$` (content-belief conflict in arithmetic form; trap answer 7·k never collides since w ≠ 7).
- **forgiveFormatting**: yes

---

**Coverage map**: fresh digest gotchas parameterized (cases 1-12), premise-order trap (14), negation (15, 16), counterfactual famous riddles (2, 3, 4, 5, 7, 8, 24), AIW-style (13), object tracking (20, 21), syllogism with content-belief conflict (17, 25), calendar/date math (8, 22, 23), abstention/false-premise gotchas (18, 19), commonsense embodied reasoning (1, 9), false-belief theory-of-mind with true-belief controls (20).