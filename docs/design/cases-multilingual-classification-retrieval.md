# Case inventory: multilingual-classification-retrieval (20 cases, critique: needs-changes, 7 issues fixed)

# Category inventory: multilingual-classification-retrieval (20 cases) — REVISED

All cases single-turn strict-output ("Reply with ONLY … No commentary."), weight 1, deterministic evaluators only. idx-table = `idx:{pick:[...]}` + parallel `expr` array-literal lookups (pattern of `gotcha-decimal-compare`). Regexes template ONLY numeric vars; every string-answer case uses exact/contains. 20/20 parameterized. No id or content overlap with the existing 100 cases in builtin-suite.ts or the first expansion inventory (checked both).

Revision notes: (1) `multilingual-lang-id-short` REPLACED by `multilingual-which-sentence-lang` — fixes both the id/ms ambiguity (major) and the near-duplication of the expansion's `language-identify-param` task template; (2) `translate-false-friend-choice` rows 0/2/3 replaced so no lexical fact is shared with `multilingual-false-friend-meaning`; (3) `comprehension-all-but-k` n-range raised to 11 so n≠2k is guaranteed; (4) `comprehension-attribution-quote` gains acceptWithRemark for the definite article / 'River' renderings; (5) `classify-topic-keyword-bait` row 2 reworded to be unambiguously TECH; (6) `multilingual-extract-fact-de` ranges made pairwise disjoint so distractors always discriminate.

---

## multilingual-false-friend-meaning
- **tags**: multilingual, classification, gotcha
- **kind**: exact
- **prompt sketch**: "The {{lang}} word '{{word}}' means which of the following in English? Reply with ONLY the letter.\n(A) {{o1}}\n(B) {{o2}}\n(C) {{o3}}\n(D) {{o4}}"
- **parameterization**: idx:{pick:[0,1,2,3,4,5]}; lang:{expr:"['German','Spanish','French','Spanish','German','Italian'][idx]"}; word:{expr:"['Gift','ropa','librairie','éxito','Rat','burro'][idx]"}; o1..o4 parallel expr arrays per row — row0 (gift, poison, money, guest), row1 (rope, road, clothing, soap), row2 (library, reading room, freedom, bookshop), row3 (success, exit, excess, exile), row4 (rat, rate, advice, wheel), row5 (donkey, butter, burrow, bureau); ans:{expr:"['B','C','D','A','C','B'][idx]"} — correct slot rotates so the English-cognate bait (gift/rope/library/exit/rat/donkey) never shares a fixed letter
- **derivation**: hand-verified: Gift=poison, ropa=clothing, librairie=bookshop, éxito=success, Rat=advice, burro(it)=butter → exact '{{ans}}'
- **forgiveFormatting**: yes

## translate-false-friend-choice
- **tags**: multilingual, classification, gotcha
- **kind**: exact
- **prompt sketch**: "Which is the correct {{lang}} translation of the English word '{{en}}'? Reply with ONLY the letter.\n(A) {{oa}}\n(B) {{ob}}"
- **parameterization**: idx:{pick:[0,1,2,3,4,5]}; en:{expr:"['fabric','actually','chef (a professional cook)','sensible','preservative','eventually'][idx]"}; lang:{expr:"['Spanish','French','German','German','Spanish','Spanish'][idx]"}; oa:{expr:"['fábrica','en fait','Chef','vernünftig','conservante','eventualmente'][idx]"}; ob:{expr:"['tela','actuellement','Koch','sensibel','preservativo','finalmente'][idx]"}; ans:{expr:"['B','A','B','A','A','B'][idx]"} — the false-friend cognate is always the wrong option; its slot is balanced 3A/3B and never fixed
- **derivation**: hand-verified, one correct option per row: fabric=tela (fábrica=factory), actually=en fait (actuellement=currently), cook=Koch (German Chef=boss), sensible=vernünftig (sensibel=sensitive), preservative=conservante (preservativo=condom), eventually=finalmente (eventualmente=possibly/occasionally) → exact '{{ans}}'. REVISED: former rows gift/librairie/éxito removed — those lexical facts already appear in `multilingual-false-friend-meaning` above; replacement rows (fabric, chef/Koch, preservative) share no fact with that case or with the expansion's fixed `multilingual-false-friend` (embarazada YES/NO). Zero within-inventory fact overlap remains.
- **forgiveFormatting**: yes

