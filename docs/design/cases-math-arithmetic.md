# Case inventory: math-arithmetic (20 cases, critique: needs-changes, 3 issues fixed)

# Category: math-arithmetic — 20 new cases (REVISED)

All single-turn strict-output prompts in house style. All 20 parameterized (100% >= 60% target). Weight 1 throughout. Regex expectations substitute ONLY numeric vars (or digit-only strings); string answers use `exact`. Checked against all 100 ids in builtin-suite.ts and the full suite-expansion.md inventory — no id or content overlap.

Revision notes (all required fixes applied):
- [major fix] math-area-m2-to-cm2: prompt now forbids commas/thousands separators (house style of arithmetic-exact) + acceptWithRemark clause for comma-grouped output.
- [minor fix] math-hours-minutes-to-seconds: prompt now says 'no commas' + same comma-grouped acceptWithRemark clause.
- [minor fix] math-combined-work-rate REPLACED by math-pipe-fill-drain: net-rate composition (1/a - 1/b), not a harmonic-mean-of-rates problem, so it no longer correlates with avg-speed-harmonic (suite-expansion.md sec 2.8) whose sole diagnostic is the arithmetic-mean-of-rates error.

---

## math-two-step-restock
- **tags**: reasoning, math, arithmetic
- **kind**: regex
- **prompt**: \"{{name}} had {{a}} {{obj}}. {{name}} gave away {{b}} of them, then bought {{c}} more. How many {{obj}} does {{name}} have now? Reply with ONLY the integer, no commentary.\" (GSM-Symbolic entity/number perturbation — digest #20)
- **parameterization**: `idx:{pick:[0,1,2,3,4,5]}`; `name:{expr:\"['Mara','Deniz','Kofi','Ines','Talia','Ravi'][idx]\"}`; `obj:{expr:\"['stamps','marbles','pins','shells','coins','beads'][idx]\"}`; `b:{int:{min:6,max:20}}`; `d:{int:{min:10,max:30}}`; `a:{expr:'b + d'}` (guarantees a>b); `c:{int:{min:3,max:15}}`; `ans:{expr:'d + c'}`
- **derivation**: a-b+c = (b+d)-b+c = d+c; expect `^\\s*{{ans}}\\s*$` (only numeric ans in regex)
- **forgiveFormatting**: yes

## math-noop-smaller-clause
- **tags**: reasoning, math, arithmetic, gotcha
- **kind**: regex
- **prompt**: \"{{name}} picks {{a}} apples on Monday and {{b}} apples on Tuesday. {{c}} of Tuesday's apples are a bit smaller than average, but they are all still normal apples. How many apples does {{name}} have in total? Reply with ONLY the integer, no commentary.\" (GSM-NoOp irrelevant-clause trap — digest #16/#21)
- **parameterization**: `idx:{pick:[0,1,2,3]}`; `name:{expr:\"['Oliver','Mia','Ravi','Lena'][idx]\"}`; `a:{int:{min:23,max:58}}`; `b:{int:{min:31,max:69}}`; `c:{int:{min:3,max:9}}`; `ans:{expr:'a + b'}`
- **derivation**: size clause is a no-op -> a+b; the memorized-wrong trap a+b-c is always a distinct integer since c>=3; expect `^\\s*{{ans}}\\s*$`
- **forgiveFormatting**: yes

## math-offtopic-number-distractor
- **tags**: reasoning, math, gotcha
- **kind**: regex
- **prompt**: \"{{name1}} has {{a}} stickers. {{name2}}'s cousin is {{x}} years old. {{name1}} buys {{b}} more stickers. How many stickers does {{name1}} have? Reply with ONLY the integer, no commentary.\" (GSM-IC in-topic numeric distractor about a different entity — digest #24; distinct from math-noop-smaller-clause, which uses a qualitative clause about the counted items)
- **parameterization**: `idx:{pick:[0,1,2,3,4,5]}`; `name1:{expr:\"['Petra','Yusuf','Carla','Ede','Nina','Tomas'][idx]\"}`; `name2:{expr:\"['Marko','Alice','Dario','Sara','Owen','Julia'][idx]\"}` (parallel arrays keep name1 != name2 per row); `a:{int:{min:12,max:48}}`; `b:{int:{min:5,max:25}}`; `x:{int:{min:7,max:19}}`; `ans:{expr:'a + b'}`
- **derivation**: the age sentence concerns a different entity/unit -> a+b; traps a+b+-x always differ since x>=7; expect `^\\s*{{ans}}\\s*$`
- **forgiveFormatting**: yes

