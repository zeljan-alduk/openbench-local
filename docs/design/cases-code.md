# Case inventory: code (20 cases, critique: needs-changes, 5 issues fixed)

# Code category — 20 new cases (author: code, REVISED — all 5 review fixes applied)

Checked against all 100 ids in `src/components/local-models/builtin-suite.ts` and the §2.1 code inventory in `scratchpad/designs/suite-expansion.md`. No id or content overlap. 18/20 parameterized (90%). Regex expectations substitute NUMBERS only; string answers use exact/contains. Ids follow the suite's existing `code-bigO-*` casing convention for Big-O siblings. Revision applied: greedy-match filler de-ambiguated ('then'), sql-count-null made structurally k-safe (odd n), Prolog snippet given a Datalog-excluding marker, js-coercion digits generated, mutable-default answer decoupled from the echoed prompt number.

---

**code-trace-while-halving** | tags: code, reasoning | kind: regex
Prompt: \"What does this Python program print?\n\nx = {{n}}\ncount = 0\nwhile x > 1:\n    x = x // 2\n    count += 1\nprint(count)\n\nReply with ONLY the integer, no commentary.\"
Param: `n:{int:{min:5,max:60}}`; `c:{expr:'n > 31 ? 5 : n > 15 ? 4 : n > 7 ? 3 : 2'}` (chained ternary = floor(log2 n) over 5–60, no float log needed; hand-verified: 5–7→2, 8–15→3, 16–31→4, 32–60→5).
Derivation: halvings of n via `//2` until x≤1 = floor(log2(n)) → regex `^\\s*{{c}}\\s*$`.
forgiveFormatting: yes

**code-trace-loop-continue** | tags: code, reasoning, gotcha | kind: regex
Prompt: \"What does this Python program print?\n\ntotal = 0\nfor i in range({{n}}):\n    if i == {{k}}:\n        continue\n    total += i\nprint(total)\n\nReply with ONLY the integer, no commentary.\"
Param: `n:{int:{min:6,max:9}}`; `k:{int:{min:1,max:5}}` (k<n guaranteed by ranges); `ans:{expr:'n*(n-1)/2 - k'}`.
Derivation: sum 0..n-1 minus the skipped k → regex `^\\s*{{ans}}\\s*$`. Trap: ignoring the continue (n(n-1)/2). Distinct from expansion's code-trace-sum-range (no skip there).
forgiveFormatting: yes

**code-trace-recursion-fib** | tags: code, reasoning | kind: regex
Prompt: \"def f(n):\n    if n < 2:\n        return n\n    return f(n-1) + f(n-2)\n\nWhat does f({{n}}) return? Reply with ONLY the integer, no commentary.\"
Param: `n:{int:{min:6,max:10}}`; `ans:{expr:'[0,1,1,2,3,5,8,13,21,34,55][n]'}` (Fib lookup indexed by n; f(6)=8 … f(10)=55, hand-verified).
Derivation: standard Fibonacci with F0=0, F1=1 → regex `^\\s*{{ans}}\\s*$`. Distinct from expansion's code-trace-recursion-fact (factorial).
forgiveFormatting: yes