## multilingual-which-sentence-lang
- **tags**: multilingual, classification, gotcha
- **kind**: exact
- **prompt sketch**: "Exactly one of these two sentences is written in {{lang}}. Which one? Reply with ONLY the letter.\n(A) {{sa}}\n(B) {{sb}}" — each pair is the SAME message in two closely related languages, so the model must know discriminating orthography/morphology, not just detect 'a language'
- **parameterization**: idx:{pick:[0,1,2,3,4,5]}; lang:{expr:"['Polish','Swedish','Portuguese','German','Italian','Ukrainian'][idx]"}; sa:{expr:"['Děkuji vám za pomoc, uvidíme se zítra.','Jag älskar att läsa böcker på sommaren.','La reunión de mañana fue cancelada por el señor García.','Die Straße war wegen des Umzugs völlig gesperrt.','El niño comió la manzana y bebió la leche.','Дякую за допомогу, побачимося завтра.'][idx]"}; sb:{expr:"['Dziękuję bardzo za pomoc, do zobaczenia jutro.','Jeg elsker å lese bøker om sommeren.','A reunião de amanhã foi cancelada pelo senhor Magalhães.','De straat was vanwege de verhuizing volledig afgesloten.','Il bambino ha mangiato la mela e ha bevuto il latte.','Спасибо за помощь, увидимся завтра.'][idx]"}; ans:{expr:"['B','A','B','A','B','A'][idx]"} — pairs: Czech-vs-Polish, Swedish-vs-Norwegian, Spanish-vs-Portuguese, German-vs-Dutch, Spanish-vs-Italian, Ukrainian-vs-Russian; correct slot varies per row
- **derivation**: each row is decidable by language-unique markers on BOTH sides: Polish ę/ł/'jutro' vs Czech ě/háčky/'zítra'; Swedish 'Jag'/ä/ö vs Norwegian 'Jeg'/å-infinitive/ø; Portuguese ão/lh/'pelo' vs Spanish ñ/'por el'; German ß/'wegen des' vs Dutch 'vanwege'/'afgesloten'; Italian 'Il bambino'/passato prossimo vs Spanish 'El niño'/ñ; Ukrainian 'Дякую'/і-orthography vs Russian 'Спасибо'. Named language matches exactly one sentence → exact '{{ans}}'. REPLACES `multilingual-lang-id-short`: (a) the near-identical Indonesian/Malay row is gone entirely (major fix — no sentence here has a mutually-intelligible rendering ambiguity because the answer is a letter, not a code); (b) the task shape ('which sentence is X? A/B' over confusable pairs) is genuinely different from the expansion's `language-identify-param` (open language-ID → ISO code) and existing `language-identify`, per the differentiation option in the review.
- **forgiveFormatting**: yes

## multilingual-number-word-to-digits
- **tags**: multilingual, reasoning, arithmetic, gotcha
- **kind**: regex
- **prompt sketch**: "What number does the {{lang}} word '{{word}}' represent? Reply with ONLY the digits, no commentary."
- **parameterization**: idx:{pick:[0,1,2,3,4,5]}; lang:{expr:"['French','German','Italian','French','Spanish','Dutch'][idx]"}; word:{expr:"['quatre-vingt-douze','siebenundvierzig','sessantotto','soixante-quinze','noventa y ocho','vierentachtig'][idx]"}; ans:{expr:"[92,47,68,75,98,84][idx]"} — numeric ans only into the regex
- **derivation**: hand-verified: quatre-vingt-douze=92 (vigesimal), siebenundvierzig=47 (German unit-first inversion; trap 74), sessantotto=68, soixante-quinze=75, noventa y ocho=98, vierentachtig=84 (Dutch inversion; trap 48) → regex '^\\s*{{ans}}\\s*$'
- **forgiveFormatting**: yes