## math-pipe-fill-drain
- **tags**: reasoning, math
- **kind**: regex
- **prompt**: \"A tap can fill an empty tank in {{a}} hours. A drain at the bottom can empty the full tank in {{b}} hours. If the tank starts empty and both the tap and the drain are open, how many hours does it take to fill the tank? Reply with ONLY the integer, no commentary.\" (REPLACES math-combined-work-rate: net-rate composition 1/a - 1/b, a different rate-combination error class than the arithmetic-mean-of-rates trap probed by avg-speed-harmonic in suite-expansion.md sec 2.8 — no correlated diagnostic)
- **parameterization**: idx-table (pattern of gotcha-decimal-compare): `idx:{pick:[0,1,2,3,4,5]}`; `a:{expr:'[3,4,6,4,10,6][idx]'}`; `b:{expr:'[6,12,12,6,15,8][idx]'}`; `ans:{expr:'[6,6,12,12,30,24][idx]'}`
- **derivation**: time = 1/(1/a - 1/b) = ab/(b-a); each row hand-verified integer (machine-checked): (3,6)->6, (4,12)->6, (6,12)->12, (4,6)->12, (10,15)->30, (6,8)->24; b>a in every row so the tank always fills; traps: adding rates as if both fill (ab/(a+b)) or subtracting times (b-a), both always distinct from ans; expect `^\\s*{{ans}}\\s*$`
- **forgiveFormatting**: yes

## math-age-gap-invariant
- **tags**: reasoning, math, gotcha
- **kind**: regex
- **prompt**: \"{{name}} is {{d}} years older than her brother. In {{y}} years, how many years older than her brother will {{name}} be? Reply with ONLY the integer, no commentary.\"
- **parameterization**: `idx:{pick:[0,1,2,3,4]}`; `name:{expr:\"['Nora','Priya','Lena','Amara','Sofia'][idx]\"}` (female names keep 'her' coherent); `d:{int:{min:4,max:9}}`; `y:{int:{min:5,max:30}}`
- **derivation**: age gaps are invariant over time -> d regardless of y (traps: d+y or y); expect `^\\s*{{d}}\\s*$`
- **forgiveFormatting**: yes

## math-speed-trip-minutes
- **tags**: reasoning, math, arithmetic
- **kind**: regex
- **prompt**: \"A cyclist rides {{dst}} km at a constant speed of {{v}} km/h. How many MINUTES does the ride take? Reply with ONLY the integer number of minutes, no units, no commentary.\" (rate problem + hours->minutes unit trap)
- **parameterization**: `v:{pick:[12,16,20,24,28]}` (all divisible by 4); `q:{int:{min:5,max:11}}`; `dst:{expr:'v * q / 4'}` (integer km by construction); `ans:{expr:'15 * q'}`
- **derivation**: time = dst/v = q/4 hours = 15q minutes (75-165); answering in hours or decimal hours fails the anchored regex; expect `^\\s*{{ans}}\\s*$`
- **forgiveFormatting**: yes

## math-clock-hours-later
- **tags**: reasoning, math, arithmetic
- **kind**: regex
- **prompt**: \"A standard 12-hour clock now shows exactly {{h}} o'clock. What number will the hour hand point to exactly {{k}} hours from now? Reply with ONLY the integer (1-12), no commentary.\" (modular arithmetic in clock form; k>24 forces mod-12 reasoning; distinct from puzzle-day-of-week which is days-of-week and fixed)
- **parameterization**: `h:{int:{min:1,max:12}}`; `k:{int:{min:25,max:90}}`; `ans:{expr:'((h + k - 1) % 12) + 1'}`
- **derivation**: hour = ((h+k-1) mod 12)+1, maps 0->12 correctly (hand-checked: h=12,k=25->1; h=3,k=27->6); expect `^\\s*{{ans}}\\s*$`
- **forgiveFormatting**: yes

