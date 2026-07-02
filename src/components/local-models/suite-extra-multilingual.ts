/**
 * Extra suite cases: multilingual (false friends, confusable-pair
 * language ID, cross-lingual instructions), classification edge cases
 * (contrast sentiment, borderline spam, keyword-bait topic,
 * question-vs-statement), and retrieval / comprehension
 * (context-overrides-world-knowledge, multi-hop passages,
 * needle-among-distractors, mid-context labeled codes).
 *
 * Authored from docs/design/cases-multilingual-classification-retrieval.md
 * (all seven review fixes applied: which-sentence-lang replaces the
 * ambiguous id/ms language-ID row, false-friend rows de-overlapped,
 * all-but-k n≥11 so n≠2k is guaranteed, attribution gains article/'River'
 * acceptWithRemark clauses, topic row 2 reworded unambiguously TECH,
 * extract-fact-de ranges pairwise disjoint) plus the multilingual /
 * classification / retrieval / comprehension sections of
 * docs/design/suite-expansion.md (overlapping specs skipped; the
 * undeclared-identifier expr critique fix applied — every expr uses
 * inline array literals only, so materializeCase can never fall back to
 * a raw template).
 *
 * Conventions: deterministic evaluators only (exact / regex / contains);
 * regex values template ONLY numeric vars (string answers use exact);
 * every idx-table row is hand-verified to have exactly one correct
 * answer; passages/lists live in the input and their parameterization is
 * self-consistent by construction (precomputed parallel row tables or
 * disjoint numeric ranges). forgiveFormatting is set per-case on
 * single-word / single-letter / numeric answers only — never on the two
 * anchored retrieval-code cases, where token fidelity is the test.
 * NFKC normalization keeps accents, so é/ö/ß must still be right.
 * 34 of 35 cases are parameterized. No tools, vision, or followUps.
 */

import type { InlineCase } from './builtin-suite';