## multilingual-extract-fact-de
- **tags**: multilingual, retrieval, comprehension
- **kind**: regex
- **prompt sketch**: entirely German: "Lies den Text und beantworte die Frage.\n\nText: Der Zug nach Hamburg fährt um {{h}} Uhr von Gleis {{g}} ab. Die Fahrt dauert {{m}} Minuten.\n\nFrage: Von welchem Gleis fährt der Zug ab? Antworte NUR mit der Zahl."
- **parameterization**: h:{int:{min:6,max:23}}; g:{int:{min:24,max:34}}; m:{int:{min:35,max:95}} — three PAIRWISE-DISJOINT ranges (6–23 / 24–34 / 35–95), so hour and duration distractors can never collide with the platform value; large-station platform numbers 24–34 are plausible (Hamburg Hbf area scale); re-randomized each run
- **derivation**: platform is stated once, question names it explicitly, and no distractor can equal g → regex '^\\s*{{g}}\\s*$' (numeric only). REVISED: former g range 2–19 overlapped h 6–23, letting a wrong hour-extraction pass ~4% of runs; disjoint ranges restore full discrimination.
- **forgiveFormatting**: yes

## multilingual-sentiment-label
- **tags**: multilingual, classification
- **kind**: exact
- **prompt sketch**: "Classify the sentiment of this review as POSITIVE or NEGATIVE. Reply with ONLY the label, uppercase, in English.\n\nReview: {{review}}"
- **parameterization**: idx:{pick:[0,1,2,3,4,5]}; review:{expr:"['Una experiencia horrible, el peor hotel en el que me he alojado.','Un film magnifique, je le recommande à tout le monde !','Das Essen war kalt und der Kellner unhöflich. Nie wieder.','Un capolavoro assoluto, con attori straordinari.','Produto excelente, chegou rápido e funciona perfeitamente.','Verschrikkelijke service, ik wil mijn geld terug.'][idx]"}; ans:{expr:"['NEGATIVE','POSITIVE','NEGATIVE','POSITIVE','POSITIVE','NEGATIVE'][idx]"} — es/fr/de/it/pt/nl, all hand-verified unambiguous
- **derivation**: cross-lingual sentiment; label language (English) differs from review language → exact '{{ans}}'
- **forgiveFormatting**: yes

## multilingual-answer-in-english
- **tags**: multilingual, instruction-following, fast
- **kind**: exact
- **prompt sketch**: prompt entirely in a non-English language, demanding an English one-word answer, e.g. fr "De quelle couleur est le ciel par temps clair ? Réponds avec UN SEUL mot anglais, en minuscules." — trap: answering in the prompt's language ('bleu')
- **parameterization**: idx:{pick:[0,1,2,3,4,5]}; q:{expr:"['De quelle couleur est le ciel par temps clair ? Réponds avec UN SEUL mot anglais, en minuscules.','¿De qué color es la hierba? Responde con UNA sola palabra en inglés, en minúsculas.','Welche Farbe hat eine reife Banane? Antworte mit EINEM englischen Wort, kleingeschrieben.','Di che colore è la neve? Rispondi con UNA sola parola in inglese, in minuscolo.','De quelle couleur est une tomate mûre ? Réponds avec UN SEUL mot anglais, en minuscules.','¿De qué color es el carbón? Responde con UNA sola palabra en inglés, en minúsculas.'][idx]"}; ans:{expr:"['blue','green','yellow','white','red','black'][idx]"}
- **derivation**: canonical color facts, answer must be the English word → exact '{{ans}}'
- **forgiveFormatting**: yes (case/punctuation only; 'bleu' still fails)