## math-hex-to-decimal
- **tags**: reasoning, arithmetic
- **kind**: regex
- **prompt**: \"Convert the hexadecimal number {{hex}} to decimal (base 10). Reply with ONLY the integer, no commentary.\" (parameterized hex->dec; existing hex-arithmetic is fixed 0xF+0x1 answered in hex — opposite direction, no overlap)
- **parameterization**: `n:{int:{min:100,max:255}}`; `hex:{expr:'n.toString(16).toUpperCase()'}`
- **derivation**: answer is n by construction (hex string appears only in the prompt; only numeric n enters the regex); expect `^\\s*{{n}}\\s*$`
- **forgiveFormatting**: yes

## math-binary-addition
- **tags**: reasoning, arithmetic
- **kind**: regex
- **prompt**: \"Compute the sum of the two binary numbers {{abin}} and {{bbin}}. Reply with ONLY the sum in binary (only digits 0 and 1, no 0b prefix), no commentary.\" (base-2 carry chains; existing base-conversion-binary is fixed dec->bin conversion, no addition)
- **parameterization**: `a:{int:{min:9,max:30}}`; `b:{int:{min:9,max:30}}`; `abin:{expr:'a.toString(2)'}`; `bbin:{expr:'b.toString(2)'}`; `sbin:{expr:'(a + b).toString(2)'}`
- **derivation**: sum recomputed from a+b; sbin is a digit-only string (0/1), safe to substitute into the regex under the numbers-only rule; expect `^\\s*{{sbin}}\\s*$`
- **forgiveFormatting**: yes

## math-expected-value-die
- **tags**: reasoning, math, probability
- **kind**: regex
- **prompt**: \"You roll one fair six-sided die and are paid {{k}} dollars per pip shown (i.e. {{k}} times the number rolled). What is the expected value of the payout, in dollars? Reply with ONLY the integer, no commentary.\"
- **parameterization**: `k:{pick:[2,4,6,8,10]}` (even k makes k*3.5 an integer); `ans:{expr:'k * 3.5'}`
- **derivation**: E[roll]=3.5 -> payout k*3.5 in {7,14,21,28,35}; expect `^\\s*{{ans}}\\s*$`
- **forgiveFormatting**: yes

## math-expected-net-raffle
- **tags**: reasoning, math, probability
- **kind**: regex
- **prompt**: \"A raffle ticket costs ${{c}}. With probability 1/{{n}} the ticket wins ${{w}}; otherwise it wins nothing. What is the expected NET profit of buying one ticket, in dollars? Reply with ONLY the integer, no commentary.\"
- **parameterization**: `n:{pick:[10,20,25,50]}`; `m:{int:{min:3,max:9}}`; `w:{expr:'n * m'}` (guarantees w/n integer); `c:{pick:[1,2]}`; `ans:{expr:'m - c'}`
- **derivation**: E = w*(1/n) - c = m - c, always >=1 by construction (no negative-sign regex issues); trap: forgetting to subtract cost (answering m); expect `^\\s*{{ans}}\\s*$`
- **forgiveFormatting**: yes

## math-cond-prob-dice-given-first
- **tags**: reasoning, math, probability, gotcha
- **kind**: exact
- **prompt**: \"Two fair six-sided dice are rolled one after the other. The first die shows {{k}}. Given this, what is the probability that the TOTAL of the two dice is exactly {{s}}? Reply with ONLY a fraction in lowest terms (e.g. 1/2), no commentary.\"
- **parameterization**: `k:{int:{min:1,max:6}}`; `off:{int:{min:1,max:6}}`; `s:{expr:'k + off'}` — surface re-randomizes each run; answer invariant
- **derivation**: conditioning reduces to P(second die = s-k) with s-k in 1..6 by construction -> always exactly 1/6; the trap is the memorized UNCONDITIONAL sum distribution (e.g. 5/36 for sum 8); expect exact `1/6`
- **forgiveFormatting**: yes