**code-trace-range-last** | tags: code, reasoning, gotcha | kind: regex
Prompt: \"What is the LAST value this Python loop prints?\n\nfor i in range({{a}}, {{b}}):\n    print(i)\n\nReply with ONLY the integer, no commentary.\"
Param: `a:{int:{min:2,max:9}}`; `d:{int:{min:4,max:12}}`; `b:{expr:'a + d'}`; `last:{expr:'a + d - 1'}`.
Derivation: range excludes the stop value → last printed is b-1 → regex `^\\s*{{last}}\\s*$`. Off-by-one trap: answering b. (Expansion's code-fix-off-by-one is a FIX task on `range(1,n)`; this is output prediction.)
forgiveFormatting: yes

**code-spot-bug-line** | tags: code, debugging, reasoning | kind: regex
Prompt: \"Exactly one line of this Python function has a logic bug. Reply with ONLY the line number (the number before the colon), no commentary.\n\n{{snip}}\"
Param (idx-table): `idx:{pick:[0,1,2,3]}`; `snip:{expr:` 4 line-numbered snippets as string literals `[idx]}`; `ans:{expr:'[5,3,3,5][idx]'}`. Rows (each hand-verified to have exactly one wrong line):
- 0: `1: def is_even(n):` / `2:     if n % 2 == 0:` / `3:         return True` / `4:     else:` / `5:         return True` → bug line 5 (should be False)
- 1: `1: def is_negative(n):` / `2:     if n < 0:` / `3:         return False` / `4:     else:` / `5:         return False` → bug line 3 (should be True)
- 2: `1: def absolute(n):` / `2:     if n < 0:` / `3:         return n` / `4:     else:` / `5:         return n` → bug line 3 (should be -n)
- 3: `1: def maximum(a, b):` / `2:     if a > b:` / `3:         return a` / `4:     else:` / `5:         return a` → bug line 5 (should be b)
Derivation: only one branch contradicts the function's name → regex `^\\s*{{ans}}\\s*$` (numeric).
forgiveFormatting: yes

**code-bigO-sequential-loops** | tags: code, reasoning, gotcha | kind: regex
Prompt: \"What is the time complexity of this snippet?\n\nfor i in range(n):\n    a += i\nfor j in range(n):\n    b += j\n\nReply with Big-O notation only, e.g. O(n log n). No commentary.\"
Param: FIXED — the answer is a complexity class (a fixed string); loop-count cosmetics don't change it and the class can't be templated into regex (numbers-only rule).
Derivation: two SEQUENTIAL (not nested) loops → O(n); regex `^\\s*O\\(\\s*n\\s*\\)\\s*$`. Trap: O(n^2). `acceptWithRemark: [{kind:'regex', value:'^\\\\s*O\\\\(\\\\s*2\\\\s*\\\\*?\\\\s*n\\\\s*\\\\)\\\\s*$', remark:'gave unsimplified O(2n)'}]`. Distinct from existing code-bigO-nested (O(n²)) and expansion's single-loop/binary-search.
forgiveFormatting: yes

**code-bigO-triple-nested** | tags: code, reasoning | kind: regex
Prompt: \"What is the time complexity of this snippet?\n\nfor i in range(n):\n    for j in range(n):\n        for k in range(n):\n            total += i * j * k\n\nReply with Big-O notation only, e.g. O(n). No commentary.\"
Param: FIXED — same rationale as above (string complexity class).
Derivation: three nested n-loops → O(n³); regex `^\\s*O\\(\\s*n\\s*(?:\\^\\s*3|\\*\\*\\s*3|³)\\s*\\)\\s*$` (mirrors code-bigO-nested's exponent-notation alternation).
forgiveFormatting: yes

**code-sql-sum-where** | tags: code, reasoning, arithmetic | kind: regex
Prompt: \"Given this table `sales`:\n\n| id | region | amount |\n| 1 | north | {{a1}} |\n| 2 | south | {{b1}} |\n| 3 | north | {{a2}} |\n| 4 | south | {{b2}} |\n| 5 | north | {{a3}} |\n\nWhat single number does this query return?\n\nSELECT SUM(amount) FROM sales WHERE region = 'north';\n\nReply with ONLY the integer, no commentary.\"
Param: `a1,a2,a3:{int:{min:11,max:99}}`; `b1,b2:{int:{min:11,max:99}}`; `s:{expr:'a1 + a2 + a3'}`.
Derivation: sum of the three north rows → regex `^\\s*{{s}}\\s*$`. Distinct from expansion's sql-count-rows-filter (COUNT with threshold) and sql-clause-where (keyword fact).
forgiveFormatting: yes

**code-sql-count-null** | tags: code, gotcha, reasoning | kind: regex  *(FIXED: n forced odd so the trap answer k can never equal n-k)*
Prompt: \"A table `users` has exactly {{n}} rows. The `email` column is NULL in exactly {{k}} of those rows; every other column contains no NULLs.\n\nWhat single number does this query return?\n\nSELECT COUNT(email) FROM users;\n\nReply with ONLY the integer, no commentary.\"
Param: `h:{int:{min:4,max:9}}`; `n:{expr:'2*h + 1'}` (n ∈ 9..19, always ODD); `k:{int:{min:2,max:6}}`; `ans:{expr:'n - k'}`.
Derivation: COUNT(column) skips NULLs (unlike COUNT(*)) → n-k; regex `^\\s*{{ans}}\\s*$`. Trap answers always differ structurally: n ≠ n-k since k≥2, and because n is odd, n-k and k have opposite parity so k ≠ n-k for EVERY sampling (the old n∈[8,20] design collided at (8,4),(10,5),(12,6)).
forgiveFormatting: yes

**code-regex-greedy-match** | tags: code, reasoning, gotcha, character-level | kind: exact  *(FIXED: inter-quote filler changed 'and' → 'then' so a lazy/findall enumeration reply '\"hi\" and \"bye\"' can no longer collide with the greedy answer)*
Prompt: \"Using standard greedy regex matching (e.g. Python re.search), what is the FULL text matched by the pattern \\\".*\\\" (a double quote, dot-star, double quote) in this string?\n\nsay \\\"{{w1}}\\\" then \\\"{{w2}}\\\" later\n\nReply with ONLY the matched text, including the quote characters. No commentary.\"
Param: `w1:{pick:['hi','up','go','ok']}`; `w2:{pick:['bye','down','stop','now']}`; `ans:{expr:'\\'\"\\' + w1 + \\'\" then \"\\' + w2 + \\'\"\\''}` (builds the string `\"w1\" then \"w2\"` — exact templates accept string vars; no pick word collides with the literal 'then').
Derivation: greedy `.*` spans from the FIRST quote to the LAST quote → exact `{{ans}}` (e.g. `\"hi\" then \"bye\"`). Lazy-match trap `\"{{w1}}\"` alone fails, and an English ENUMERATION of the two lazy matches ('\"hi\" and \"bye\"') now also fails because the fixture text between the quoted words is 'then', not 'and'. `acceptWithRemark: [{kind:'contains', value:'{{w1}}\" then \"{{w2}}', remark:'greedy span correct but wrapped in extra formatting'}]` forgives backtick/quote wrappers without ever passing the lazy or enumeration answer.
forgiveFormatting: no (the exact matched span including quote characters IS the test)

**code-regex-count-matches** | tags: code, reasoning, character-level | kind: regex
Prompt: \"How many NON-OVERLAPPING matches does the regex pattern aba find in the string below, scanning left to right (like Python re.findall)?\n\n{{s}}\n\nReply with ONLY the integer, no commentary.\"
Param: `n:{int:{min:3,max:8}}`; `s:{expr:\"'ab'.repeat(n) + 'a'\"}`; `m:{expr:'ceil(n / 2)'}`.
Derivation: in `abab…a`, findall consumes 3 chars per match and resumes after it → matches = ceil(n/2) (hand-verified n=3→2, 4→2, 5→3, 6→3, 7→4, 8→4); regex `^\\s*{{m}}\\s*$`. Trap: counting overlapping occurrences (n).
forgiveFormatting: yes

**code-trace-and-value** | tags: code, reasoning, gotcha, fast | kind: regex
Prompt: \"What does this Python line print?\n\nprint({{x}} and {{y}})\n\nReply with ONLY the printed value, no commentary.\"
Param: `x:{int:{min:2,max:9}}`; `y:{int:{min:11,max:99}}`.
Derivation: `and` returns the LAST operand when the first is truthy → prints y; regex `^\\s*{{y}}\\s*$`. Trap: `True`. Complements (does not duplicate) expansion's code-trace-shortcircuit, which tests `0 or x` returning the first truthy value.
forgiveFormatting: yes

**code-precedence-unary-minus-pow** | tags: code, reasoning, gotcha | kind: regex
Prompt: \"What does this Python expression evaluate to?\n\n-{{a}} ** 2\n\nReply with ONLY the integer, no commentary.\"
Param: `a:{int:{min:2,max:9}}`; `q:{expr:'a * a'}`.
Derivation: `**` binds tighter than unary minus → -(a²); regex `^\\s*-{{q}}\\s*$` (minus is a fixed literal; only the positive number q is substituted). Trap: +a².
forgiveFormatting: yes

**code-precedence-shift-add** | tags: code, reasoning, gotcha | kind: regex
Prompt: \"What does this Python expression evaluate to?\n\n1 << {{k}} + 1\n\nReply with ONLY the integer, no commentary.\"
Param: `k:{int:{min:2,max:6}}`; `ans:{expr:'Math.pow(2, k + 1)'}`.
Derivation: `+` binds tighter than `<<` → 1 << (k+1) = 2^(k+1); regex `^\\s*{{ans}}\\s*$`. Trap (1<<k)+1 always differs (e.g. 8 vs 5, 16 vs 9). Math.pow exact for these small ints.
forgiveFormatting: yes

**code-trace-mutable-default** | tags: code, reasoning, gotcha | kind: regex  *(FIXED: answer decoupled from the number echoed in the prompt — one extra printed call makes the answer k+1, so echoing k now fails)*
Prompt: \"What does this Python program print?\n\ndef f(item, box=[]):\n    box.append(item)\n    return len(box)\n\nfor i in range({{k}}):\n    f(i)\nprint(f({{k}}))\n\nReply with ONLY the integer, no commentary.\"
Param: `k:{pick:[3,4,5,6]}`; `ans:{expr:'k + 1'}`.
Derivation: the default list is created ONCE and shared across calls; the loop makes k calls and the final printed call is the (k+1)-th, so len(box) = k+1 → regex `^\\s*{{ans}}\\s*$`. Trap 1: `1` (assuming a fresh list per call — the actual gotcha). Trap 2: echoing the prompt's salient number k — now wrong, so the lazy-echo heuristic no longer passes.
forgiveFormatting: yes

**code-trace-closure-late-binding** | tags: code, reasoning, gotcha | kind: regex
Prompt: \"What does this Python program print?\n\nfuncs = [lambda: i for i in range({{n}})]\nprint(funcs[0]())\n\nReply with ONLY the integer, no commentary.\"
Param: `n:{int:{min:4,max:9}}`; `m:{expr:'n - 1'}`.
Derivation: every lambda closes over the same variable i (late binding), whose final value after the comprehension is n-1 — funcs[0]() returns n-1, not 0 → regex `^\\s*{{m}}\\s*$`. Trap: 0.
forgiveFormatting: yes

**code-identify-language-obscure** | tags: code, classification | kind: exact  *(FIXED: Prolog row now contains an arithmetic `is` goal, which Datalog does not have — 'Datalog' is no longer a defensible answer, no acceptWithRemark needed)*
Prompt: \"What programming language is this snippet?\n\n{{snip}}\n\nReply with ONLY the language name, one word, no commentary.\"
Param (idx-table): `idx:{pick:[0,1,2,3,4,5]}`; `snip:{expr:` string-literal array `[idx]}`; `ans:{expr:\"['Erlang','Prolog','Fortran','COBOL','Elixir','Lua'][idx]\"}`. Rows (each with an unmistakable language-unique marker):
- 0 Erlang: `-module(hello).\n-export([start/0]).\nstart() -> io:format(\"hi~n\").`
- 1 Prolog: `likes(mary, wine).\nplus_one(X, Y) :- Y is X + 1.\nolder(john, X) :- likes(mary, X).` — the `Y is X + 1` arithmetic goal is a Prolog-unique construct (Datalog has no `is`/function evaluation), disambiguating the fact+rule shape
- 2 Fortran: `program hello\n  print *, \"hi\"\nend program hello`
- 3 COBOL: `IDENTIFICATION DIVISION.\nPROGRAM-ID. HELLO.\nPROCEDURE DIVISION.\n    DISPLAY \"HI\".`
- 4 Elixir: `defmodule Hello do\n  def hi do\n    IO.puts(\"hi\")\n  end\nend`
- 5 Lua: `local function greet(name)\n  print(\"hi \" .. name)\nend`
Derivation: exact `{{ans}}` (string var → exact kind per numbers-only-regex rule). No overlap with existing code-identify-language (Rust) or expansion's variants (Ruby/Go/PHP/Kotlin/Haskell).
forgiveFormatting: yes (letter case only)

**code-trace-tuple-swap** | tags: code, reasoning, gotcha | kind: regex
Prompt: \"What does this Python program print?\n\na, b = {{a}}, {{b}}\na, b = b, a + b\nprint(a, b)\n\nReply with ONLY the two printed numbers separated by a single space, no commentary.\"
Param: `a:{int:{min:3,max:9}}`; `b:{int:{min:10,max:20}}` (disjoint ranges guarantee a≠b so the sequential-evaluation trap value differs); `s:{expr:'a + b'}`.
Derivation: tuple assignment evaluates the right side with OLD values → new a=b, new b=a+b → regex `^\\s*{{b}}\\s+{{s}}\\s*$` (numbers only). Trap: sequential evaluation giving `b 2b`.
forgiveFormatting: yes

**code-predict-exception** | tags: code, reasoning | kind: exact
Prompt: \"What exception type does running this Python code raise?\n\n{{snip}}\n\nReply with ONLY the exception class name (e.g. ValueError), no commentary.\"
Param (idx-table): `idx:{pick:[0,1,2,3,4,5]}`; `snip:{expr:` string array `[idx]}`; `ans:{expr:\"['IndexError','KeyError','ValueError','TypeError','NameError','ZeroDivisionError'][idx]\"}`. Rows (each raising exactly one canonical exception):
- 0: `[1, 2, 3][5]` → IndexError
- 1: `{'a': 1}['b']` → KeyError
- 2: `int('hello')` → ValueError
- 3: `len(42)` → TypeError
- 4: `print(undefined_variable)` → NameError
- 5: `1 / 0` → ZeroDivisionError
Derivation: exact `{{ans}}` (string var → exact kind).
forgiveFormatting: yes (backticks/case cosmetic; the class name itself must match)

**code-trace-js-coercion** | tags: code, gotcha, reasoning | kind: exact  *(FIXED: digits are now GENERATED per run — idx only picks the operator/operand shape, so no row is a memorized fixed literal like '5' + 3)*
Prompt: \"What does this JavaScript line print to the console?\n\nconsole.log({{snip}})\n\nReply with ONLY the printed value, no quotes, no commentary.\"
Param: `x:{int:{min:2,max:9}}`; `y:{int:{min:2,max:9}}`; `idx:{pick:[0,1,2,3,4]}`; `snip:{expr:\"[`'${x}' + ${y}`, `'${x}' - ${y}`, `'${x}' * '${y}'`, `${x} + '${y}'`, `${x*2+y} - '${y}'`][idx]\"}`; `ans:{expr:\"['' + x + y, String(x - y), String(x * y), '' + x + y, String(x*2)][idx]\"}` (full-JS expr per case-generate.ts, same inline-array idx-table pattern as gotcha-decimal-compare).
Derivation per row (JS coercion): 0 `'x' + y` → string concat \"xy\"; 1 `'x' - y` → numeric x−y (may be negative/zero — still one exact answer); 2 `'x' * 'y'` → numeric x·y; 3 `x + 'y'` → concat \"xy\"; 4 `(2x+y) - 'y'` → numeric 2x. Exact `{{ans}}`. Trap distinctness verified over the full ranges: concat answers (2 digits, ≥22) never equal numeric sums (≤18); x·y = 10x+y has no solution with x,y ∈ 2..9; row 4's concat misread is 3+ chars vs 2x ≤ 18. Mixed concat/numeric rows kill blanket concatenate-always or math-always heuristics.
forgiveFormatting: yes

---

## Coverage map
- trace parameterized loops/recursion/off-by-one: code-trace-while-halving, code-trace-loop-continue, code-trace-recursion-fib, code-trace-range-last
- predict output: code-trace-tuple-swap, code-predict-exception, code-trace-js-coercion (plus all trace cases)
- spot the bug line: code-spot-bug-line
- Big-O: code-bigO-sequential-loops, code-bigO-triple-nested
- SQL result prediction: code-sql-sum-where, code-sql-count-null
- regex behavior: code-regex-greedy-match, code-regex-count-matches
- short-circuit/precedence gotchas: code-trace-and-value, code-precedence-unary-minus-pow, code-precedence-shift-add
- mutable-default/closure traps: code-trace-mutable-default, code-trace-closure-late-binding
- language ID (obscure): code-identify-language-obscure

## FORGIVE_FORMATTING_IDS joiners
All except code-regex-greedy-match (character/quote fidelity is the test).

## Parameterization: 18/20 (only the two Big-O cases are fixed — their answers are complexity-class strings that cannot enter a regex as template vars and are invariant under loop-count cosmetics). code-trace-js-coercion now generates its operand digits, so the idx-table cases (spot-bug-line, identify-language-obscure, predict-exception) remain the only fixture-row picks, and each of those tests recognition of fixed artifacts (bugs/languages/exceptions) rather than derivable values.

## Revision log (review fixes applied)
1. [major] code-regex-greedy-match: filler 'and' → 'then' between the quoted words; greedy answer is now `\"w1\" then \"w2\"` and the acceptWithRemark contains-clause is `{{w1}}\" then \"{{w2}}` — a lazy/findall enumeration reply ('\"hi\" and \"bye\"') fails both paths.
2. [minor] code-sql-count-null: n is now 2h+1 (odd, 9..19) so n−k ≠ k by parity for every sampling; derivation note corrected.
3. [minor] code-identify-language-obscure: Prolog row rewritten with a `Y is X + 1` arithmetic goal (Prolog-unique, not valid Datalog); snippet amendment chosen over acceptWithRemark since accept clauses cannot be conditioned on idx.
4. [minor] code-trace-js-coercion: operand digits generated (x,y ∈ 2..9); idx picks only the operator/shape; ans computed per row; trap distinctness re-verified over the full ranges.
5. [minor] code-trace-mutable-default: added a final `print(f({{k}}))` after the loop so the answer is k+1 — the fresh-list misconception still yields 1, and echoing the prompt's k now fails.