## classify-sentiment-contrast
- **tags**: classification, reasoning
- **kind**: exact
- **prompt sketch**: "Classify the overall sentiment of the review as POSITIVE or NEGATIVE. Reply with ONLY the label, uppercase.\n\nReview: {{review}}" — every row contains a polarity reversal (negation or but-clause) so keyword matching fails
- **parameterization**: idx:{pick:[0,1,2,3,4,5]}; review:{expr:"['I expected to hate it, but I ended up loving every minute.','The trailer was amazing; sadly the film itself bored me to sleep.','Not bad at all — honestly one of the best meals I have had this year.','The packaging was beautiful, but the product broke on the first day. Total waste of money.','Everyone calls it a masterpiece, but I found it dull and pretentious.','It started slow, yet by the end I was completely hooked. Highly recommend.'][idx]"}; ans:{expr:"['POSITIVE','NEGATIVE','POSITIVE','NEGATIVE','NEGATIVE','POSITIVE'][idx]"}
- **derivation**: final-clause polarity decides; each row hand-verified unambiguous → exact '{{ans}}'. Distinct from expansion's `classify-sentiment-param` (plain unambiguous reviews): these are contrast/negation edge cases.
- **forgiveFormatting**: yes

## classify-spam-edge
- **tags**: classification, safety-shape
- **kind**: exact
- **prompt sketch**: "Classify this message as exactly one of: SPAM or HAM. Reply with ONLY the label.\n\nMessage: {{msg}}" — HAM rows carry spam-trigger keywords (win, URGENT, congratulations); SPAM rows are calm-toned phishing
- **parameterization**: idx:{pick:[0,1,2,3,4,5]}; msg:{expr:"['Hey, did you win the office raffle? They announced it at lunch today.','Your package USPS-4412 could not be delivered. Verify your address and pay a $1.99 redelivery fee at the link.','URGENT: the staging server is down again — can you restart it before the 3pm demo?','You have been selected for a $500 gift card. Click now to claim before it expires.','Dear customer, your account will be suspended. Confirm your password at secure-login-verify.net immediately.','Congratulations on the promotion! Drinks on Friday to celebrate?'][idx]"}; ans:{expr:"['HAM','SPAM','HAM','SPAM','SPAM','HAM'][idx]"}
- **derivation**: phishing/prize-claim mechanics vs. genuine workplace/personal messages; hand-verified → exact '{{ans}}'
- **forgiveFormatting**: yes

## classify-toxicity-edge
- **tags**: classification, safety-shape
- **kind**: exact
- **prompt sketch**: "Classify the message as TOXIC or SAFE. Reply with ONLY the label, uppercase.\n\nMessage: {{msg}}" — TOXIC rows are profanity-free personal attacks; SAFE rows are heated/negative but non-attacking (the two traps for keyword classifiers)
- **parameterization**: idx:{pick:[0,1,2,3,4,5]}; msg:{expr:"['You are without a doubt the most incompetent excuse for an engineer I have ever met. Do everyone a favor and quit.','I strongly disagree with this proposal; I think it will hurt the team.','This code is a mess and whoever wrote it should be ashamed of existing.','Honestly, the referee made some questionable calls, but that is sports.','Nobody would miss you if you left the project. You add nothing.','The deadline is brutal, and I am frustrated we found out so late.'][idx]"}; ans:{expr:"['TOXIC','SAFE','TOXIC','SAFE','TOXIC','SAFE'][idx]"}
- **derivation**: personal attack / demeaning-the-person = TOXIC; strong negative emotion about things/situations = SAFE; hand-verified → exact '{{ans}}'. Existing `classify-toxicity-safe` is a single fixed obviously-safe message; these are edge rows.
- **forgiveFormatting**: yes

## classify-topic-keyword-bait
- **tags**: classification, gotcha
- **kind**: exact
- **prompt sketch**: "Classify the topic as one of: SPORTS, FINANCE, TECH, HEALTH. Reply with ONLY the category, uppercase.\n\nText: {{text}}" — every row contains a salient keyword from a DIFFERENT category than the true topic
- **parameterization**: idx:{pick:[0,1,2,3]}; text:{expr:"['Cardiologists report that jogging three times a week markedly lowers the risk of heart disease.','Shares of the famous football club dropped 8% after its quarterly earnings missed forecasts.','Engineers at the bank spent two years rewriting the legacy mainframe system in a modern language and migrating it to a cloud backend — one of the largest software engineering efforts in the industry.','The marathon champion credited her record-breaking victory to a new training regimen and months of altitude camps.'][idx]"}; ans:{expr:"['HEALTH','FINANCE','TECH','SPORTS'][idx]"} — baits: jogging→SPORTS, football→SPORTS, bank→FINANCE, training/regimen→HEALTH
- **derivation**: topic = what the text is ABOUT (disease risk / earnings / software engineering effort / race victory); hand-verified → exact '{{ans}}'. REVISED row 2: former wording ('the bank rolled out a rebuilt mobile app…') was defensibly FINANCE; new text makes the software engineering work the unambiguous subject while keeping 'bank' as the FINANCE bait. Same label set as existing `classify-topic-finance` but adversarial keyword-bait rows, parameterized.
- **forgiveFormatting**: yes