## math-cond-prob-second-red
- **tags**: reasoning, math, probability, gotcha
- **kind**: exact
- **prompt**: \"A bag holds {{r}} red and {{b}} blue marbles. You draw two marbles WITHOUT replacement. Given that the first marble drawn is red, what is the probability that the second is also red? Reply with ONLY a fraction in lowest terms (e.g. 2/5), no commentary.\" (distinct from inventory's probability-marble-red, which is a single unconditioned draw)
- **parameterization**: idx-table: `idx:{pick:[0,1,2,3,4,5]}`; `r:{expr:'[4,5,3,6,7,5][idx]'}`; `b:{expr:'[6,5,7,4,3,7][idx]'}`; `ans:{expr:\"['1/3','4/9','2/9','5/9','2/3','4/11'][idx]\"}`
- **derivation**: (r-1)/(r+b-1), each row hand-verified pre-reduced: 3/9=1/3, 4/9, 2/9, 5/9, 6/9=2/3, 4/11; trap: ignoring the condition and answering r/(r+b); string answer -> exact `{{ans}}` (exact is template-safe for strings)
- **forgiveFormatting**: yes

## math-hours-minutes-to-seconds
- **tags**: reasoning, arithmetic
- **kind**: regex
- **prompt**: \"How many seconds are there in {{h}} hours and {{m}} minutes? Reply with ONLY the integer, no commas, no commentary.\" (mixed-unit conversion; trap is the 60-vs-3600 factor) [FIXED: added 'no commas' per house style of arithmetic-exact — answers span 3900-14340, so '14,340' was a plausible false fail]
- **parameterization**: `h:{int:{min:1,max:3}}`; `m:{int:{min:5,max:59}}`; `ans:{expr:'h * 3600 + m * 60'}`; `hi:{expr:'floor(ans / 1000)'}`; `lo3:{expr:\"('00' + (ans % 1000)).slice(-3)\"}` (hi numeric, lo3 digit-only string — both regex-safe)
- **derivation**: 3600h + 60m (3900-14340); expect `^\\s*{{ans}}\\s*$`; **acceptWithRemark**: `^\\s*{{hi}},{{lo3}}\\s*$` (soft pass for comma-grouped output despite the prompt, machine-verified equal to toLocaleString grouping across the range: e.g. 3900->'3,900', 14340->'14,340')
- **forgiveFormatting**: yes

## math-area-m2-to-cm2
- **tags**: reasoning, math, geometry, gotcha
- **kind**: regex
- **prompt**: \"A square has sides {{n}} meters long. What is its area in square CENTIMETERS? Reply with ONLY the integer, no commas, no thousands separators, no commentary.\" (squared-unit conversion trap: models multiply by 100 instead of 100^2) [FIXED: prompt now forbids thousands separators, matching arithmetic-exact house style — answers are 5-6 digits so '810,000' was a common false fail measuring comma habits instead of the unit trap]
- **parameterization**: `n:{int:{min:2,max:9}}`; `ans:{expr:'n * n * 10000'}`; `g:{expr:'n * n * 10'}` (comma-grouped form of ans is always g followed by ',000' since ans = n^2 * 10^4; machine-verified equal to toLocaleString grouping for all n in 2..9, e.g. n=2 -> 40000 -> '40,000', n=9 -> 810000 -> '810,000')
- **derivation**: (100n)^2 = 10000*n^2; the trap answer 100*n^2 is always distinct; expect `^\\s*{{ans}}\\s*$`; **acceptWithRemark**: `^\\s*{{g}},000\\s*$` (belt-and-braces soft pass for digit-grouped output; only numeric g substituted — the grouped trap answer 100*n^2 never matches this shape since it is at most 4 digits with grouped form '8,100' != g,000)
- **forgiveFormatting**: yes