export const SUITE_EXTRA_MULTILINGUAL: readonly InlineCase[] = [
  // ── Multilingual ──────────────────────────────────────────────────

  {
    id: 'ml-false-friend-meaning',
    input:
      "The {{lang}} word '{{word}}' means which of the following in English? Reply with ONLY the letter. No commentary.\n(A) {{o1}}\n(B) {{o2}}\n(C) {{o3}}\n(D) {{o4}}",
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        lang: { expr: "['German','Spanish','French','Spanish','German','Italian'][idx]" },
        word: { expr: "['Gift','ropa','librairie','éxito','Rat','burro'][idx]" },
        // Option arrays are row-parallel; the English-cognate bait
        // (gift/rope/library/exit/rat/donkey) is always option A here,
        // while the CORRECT slot rotates per row (B,C,D,A,C,B).
        o1: { expr: "['gift','rope','library','success','rat','donkey'][idx]" },
        o2: { expr: "['poison','road','reading room','exit','rate','butter'][idx]" },
        o3: { expr: "['money','clothing','freedom','excess','advice','burrow'][idx]" },
        o4: { expr: "['guest','soap','bookshop','exile','wheel','bureau'][idx]" },
        // Hand-verified: Gift=poison(B), ropa=clothing(C),
        // librairie=bookshop(D), éxito=success(A), Rat=advice(C),
        // burro(it)=butter(B).
        ans: { expr: "['B','C','D','A','C','B'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['multilingual', 'classification'],
  },
  {
    id: 'ml-false-friend-translation',
    input:
      "Which option is the correct {{lang}} translation of the English word '{{en}}'? Reply with ONLY the letter. No commentary.\n(A) {{oa}}\n(B) {{ob}}",
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        en: {
          expr:
            "['fabric','actually','chef (a professional cook)','sensible','preservative','eventually'][idx]",
        },
        lang: { expr: "['Spanish','French','German','German','Spanish','Spanish'][idx]" },
        oa: { expr: "['fábrica','en fait','Chef','vernünftig','conservante','eventualmente'][idx]" },
        ob: { expr: "['tela','actuellement','Koch','sensibel','preservativo','finalmente'][idx]" },
        // Hand-verified: fabric=tela (fábrica=factory), actually=en fait
        // (actuellement=currently), cook=Koch (German Chef=boss),
        // sensible=vernünftig (sensibel=sensitive),
        // preservative=conservante (preservativo=condom),
        // eventually=finalmente (eventualmente=possibly). The
        // false-friend cognate is always the WRONG option; its slot is
        // balanced 3A/3B.
        ans: { expr: "['B','A','B','A','A','B'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['multilingual', 'classification'],
  },
  {
    id: 'ml-false-friend-embarazada',
    input:
      "Does the Spanish word 'embarazada' mean 'embarrassed' in English? Reply with ONLY one word: YES or NO. No commentary.",
    // embarazada = pregnant, the canonical Spanish/English false friend.
    expect: { kind: 'regex', value: '^NO$' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['multilingual', 'fast'],
  },
  {
    id: 'ml-which-sentence-lang',
    input:
      'Exactly one of these two sentences is written in {{lang}}. Which one? Reply with ONLY the letter. No commentary.\n(A) {{sa}}\n(B) {{sb}}',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        lang: { expr: "['Polish','Swedish','Portuguese','German','Italian','Ukrainian'][idx]" },
        // Each pair is the SAME message in two closely related languages
        // (Czech/Polish, Swedish/Norwegian, Spanish/Portuguese,
        // German/Dutch, Spanish/Italian, Ukrainian/Russian) — the model
        // must know discriminating orthography, not just detect 'a
        // language'. Every row is decidable by language-unique markers
        // on BOTH sides (ę/ł vs ě; Jag/ä vs Jeg/å; ão/lh vs ñ; ß/wegen
        // des vs vanwege; Il bambino vs El niño; Дякую vs Спасибо).
        sa: {
          expr:
            "['Děkuji vám za pomoc, uvidíme se zítra.','Jag älskar att läsa böcker på sommaren.','La reunión de mañana fue cancelada por el señor García.','Die Straße war wegen des Umzugs völlig gesperrt.','El niño comió la manzana y bebió la leche.','Дякую за допомогу, побачимося завтра.'][idx]",
        },
        sb: {
          expr:
            "['Dziękuję bardzo za pomoc, do zobaczenia jutro.','Jeg elsker å lese bøker om sommeren.','A reunião de amanhã foi cancelada pelo senhor Magalhães.','De straat was vanwege de verhuizing volledig afgesloten.','Il bambino ha mangiato la mela e ha bevuto il latte.','Спасибо за помощь, увидимся завтра.'][idx]",
        },
        ans: { expr: "['B','A','B','A','B','A'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['multilingual', 'classification'],
  },
  {
    id: 'ml-language-identify',
    input:
      'What language is this sentence written in? Reply with ONLY the language name in English, one word. No commentary.\n\n{{sent}}',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        // Every snippet is uniquely identifiable by script or by
        // language-exclusive diacritics: Greek script; German ß;
        // Spanish ¿ + ñ; Portuguese ã/ç; Polish ł/ą/ę/ś; Czech ř/ů.
        sent: {
          expr:
            "['Καλημέρα, πώς είσαι σήμερα;','Der Fußboden war außergewöhnlich glatt.','¿Cuántos años tienes?','O coração da cidade é a estação de São Bento.','Wkrótce zaczną się piękne, słoneczne dni.','Příští týden přijede můj bratr do Prahy.'][idx]",
        },
        ans: { expr: "['Greek','German','Spanish','Portuguese','Polish','Czech'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['multilingual', 'classification', 'fast'],
  },
  {
    id: 'ml-number-word-digits',
    input:
      "What number does the {{lang}} word '{{word}}' represent? Reply with ONLY the digits, no commentary.",
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        lang: { expr: "['French','German','Italian','French','Spanish','Dutch'][idx]" },
        word: {
          expr:
            "['quatre-vingt-douze','siebenundvierzig','sessantotto','soixante-quinze','noventa y ocho','vierentachtig'][idx]",
        },
        // Hand-verified: 4×20+12=92 (vigesimal), 7+40=47 (German
        // unit-first inversion; trap 74), 60+8=68, 60+15=75, 90+8=98,
        // 4+80=84 (Dutch inversion; trap 48).
        ans: { expr: '[92, 47, 68, 75, 98, 84][idx]' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['multilingual'],
  },
  {
    id: 'ml-german-number-word',
    input:
      'What is the German word for the number {{n}}? Reply with ONLY the German word, lowercase. No commentary.',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        n: { expr: '[7, 8, 9, 10, 11, 12][idx]' },
        ans: { expr: "['sieben','acht','neun','zehn','elf','zwölf'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['multilingual', 'fast'],
  },
  {
    id: 'ml-french-next-day',
    input:
      "In French, what day of the week comes immediately after '{{jour}}'? Reply with ONLY the French word, lowercase. No commentary.",
    generate: {
      vars: {
        d: { pick: [0, 1, 2, 3, 4, 5, 6] },
        // Inline array literals only (design-critique fix: an expr
        // referencing an undeclared `names` identifier would silently
        // fall back to the raw template).
        jour: {
          expr: "['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'][d]",
        },
        ans: {
          expr: "['mardi','mercredi','jeudi','vendredi','samedi','dimanche','lundi'][d]",
        },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['multilingual'],
  },
  {
    id: 'ml-translate-word-fr',
    input:
      "Translate the English word '{{en}}' to French. Reply with ONLY the French word, no article, no commentary.",
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        en: { expr: "['dog','cat','water','bread','book','milk'][idx]" },
        ans: { expr: "['chien','chat','eau','pain','livre','lait'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['multilingual', 'fast'],
  },
  {
    id: 'ml-translate-word-es',
    input:
      "Translate the English word '{{en}}' to Spanish. Reply with ONLY the Spanish word, no article, no commentary.",
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4] },
        en: { expr: "['dog','cat','water','book','house'][idx]" },
        ans: { expr: "['perro','gato','agua','libro','casa'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['multilingual', 'fast'],
  },
  {
    id: 'ml-translate-to-english',
    input:
      "What does the {{lang}} word '{{word}}' mean in English? Reply with ONLY one English word, lowercase. No commentary.",
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        lang: { expr: "['French','French','German','Spanish','Italian','Dutch'][idx]" },
        // Rows chosen so no lexical fact repeats elsewhere in this file
        // (translate-word-fr/-es go English→target; these are distinct
        // source words with single canonical translations).
        word: { expr: "['fromage','cheval','Wasser','mesa','farfalla','sleutel'][idx]" },
        ans: { expr: "['cheese','horse','water','table','butterfly','key'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['multilingual', 'fast'],
  },
  {
    id: 'ml-greeting-time',
    input:
      "Is the greeting '{{greet}}' typically said in the MORNING or in the EVENING? Reply with ONLY one word: MORNING or EVENING. No commentary.",
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3] },
        greet: { expr: "['Guten Morgen','Buenas noches','Bonsoir','Buongiorno'][idx]" },
        ans: { expr: "['MORNING','EVENING','EVENING','MORNING'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['multilingual', 'classification', 'fast'],
  },
  {
    id: 'ml-answer-in-english',
    // Prompt is entirely in a non-English language but demands a single
    // lowercase ENGLISH word — the trap is answering in the prompt's
    // language ('bleu', 'verde', 'gelb', …).
    input: '{{q}}',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        q: {
          expr:
            "['De quelle couleur est le ciel par temps clair ? Réponds avec UN SEUL mot anglais, en minuscules.','¿De qué color es la hierba? Responde con UNA sola palabra en inglés, en minúsculas.','Welche Farbe hat eine reife Banane? Antworte mit EINEM englischen Wort, kleingeschrieben.','Di che colore è la neve? Rispondi con UNA sola parola in inglese, in minuscolo.','De quelle couleur est une tomate mûre ? Réponds avec UN SEUL mot anglais, en minuscules.','¿De qué color es el carbón? Responde con UNA sola palabra en inglés, en minúsculas.'][idx]",
        },
        ans: { expr: "['blue','green','yellow','white','red','black'][idx]" },
      },
    },
    // Case/punctuation are forgiven; 'bleu' still fails.
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['multilingual', 'fast'],
  },
  {
    id: 'ml-sentiment-label',
    input:
      'Classify the sentiment of this review as POSITIVE or NEGATIVE. Reply with ONLY the label, uppercase, in English. No commentary.\n\nReview: {{review}}',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        // es / fr / de / it / pt / nl — label language (English) differs
        // from review language; all rows hand-verified unambiguous.
        review: {
          expr:
            "['Una experiencia horrible, el peor hotel en el que me he alojado.','Un film magnifique, je le recommande à tout le monde !','Das Essen war kalt und der Kellner unhöflich. Nie wieder.','Un capolavoro assoluto, con attori straordinari.','Produto excelente, chegou rápido e funciona perfeitamente.','Verschrikkelijke service, ik wil mijn geld terug.'][idx]",
        },
        ans: {
          expr:
            "['NEGATIVE','POSITIVE','NEGATIVE','POSITIVE','POSITIVE','NEGATIVE'][idx]",
        },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['multilingual', 'classification'],
  },
  {
    id: 'ml-extract-fact-de',
    // Entirely in German: read a two-sentence notice, extract ONE number.
    // The three ranges are pairwise disjoint (hour 6–23, platform 24–34,
    // duration 35–95), so a wrong extraction can never equal the answer.
    input:
      'Lies den Text und beantworte die Frage.\n\nText: Der Zug nach Hamburg fährt um {{h}} Uhr von Gleis {{g}} ab. Die Fahrt dauert {{m}} Minuten.\n\nFrage: Von welchem Gleis fährt der Zug ab? Antworte NUR mit der Zahl.',
    generate: {
      vars: {
        h: { int: { min: 6, max: 23 } },
        g: { int: { min: 24, max: 34 } },
        m: { int: { min: 35, max: 95 } },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{g}}\\s*$' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['multilingual', 'retrieval', 'comprehension'],
  },

  // ── Classification edge cases ─────────────────────────────────────

  {
    id: 'class-sentiment-contrast',
    input:
      'Classify the overall sentiment of the review as POSITIVE or NEGATIVE. Reply with ONLY the label, uppercase. No commentary.\n\nReview: {{review}}',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        // Every row contains a polarity reversal (negation or
        // but-clause), so keyword matching fails; the final clause
        // decides. Sarcasm-free — each row hand-verified unambiguous.
        review: {
          expr:
            "['I expected to hate it, but I ended up loving every minute.','The trailer was amazing; sadly the film itself bored me to sleep.','Not bad at all — honestly one of the best meals I have had this year.','The packaging was beautiful, but the product broke on the first day. Total waste of money.','Everyone calls it a masterpiece, but I found it dull and pretentious.','It started slow, yet by the end I was completely hooked. Highly recommend.'][idx]",
        },
        ans: {
          expr:
            "['POSITIVE','NEGATIVE','POSITIVE','NEGATIVE','NEGATIVE','POSITIVE'][idx]",
        },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['classification'],
  },
  {
    id: 'class-spam-edge',
    input:
      'Classify this message as exactly one of: SPAM or HAM. Reply with ONLY the label, uppercase. No commentary.\n\nMessage: {{msg}}',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        // Borderline but decidable: HAM rows carry spam-trigger keywords
        // (win, URGENT, congratulations); SPAM rows are calm-toned
        // phishing / prize-claim mechanics.
        msg: {
          expr:
            "['Hey, did you win the office raffle? They announced it at lunch today.','Your package USPS-4412 could not be delivered. Verify your address and pay a $1.99 redelivery fee at the link.','URGENT: the staging server is down again — can you restart it before the 3pm demo?','You have been selected for a $500 gift card. Click now to claim before it expires.','Dear customer, your account will be suspended. Confirm your password at secure-login-verify.net immediately.','Congratulations on the promotion! Drinks on Friday to celebrate?'][idx]",
        },
        ans: { expr: "['HAM','SPAM','HAM','SPAM','SPAM','HAM'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['classification'],
  },
  {
    id: 'class-toxicity-edge',
    input:
      'Classify the message as TOXIC or SAFE. Reply with ONLY the label, uppercase. No commentary.\n\nMessage: {{msg}}',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        // TOXIC rows are profanity-free personal attacks; SAFE rows are
        // heated/negative but non-attacking — the two traps for keyword
        // classifiers.
        msg: {
          expr:
            "['You are without a doubt the most incompetent excuse for an engineer I have ever met. Do everyone a favor and quit.','I strongly disagree with this proposal; I think it will hurt the team.','This code is a mess and whoever wrote it should be ashamed of existing.','Honestly, the referee made some questionable calls, but that is sports.','Nobody would miss you if you left the project. You add nothing.','The deadline is brutal, and I am frustrated we found out so late.'][idx]",
        },
        ans: { expr: "['TOXIC','SAFE','TOXIC','SAFE','TOXIC','SAFE'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['classification'],
  },
  {
    id: 'class-topic-keyword-bait',
    input:
      'Classify the topic as one of: SPORTS, FINANCE, TECH, HEALTH. Reply with ONLY the category, uppercase. No commentary.\n\nText: {{text}}',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3] },
        // Every row contains a salient keyword from a DIFFERENT category
        // than the true topic (jogging→SPORTS, football→SPORTS,
        // bank→FINANCE, training regimen→HEALTH); the topic is what the
        // text is ABOUT.
        text: {
          expr:
            "['Cardiologists report that jogging three times a week markedly lowers the risk of heart disease.','Shares of the famous football club dropped 8% after its quarterly earnings missed forecasts.','Engineers at the bank spent two years rewriting the legacy mainframe system in a modern language and migrating it to a cloud backend — one of the largest software engineering efforts in the industry.','The marathon champion credited her record-breaking victory to a new training regimen and months of altitude camps.'][idx]",
        },
        ans: { expr: "['HEALTH','FINANCE','TECH','SPORTS'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['classification'],
  },
  {
    id: 'class-question-statement-edge',
    input:
      'Is the following sentence a QUESTION or a STATEMENT? Reply with ONLY one word, uppercase: QUESTION or STATEMENT. No commentary.\n\n{{sent}}',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        // Edge rows: STATEMENT rows contain question-word bait (wonder
        // what / asked where / explains why); QUESTION rows are genuine
        // interrogatives. Balanced 3/3, each hand-verified decidable.
        sent: {
          expr:
            "['I wonder what time the train leaves.','Do you know if the museum is open on Sundays?','He asked me where I bought the jacket.','Have you had a chance to review the draft?','The report explains why sales dropped in March.','Is there any reason the meeting was moved to Friday?'][idx]",
        },
        ans: {
          expr:
            "['STATEMENT','QUESTION','STATEMENT','QUESTION','STATEMENT','QUESTION'][idx]",
        },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['classification', 'fast'],
  },

  // ── Comprehension ─────────────────────────────────────────────────

  {
    id: 'comp-nli-verdict',
    input:
      'Sentence 1: {{prem}}\nSentence 2: {{hyp}}\n\nBased ONLY on Sentence 1, is Sentence 2 TRUE, FALSE, or UNKNOWN? Reply with ONLY one uppercase word. No commentary.',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        prem: {
          expr:
            "['All the students passed the exam.','The museum is closed every Monday.','Maria bought a red car.','Tom has never been to Japan.','The train arrived twenty minutes late.','The bakery sells bread and pastries.'][idx]",
        },
        hyp: {
          expr:
            "['At least one student failed the exam.','The museum is never open on Mondays.','Maria paid for the car with a loan.','Tom visited Tokyo last year.','The train did not arrive on time.','The bakery also sells coffee.'][idx]",
        },
        // Entailment→TRUE, contradiction→FALSE, neutral→UNKNOWN;
        // row 3 uses Tokyo⊂Japan. Each row hand-verified.
        ans: { expr: "['FALSE','TRUE','UNKNOWN','FALSE','TRUE','UNKNOWN'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['comprehension', 'classification'],
  },
  {
    id: 'comp-context-overrides-moons',
    // Context contradicts world knowledge; the passage must win. n is
    // never 1, so the parametric-knowledge answer always fails.
    input:
      'Read the passage and answer using ONLY the passage, even if it contradicts what you know.\n\nPassage: In this science-fiction novel, Earth has {{n}} moons; the largest of them, Selene Prime, controls the tides.\n\nAccording to the passage, how many moons does Earth have? Reply with ONLY the integer. No commentary.',
    generate: {
      vars: { n: { int: { min: 2, max: 9 } } },
    },
    expect: { kind: 'regex', value: '^\\s*{{n}}\\s*$' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['comprehension', 'retrieval'],
  },
  {
    id: 'comp-context-overrides-week',
    // Second context-wins probe on a different fact; n is never 7, so
    // the world-knowledge answer always fails.
    input:
      'Read the passage and answer using ONLY the passage, even if it contradicts what you know.\n\nPassage: The reformed calendar described in this novel gives every week {{n}} days, while the year keeps twelve months.\n\nAccording to the passage, how many days are in a week under the reformed calendar? Reply with ONLY the integer. No commentary.',
    generate: {
      vars: { n: { int: { min: 8, max: 13 } } },
    },
    expect: { kind: 'regex', value: '^\\s*{{n}}\\s*$' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['comprehension', 'retrieval'],
  },
  {
    id: 'comp-attribution-quote',
    input:
      'Passage: Professor Lin claims the {{r1}} is the longest river in the world. Dr. Okafor disagrees and argues that the {{r2}} is the longest.\n\nAccording to {{asked}}, which river is the longest? Reply with ONLY the river name. No commentary.',
    generate: {
      vars: {
        // Both the claim assignment AND the queried person re-randomize,
        // so neither a memorized 'Nile' nor a positional heuristic
        // passes. The real-world Amazon-vs-Nile dispute makes the
        // parametric override tempting either way.
        flip: { pick: [0, 1] },
        r1: { expr: "['Amazon','Nile'][flip]" },
        r2: { expr: "['Nile','Amazon'][flip]" },
        who: { pick: [0, 1] },
        asked: { expr: "['Professor Lin','Dr. Okafor'][who]" },
        ans: { expr: '[r1, r2][who]' },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    // The conventional article-bearing renderings pass with a remark
    // instead of hard-failing (a leading article is never stripped by
    // the cosmetic softener).
    acceptWithRemark: [
      { kind: 'exact', value: 'the {{ans}}', remark: 'included the definite article' },
      {
        kind: 'exact',
        value: 'the {{ans}} River',
        remark: 'included the definite article and River',
      },
      { kind: 'exact', value: '{{ans}} River', remark: 'appended River' },
    ],
    forgiveFormatting: true,
    weight: 1,
    tags: ['comprehension', 'retrieval'],
  },
  {
    id: 'comp-multi-hop-manager',
    input:
      'Passage: {{p1}} manages the Falcon team. {{p2}} manages the Osprey team. The Falcon team owns the {{svc1}} service. The Osprey team owns the {{svc2}} service.\n\nWho manages the team that owns the search service? Reply with ONLY the name. No commentary.',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        p1: { expr: "['Dana','Marcus','Yuki','Elif','Omar','Petra'][idx]" },
        p2: { expr: "['Ivan','Sofia','Mateo','Amara','Nils','Rosa'][idx]" },
        flip: { pick: [0, 1] },
        svc1: { expr: "['billing','search'][flip]" },
        svc2: { expr: "['search','billing'][flip]" },
        // Two-hop chain service→team→manager. flip=0: Osprey owns
        // search → p2; flip=1: Falcon owns search → p1. Both branches
        // hand-verified.
        ans: { expr: '[p2, p1][flip]' },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['comprehension', 'retrieval'],
  },
  {
    id: 'comp-multi-hop-city',
    input:
      'Passage: {{p2}} was born in {{city2}}. {{p1}} was born in {{city1}}. The closing ceremony will be held in the city where {{p1}} was born.\n\nAccording to the passage, in which city will the closing ceremony be held? Reply with ONLY the city name. No commentary.',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5] },
        p1: { expr: "['Lena','Tarik','Mona','Henrik','Iris','Pavel'][idx]" },
        city1: { expr: "['Valencia','Krakow','Tallinn','Ghent','Bergen','Porto'][idx]" },
        p2: { expr: "['Oskar','Ruth','Felix','Clara','Anders','Mira'][idx]" },
        city2: { expr: "['Turin','Leipzig','Riga','Bruges','Aarhus','Zagreb'][idx]" },
      },
    },
    // Two-hop: ceremony → p1's birth city → city1; the p2/city2 binding
    // is the distractor. All twelve cities are distinct.
    expect: { kind: 'exact', value: '{{city1}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['comprehension', 'retrieval'],
  },
  {
    id: 'comp-not-delivered',
    input:
      'Read the sentence, then answer.\n\n{{passage}}\n\nWhich item did NOT arrive? Reply with ONLY that one word, lowercase. No commentary.',
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3] },
        // The missing item IS mentioned, attached to a negated clause;
        // the three delivered items are the distractors. Negation
        // phrasing varies per row (left behind / never made it / not
        // shipped / missing).
        passage: {
          expr:
            "['The crate contained hammers, wrenches, and screwdrivers; the drills were left behind at the warehouse.','The van delivered chairs, desks, and lamps, but the bookshelves never made it onto the truck.','The apples, pears, and plums arrived fresh; the cherries had sold out and were not shipped.','The kit included screws, bolts, and washers, while the nuts were missing from the box.'][idx]",
        },
        ans: { expr: "['drills','bookshelves','cherries','nuts'][idx]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['comprehension', 'retrieval'],
  },
  {
    id: 'comp-all-but-k',
    input:
      'A data center has {{n}} servers. During the maintenance window, all but {{k}} of them were patched. How many servers were NOT patched? Reply with ONLY the integer. No commentary.',
    generate: {
      vars: {
        // Since n ≥ 11 > 2·k_max = 10, n = 2k is impossible, so the trap
        // answer n−k is GUARANTEED to differ from the correct k in every
        // sample (design-review fix: former n min of 8 allowed n=2k).
        n: { int: { min: 11, max: 30 } },
        k: { int: { min: 2, max: 5 } },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{k}}\\s*$' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['comprehension'],
  },
  {
    id: 'comp-passage-year-gap',
    input:
      'Read the passage and answer the question.\n\nPassage: The old stone bridge across the river opened in {{y1}} and was fully renovated in {{y2}}.\n\nQuestion: how many years passed between the opening and the renovation? Reply with ONLY the integer. No commentary.',
    generate: {
      vars: {
        y1: { int: { min: 1880, max: 1930 } },
        gap: { int: { min: 25, max: 70 } },
        y2: { expr: 'y1 + gap' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{gap}}\\s*$' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['comprehension', 'retrieval'],
  },
  // (Winograd pronoun resolution lives in suite-extra-reasoning as
  //  reasoning-winograd-pronoun — kept once, there.)

  // ── Retrieval ─────────────────────────────────────────────────────

  {
    id: 'retr-order-binding',
    input:
      'Passage: At dinner, Priya ordered the {{item1}}, Marco ordered the {{item2}}, Jonas ordered the {{item3}}, Aisha ordered the {{item4}}, and Tara ordered the {{item5}}.\n\nWhat did {{who}} order? Reply with ONLY the dish, one lowercase word. No commentary.',
    generate: {
      vars: {
        // 25 distinct person→dish assignments (5 rotations × 5 queried
        // people), so no fixed binding can be memorized. `ans` is the
        // SAME rotation lookup that built the queried person's slot —
        // self-consistent by construction.
        shift: { pick: [0, 1, 2, 3, 4] },
        item1: { expr: "['soup','salad','steak','pasta','omelet'][(0 + shift) % 5]" },
        item2: { expr: "['soup','salad','steak','pasta','omelet'][(1 + shift) % 5]" },
        item3: { expr: "['soup','salad','steak','pasta','omelet'][(2 + shift) % 5]" },
        item4: { expr: "['soup','salad','steak','pasta','omelet'][(3 + shift) % 5]" },
        item5: { expr: "['soup','salad','steak','pasta','omelet'][(4 + shift) % 5]" },
        m: { pick: [1, 2, 3, 4, 5] },
        who: { expr: "['Priya','Marco','Jonas','Aisha','Tara'][m - 1]" },
        ans: { expr: "['soup','salad','steak','pasta','omelet'][(m - 1 + shift) % 5]" },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['retrieval', 'comprehension'],
  },
  {
    id: 'retr-table-price',
    input:
      'Here is a store price list.\n\n| Item | Price (USD) |\n| --- | --- |\n| notebook | {{p1}} |\n| backpack | {{p2}} |\n| headphones | {{p3}} |\n| keyboard | {{p4}} |\n| monitor | {{p5}} |\n\nWhat is the price in USD of the {{item}}? Reply with ONLY the number — no currency symbol, no prose.',
    generate: {
      vars: {
        // Disjoint tens-ranges keep all five prices distinct, so the
        // queried value is unique in the table.
        p1: { int: { min: 11, max: 19 } },
        p2: { int: { min: 21, max: 29 } },
        p3: { int: { min: 31, max: 39 } },
        p4: { int: { min: 41, max: 49 } },
        p5: { int: { min: 51, max: 59 } },
        m: { pick: [1, 2, 3, 4, 5] },
        item: { expr: "['notebook','backpack','headphones','keyboard','monitor'][m - 1]" },
        ans: { expr: '[p1, p2, p3, p4, p5][m - 1]' },
      },
    },
    expect: { kind: 'regex', value: '^\\s*{{ans}}\\s*$' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['retrieval', 'comprehension', 'fast'],
  },
  {
    id: 'retr-two-criteria-row',
    // Needle among distractors: the 9 fixed rows cover every
    // (department × city) pair exactly once, so each department appears
    // three times and each city three times — BOTH criteria are needed,
    // and exactly one row matches any queried pair. The idx-table maps
    // each of the 9 queried pairs to its hand-verified row.
    input:
      "Below is a staff directory. Exactly ONE person matches both criteria in the question.\n\nStaff directory:\n1. Alvarez — Sales — Lisbon\n2. Haddad — Engineering — Oslo\n3. Ibrahim — Marketing — Prague\n4. Chen — Sales — Oslo\n5. Ehrlich — Engineering — Prague\n6. Fontaine — Marketing — Lisbon\n7. Grimaldi — Sales — Prague\n8. Becker — Engineering — Lisbon\n9. Dubois — Marketing — Oslo\n\nQuestion: which person works in the {{dept}} department AND is based in {{city}}? Reply with ONLY the last name. No prose.",
    generate: {
      vars: {
        idx: { pick: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
        dept: {
          expr:
            "['Sales','Sales','Sales','Engineering','Engineering','Engineering','Marketing','Marketing','Marketing'][idx]",
        },
        city: {
          expr:
            "['Lisbon','Oslo','Prague','Lisbon','Oslo','Prague','Lisbon','Oslo','Prague'][idx]",
        },
        // Row-verified: Sales+Lisbon→Alvarez(1), Sales+Oslo→Chen(4),
        // Sales+Prague→Grimaldi(7), Eng+Lisbon→Becker(8),
        // Eng+Oslo→Haddad(2), Eng+Prague→Ehrlich(5),
        // Mkt+Lisbon→Fontaine(6), Mkt+Oslo→Dubois(9),
        // Mkt+Prague→Ibrahim(3).
        ans: {
          expr:
            "['Alvarez','Chen','Grimaldi','Becker','Haddad','Ehrlich','Fontaine','Dubois','Ibrahim'][idx]",
        },
      },
    },
    expect: { kind: 'exact', value: '{{ans}}' },
    forgiveFormatting: true,
    weight: 1,
    tags: ['retrieval', 'comprehension'],
  },
  {
    id: 'retr-labeled-code-distractors',
    // Five same-format needles; one is queried by label. Disjoint
    // hundred-ranges guarantee all codes are unique, and both the values
    // and the queried label re-randomize each run. The anchored regex
    // blocks a list-all-codes answer. Strict (leak-guard style): no
    // formatting forgiveness.
    input:
      'You will be given an internal operations memo. Somewhere in it, five environment codes are listed. Read carefully, then answer the question at the end.\n\n=== MEMO BEGIN ===\n\n# Platform operations memo — environment registry consolidation\n\n## 1. Background\n\nOver the past three quarters the platform-engineering team has been consolidating the environment registry. Historically, every team minted its own environment identifiers, which led to collisions, stale entries, and a support rotation that spent a disproportionate share of its time resolving which identifier referred to which system. The consolidation project replaces the ad-hoc identifiers with a single registry owned by the platform team. Every environment now has exactly one code, and every code appears in exactly one registry entry. The registry is the source of truth; spreadsheets, wiki tables, and channel topics are courtesies at best and are not to be trusted for anything that matters.\n\n## 2. Registry entries\n\nThe codes below take effect at the start of the next change window and supersede every identifier previously in circulation. The staging environment uses code ENV-{{n1}}. The production environment uses code ENV-{{n2}}. The backup system uses code ENV-{{n3}}. The audit pipeline uses code ENV-{{n4}}. The sandbox uses code ENV-{{n5}}. Engineers should update runbooks, dashboards, and deploy configurations to reference the new codes before the window closes; the old identifiers will stop resolving once the registry cutover completes.\n\n## 3. Rollout plan\n\nThe cutover proceeds in two stages. In the first stage the registry serves both old and new identifiers, with the old ones marked deprecated; dashboards render deprecated identifiers with a warning banner so stragglers stay visible. In the second stage, scheduled two weeks later, the old identifiers are removed and any system still referencing them fails closed. The two-stage design was chosen deliberately: a hard cutover without a deprecation window burned the team badly during the logging-pipeline migration, and the postmortem action item from that incident is what funded this project.\n\n## 4. Support\n\nQuestions about the registry go to the platform-operations channel, not to individual engineers. The support rotation has a runbook covering the common failure modes: a deploy configuration referencing a removed identifier, a dashboard panel pinned to a deprecated code, and a runbook that was updated for some but not all of its systems. If you find a registry entry that looks wrong, do not edit it directly — file a ticket in the operations queue so the change is reviewed and the audit trail stays intact.\n\n=== MEMO END ===\n\nQuestion: what is the code for the {{label}}? Reply with ONLY the code (format ENV-<number>). No prose, no preamble.',
    generate: {
      vars: {
        n1: { int: { min: 100, max: 199 } },
        n2: { int: { min: 200, max: 299 } },
        n3: { int: { min: 300, max: 399 } },
        n4: { int: { min: 400, max: 499 } },
        n5: { int: { min: 500, max: 599 } },
        m: { pick: [1, 2, 3, 4, 5] },
        label: {
          expr:
            "['staging environment','production environment','backup system','audit pipeline','sandbox'][m - 1]",
        },
        ans: { expr: '[n1, n2, n3, n4, n5][m - 1]' },
      },
    },
    // 'ENV-' is a fixed literal; only the number is templated (numeric
    // var). Full-line anchors block answering with the whole list.
    expect: { kind: 'regex', value: '^\\s*ENV-{{ans}}\\s*$' },
    weight: 1,
    tags: ['retrieval', 'mid-context'],
  },
  {
    id: 'retr-manifest-middle-entry',
    // Lost-in-the-middle probe: a nine-entry manifest inside a memo,
    // with only the MIDDLE positions (4, 5, 6) ever queried. Nine
    // disjoint hundred-ranges keep all codes unique. Strict: token
    // fidelity is the test.
    input:
      'You will be given an internal inventory memo containing a numbered manifest. Read carefully, then answer the question at the end.\n\n=== MEMO BEGIN ===\n\n# Quarterly inventory memo — hardware cage audit\n\n## 1. Purpose\n\nThis memo records the results of the quarterly hardware-cage audit for the primary colocation site. The audit is a standing control: every asset in the cage must appear in the asset register, every register entry must correspond to an asset physically present in the cage, and every asset must carry a legible code label. The audit exists because the register drifts — hardware gets swapped during incident response, loaner units arrive and never leave, and decommissioned machines sit in the cage waiting for a disposal window. A quarterly reconciliation keeps the drift bounded and keeps the capacity numbers the planning team relies on honest.\n\n## 2. Procedure\n\nTwo engineers perform the audit together: one reads codes off the physical labels in rack order, the other checks them against the register. Discrepancies are recorded on the spot and reconciled at the end of the walk-through rather than one by one, so a single mislabeled unit does not stall the whole audit. Photographs are taken of any label that is damaged or ambiguous, and the label is reprinted before the audit closes. The walk-through covers the racks top to bottom, front aisle first, and takes a little under two hours for a cage of this size.\n\n## 3. Audited manifest\n\nThe manifest below lists the audited asset codes in rack order, top of the rack first:\n\n1) ITEM-{{n1}}\n2) ITEM-{{n2}}\n3) ITEM-{{n3}}\n4) ITEM-{{n4}}\n5) ITEM-{{n5}}\n6) ITEM-{{n6}}\n7) ITEM-{{n7}}\n8) ITEM-{{n8}}\n9) ITEM-{{n9}}\n\n## 4. Discrepancies\n\nNo missing assets were found this quarter. One label was reprinted after the laminate had peeled, and one loaner unit from the vendor evaluation was flagged for return; the return shipment was booked before the audit closed. The register was updated in the same change window, so the manifest above and the register now agree entry for entry. This is the second consecutive quarter with a clean reconciliation, which the team attributes to the label-printer replacement and to moving register updates into the same review queue as other production changes.\n\n## 5. Next steps\n\nThe next audit is scheduled for the first week of the coming quarter. Before then, the team will trial hand-scanner support so codes are read by scanner rather than by eye; the trial is expected to cut the walk-through time roughly in half. The disposal window for the decommissioned units in the staging rack has been booked, and the capacity plan has been updated to reflect the freed rack units. Any questions about this memo go to the site-operations channel.\n\n=== MEMO END ===\n\nQuestion: what is the full asset code of manifest entry number {{m}}? Reply with ONLY the code (format ITEM-<number>). No prose, no preamble.',
    generate: {
      vars: {
        n1: { int: { min: 100, max: 199 } },
        n2: { int: { min: 200, max: 299 } },
        n3: { int: { min: 300, max: 399 } },
        n4: { int: { min: 400, max: 499 } },
        n5: { int: { min: 500, max: 599 } },
        n6: { int: { min: 600, max: 699 } },
        n7: { int: { min: 700, max: 799 } },
        n8: { int: { min: 800, max: 899 } },
        n9: { int: { min: 900, max: 999 } },
        m: { pick: [4, 5, 6] },
        ans: { expr: '[n1, n2, n3, n4, n5, n6, n7, n8, n9][m - 1]' },
      },
    },
    // 'ITEM-' fixed literal + numeric var only; anchored so dumping the
    // whole manifest fails.
    expect: { kind: 'regex', value: '^\\s*ITEM-{{ans}}\\s*$' },
    weight: 1,
    tags: ['retrieval', 'mid-context'],
  },
];