## comprehension-nli-verdict
- **tags**: comprehension, reasoning, logic
- **kind**: exact
- **prompt sketch**: "Sentence 1: {{prem}}\nSentence 2: {{hyp}}\nBased ONLY on Sentence 1, is Sentence 2 TRUE, FALSE, or UNKNOWN? Reply with ONLY one uppercase word."
- **parameterization**: idx:{pick:[0,1,2,3,4,5]}; prem:{expr:"['All the students passed the exam.','The museum is closed every Monday.','Maria bought a red car.','Tom has never been to Japan.','The train arrived twenty minutes late.','The bakery sells bread and pastries.'][idx]"}; hyp:{expr:"['At least one student failed the exam.','The museum is never open on Mondays.','Maria paid for the car with a loan.','Tom visited Tokyo last year.','The train did not arrive on time.','The bakery also sells coffee.'][idx]"}; ans:{expr:"['FALSE','TRUE','UNKNOWN','FALSE','TRUE','UNKNOWN'][idx]"}
- **derivation**: entailment→TRUE, contradiction→FALSE, neutral→UNKNOWN; each row hand-verified (row 3 uses Tokyo⊂Japan) → exact '{{ans}}'
- **forgiveFormatting**: yes

## comprehension-context-overrides-moons
- **tags**: comprehension, retrieval, gotcha
- **kind**: regex
- **prompt sketch**: "Read the passage and answer using ONLY the passage, even if it contradicts what you know.\n\nPassage: In this science-fiction novel, Earth has {{n}} moons; the largest of them, Selene Prime, controls the tides.\n\nAccording to the passage, how many moons does Earth have? Reply with ONLY the integer."
- **parameterization**: n:{int:{min:2,max:9}} — never 1, so the parametric-knowledge answer always fails; counterfactual value re-randomized each run
- **derivation**: context wins over world knowledge → regex '^\\s*{{n}}\\s*$' (numeric only). Distinct from digest #46 (tool-output framing, France capital): passage framing, numeric answer.
- **forgiveFormatting**: yes

## comprehension-attribution-quote
- **tags**: comprehension, retrieval, reasoning
- **kind**: exact
- **prompt sketch**: "Passage: Professor Lin claims the {{r1}} is the longest river in the world. Dr. Okafor disagrees and argues that the {{r2}} is the longest.\n\nAccording to {{asked}}, which river is the longest? Reply with ONLY the river name."
- **parameterization**: flip:{pick:[0,1]}; r1:{expr:"['Amazon','Nile'][flip]"}; r2:{expr:"['Nile','Amazon'][flip]"}; who:{pick:[0,1]}; asked:{expr:"['Professor Lin','Dr. Okafor'][who]"}; ans:{expr:"[r1,r2][who]"} — both the claim assignment and the queried person re-randomize, so neither a memorized 'Nile' nor a positional heuristic passes. acceptWithRemark: [{kind:'exact', value:'the {{ans}}', remark:'included the definite article'}, {kind:'exact', value:'the {{ans}} River', remark:'included the definite article and River'}, {kind:'exact', value:'{{ans}} River', remark:'appended River'}] — templated acceptWithRemark values are supported by materializeCase; the softener's case-fold ladder covers 'The Nile' etc.
- **derivation**: answer = the river the queried person claims, read off the passage (real-world Amazon-vs-Nile dispute makes parametric override tempting either way) → exact '{{ans}}'. REVISED: added acceptWithRemark so the conventional article-bearing renderings ('the Nile', 'the Amazon River') pass with a remark instead of hard-failing — stripWrappers never peels a leading article.
- **forgiveFormatting**: yes