## math-triangle-third-angle
- **tags**: reasoning, math, geometry
- **kind**: regex
- **prompt**: \"Two angles of a triangle measure {{a}} degrees and {{b}} degrees. What is the measure of the third angle, in degrees? Reply with ONLY the integer, no commentary.\"
- **parameterization**: `a:{int:{min:35,max:75}}`; `b:{int:{min:40,max:80}}`; `ans:{expr:'180 - a - b'}` (min 25, max 105 — always a valid positive angle)
- **derivation**: angle sum 180 degrees; expect `^\\s*{{ans}}\\s*$`
- **forgiveFormatting**: yes

## math-rectangle-perimeter
- **tags**: reasoning, math, geometry
- **kind**: regex
- **prompt**: \"A rectangle is {{l}} cm long and {{w}} cm wide. What is its PERIMETER in cm? Reply with ONLY the integer, no units, no commentary.\" (perimeter-vs-area confusion probe)
- **parameterization**: `l:{int:{min:7,max:19}}`; `w:{int:{min:3,max:6}}`; `ans:{expr:'2 * (l + w)'}`
- **derivation**: 2(l+w); ranges chosen so perimeter != area for every combination (2(l+w)=lw requires (l-2)(w-2)=4 -> l<=6, excluded), keeping the area-trap diagnostic; expect `^\\s*{{ans}}\\s*$`
- **forgiveFormatting**: yes

## math-geometric-sequence-next
- **tags**: reasoning, math, sequence
- **kind**: regex
- **prompt**: \"What number comes next in this sequence: {{a}}, {{t2}}, {{t3}}, {{t4}}, ? Reply with ONLY the integer, no commentary.\" (geometric; existing puzzle-sequence-next is fixed n^2+n, inventory's next-arith-sequence is arithmetic — no overlap)
- **parameterization**: `a:{int:{min:2,max:6}}`; `r:{pick:[2,3]}`; `t2:{expr:'a*r'}`; `t3:{expr:'a*r*r'}`; `t4:{expr:'a*r*r*r'}`; `ans:{expr:'a*r*r*r*r'}`
- **derivation**: constant ratio r over four shown terms determines the rule uniquely; next = a*r^4; expect `^\\s*{{ans}}\\s*$`
- **forgiveFormatting**: yes

## math-fibonacci-like-next
- **tags**: reasoning, math, sequence
- **kind**: regex
- **prompt**: \"Each number in this sequence is the sum of the two numbers before it. What comes next: {{a}}, {{b}}, {{t3}}, {{t4}}, {{t5}}, ? Reply with ONLY the integer, no commentary.\" (rule stated explicitly, so zero ambiguity; randomized seeds kill the memorized 1,1,2,3,5,8 instance)
- **parameterization**: `a:{int:{min:2,max:9}}`; `b:{int:{min:2,max:9}}`; `t3:{expr:'a + b'}`; `t4:{expr:'a + 2*b'}`; `t5:{expr:'2*a + 3*b'}`; `ans:{expr:'3*a + 5*b'}`
- **derivation**: next = t4+t5 = 3a+5b; expect `^\\s*{{ans}}\\s*$`
- **forgiveFormatting**: yes

## math-sum-difference-larger
- **tags**: reasoning, math, algebra
- **kind**: regex
- **prompt**: \"The sum of two numbers is {{s}} and their difference is {{d}}. What is the LARGER of the two numbers? Reply with ONLY the integer, no commentary.\" (classic linear system; parameterized so the answer is never memorizable; distinct from fixed algebra-solve-linear and puzzle-age-doubled)
- **parameterization**: `x:{int:{min:12,max:40}}`; `y:{int:{min:3,max:9}}` (y<x always, so s,d positive and parity always consistent by construction); `s:{expr:'x + y'}`; `d:{expr:'x - y'}`
- **derivation**: larger = (s+d)/2 = x by construction; expect `^\\s*{{x}}\\s*$`
- **forgiveFormatting**: yes

---

**Coverage map**: word problems with distractor numbers (1-3) · multi-step rates/ages (4-6) · modular/base arithmetic (7-9) · expected value (10-11) · conditional-probability gotchas (12-13) · unit conversions with traps (6, 14-15) · geometry (15-17) · sequences (18-19) · algebra (20). Parameterized: 20/20. All join FORGIVE_FORMATTING_IDS (numeric/fraction answers; formatting is never the thing under test in this category).