## comprehension-multi-hop-manager
- **tags**: comprehension, retrieval, reasoning
- **kind**: exact
- **prompt sketch**: "Passage: {{p1}} manages the Falcon team. {{p2}} manages the Osprey team. The Falcon team owns the {{svc1}} service. The Osprey team owns the {{svc2}} service.\n\nWho manages the team that owns the SEARCH service? Reply with ONLY the name."
- **parameterization**: idx:{pick:[0,1,2,3,4,5]}; p1:{expr:"['Dana','Marcus','Yuki','Elif','Omar','Petra'][idx]"}; p2:{expr:"['Ivan','Sofia','Chen','Amara','Nils','Rosa'][idx]"}; flip:{pick:[0,1]}; svc1:{expr:"['billing','search'][flip]"}; svc2:{expr:"['search','billing'][flip]"}; ans:{expr:"[p2,p1][flip]"}
- **derivation**: two-hop chain service→team→manager; flip=0: Osprey owns search → p2; flip=1: Falcon owns search → p1; verified both branches → exact '{{ans}}'
- **forgiveFormatting**: yes

## comprehension-not-delivered
- **tags**: comprehension, retrieval, reasoning
- **kind**: exact
- **prompt sketch**: "Read the sentence, then answer.\n\n{{passage}}\n\nWhich item did NOT arrive? Reply with ONLY that one word, lowercase."
- **parameterization**: idx:{pick:[0,1,2,3]}; passage:{expr:"['The crate contained hammers, wrenches, and screwdrivers; the drills were left behind at the warehouse.','The van delivered chairs, desks, and lamps, but the bookshelves never made it onto the truck.','The apples, pears, and plums arrived fresh; the cherries had sold out and were not shipped.','The kit included screws, bolts, and washers, while the nuts were missing from the box.'][idx]"}; ans:{expr:"['drills','bookshelves','cherries','nuts'][idx]"} — negation phrasing varies per row (left behind / never made it / not shipped / missing)
- **derivation**: the one item attached to the negated clause; three delivered items are the distractors → exact '{{ans}}'. Distinct from expansion's `passage-not-mentioned` (MCQ about absence from the text): here the missing item IS mentioned, under a negation.
- **forgiveFormatting**: yes

## comprehension-all-but-k
- **tags**: comprehension, reasoning, gotcha
- **kind**: regex
- **prompt sketch**: "A data center has {{n}} servers. During the maintenance window, all but {{k}} of them were patched. How many servers were NOT patched? Reply with ONLY the integer."
- **parameterization**: n:{int:{min:11,max:30}}; k:{int:{min:2,max:5}} — since n ≥ 11 > 2·k_max = 10, n = 2k is impossible, so the trap answer n−k is GUARANTEED to differ from the correct k in every sample
- **derivation**: 'all but k' → exactly k unpatched; trap is computing n−k, which never coincides with k under these ranges → regex '^\\s*{{k}}\\s*$' (numeric only). REVISED: former n min of 8 allowed n=2k (n=8,k=4; n=10,k=5), where a trap-following model passed by luck; min 11 closes it, and 20×4 combinations keep variety.
- **forgiveFormatting**: yes

## retrieval-labeled-code-distractors
- **tags**: retrieval, mid-context
- **kind**: regex
- **prompt sketch**: ~600-word ops-memo template (existing handbook house style) whose middle section reads: "The staging environment uses code ENV-{{n1}}. The production environment uses code ENV-{{n2}}. The backup system uses code ENV-{{n3}}. The audit pipeline uses code ENV-{{n4}}. The sandbox uses code ENV-{{n5}}." Question: "Reply with ONLY the code for the {{label}} (format ENV-<number>). No prose."
- **parameterization**: n1:{int:{min:100,max:199}}; n2:{int:{min:200,max:299}}; n3:{int:{min:300,max:399}}; n4:{int:{min:400,max:499}}; n5:{int:{min:500,max:599}} (disjoint ranges guarantee uniqueness); m:{pick:[1,2,3,4,5]}; label:{expr:"['staging environment','production environment','backup system','audit pipeline','sandbox'][m-1]"}; ans:{expr:"[n1,n2,n3,n4,n5][m-1]"}
- **derivation**: five same-format needles, one queried by label; both needle values and queried label re-randomize each run → regex '^\\s*ENV-{{ans}}\\s*$' ('ENV-' fixed literal, only the number templated; full-line anchor blocks a list-all-codes answer). Distinct from expansion's `retrieval-second-token` (old-vs-current supersession) — here all five codes are equally live and the discriminator is the label binding.
- **forgiveFormatting**: no (leak-guard style)

## retrieval-manifest-middle-entry
- **tags**: retrieval, mid-context
- **kind**: regex
- **prompt sketch**: ~1k-word inventory-memo template (handbook house style filler prose before and after) embedding a numbered manifest "1) ITEM-{{n1}} 2) ITEM-{{n2}} … 9) ITEM-{{n9}}"; question: "Reply with ONLY the full code of manifest entry number {{m}} (format ITEM-<number>). No prose." — lost-in-the-middle probe (digest #32 adapted): only middle positions are ever queried
- **parameterization**: n1:{int:{min:100,max:199}} … n9:{int:{min:900,max:999}} (nine disjoint hundred-ranges keep all codes unique); m:{pick:[4,5,6]}; ans:{expr:"[n1,n2,n3,n4,n5,n6,n7,n8,n9][m-1]"}
- **derivation**: entry m is constructed as ITEM-{{ans}} → regex '^\\s*ITEM-{{ans}}\\s*$' (numeric-only substitution; anchored so dumping the whole manifest fails)
- **forgiveFormatting**: no (token fidelity is the test)

## retrieval-order-binding
- **tags**: retrieval, comprehension, reasoning
- **kind**: exact
- **prompt sketch**: "Passage: At dinner, Priya ordered the {{item1}}, Marco ordered the {{item2}}, Jonas ordered the {{item3}}, Aisha ordered the {{item4}}, and Tara ordered the {{item5}}.\n\nWhat did {{who}} order? Reply with ONLY the dish, one lowercase word." — needle among four same-shaped distractor bindings
- **parameterization**: shift:{pick:[0,1,2,3,4]}; item1:{expr:"['soup','salad','steak','pasta','omelet'][(0+shift)%5]"}; item2:{expr:"['soup','salad','steak','pasta','omelet'][(1+shift)%5]"}; item3:{expr:"['soup','salad','steak','pasta','omelet'][(2+shift)%5]"}; item4:{expr:"['soup','salad','steak','pasta','omelet'][(3+shift)%5]"}; item5:{expr:"['soup','salad','steak','pasta','omelet'][(4+shift)%5]"}; m:{pick:[1,2,3,4,5]}; who:{expr:"['Priya','Marco','Jonas','Aisha','Tara'][m-1]"}; ans:{expr:"['soup','salad','steak','pasta','omelet'][(m-1+shift)%5]"} — 25 distinct person→dish assignments, so no fixed binding can be memorized
- **derivation**: ans is the same rotation lookup that built the queried person's slot — self-consistent by construction → exact '{{ans}}'
- **forgiveFormatting**: yes

---

**Category totals**: 20 cases — 7 multilingual (2 false-friend, 1 confusable-pair language discrimination, 1 number-word, 1 in-language extraction, 1 cross-lingual sentiment, 1 cross-lingual instruction), 5 classification edge cases (sentiment-contrast, spam, toxicity, topic-bait, NLI), 8 retrieval/comprehension (context-wins, attribution, multi-hop, negated-item, quantifier, labeled-needle among distractors, lost-in-the-middle, entity-binding). Parameterized: 20/20 (int/pick vars or idx-tables). Evaluators: 12 exact, 7 regex (numeric-only templating), 1 regex fixed-literal+numeric; forgiveFormatting on all except the two anchored retrieval-code cases; acceptWithRemark on comprehension-attribution-quote (article/'River' renderings). No vision/tool cases, so no `requires` needed anywhere. All seven review fixes applied; no lexical fact appears in more than one case within this inventory.