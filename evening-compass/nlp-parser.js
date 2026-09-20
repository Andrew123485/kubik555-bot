/**
 * Dynamic NLP & Pattern Learning Parser for Evening Stoic Reflection
 * Automatically discovers, extracts, and clusters recurring habits from speech.
 */

// Core semantic archetype patterns with extensible keywords & icons
const PATTERN_ARCHETYPES = [
  // Sport & Physical Energy
  {
    id: 'habit_sport_gym',
    name: 'Зал / Силовые (DDX)',
    icon: '🏋️',
    category: 'Тело & Энергия',
    keywords: ['зал', 'ddx', 'ддх', 'тренировк', 'силов', 'присед', 'жим', 'тяг', 'турник', 'кардио', 'гантел', 'мышц', 'качаться', 'кач']
  },
  {
    id: 'habit_walk_steps',
    name: 'Ходьба / Прогулка (шаги)',
    icon: '🚶',
    category: 'Тело & Энергия',
    keywords: ['шаг', 'прогулк', 'погулял', 'гулять', 'прошел', 'пешком', 'парк', 'находил', '10000']
  },
  {
    id: 'habit_clean_diet',
    name: 'Чистое питание / Без фастфуда',
    icon: '🥗',
    category: 'Тело & Энергия',
    keywords: ['фастфуд', 'сахар', 'сладк', 'питан', 'диет', 'кбжу', 'калори', 'бургер', 'чипс', 'кола', 'кола-зеро', 'без еды на ночь', 'правильно питаться', 'питаться']
  },
  {
    id: 'habit_cold_shower',
    name: 'Контрастный душ / Закаливание',
    icon: '🚿',
    category: 'Тело & Энергия',
    keywords: ['душ', 'контрастн', 'холодн', 'закаливан', 'обливан']
  },

  // Career, Study & Cognitive Growth
  {
    id: 'habit_alfa_work',
    name: 'Альфа-Банк / Документация (BRD/CJM)',
    icon: '📑',
    category: 'Карьера & Проекты',
    keywords: ['альф', 'brd', 'брд', 'cjm', 'банк', 'стажировк', 'продакт', 'документаци', 'аналитик', 'созвон', 'таск', 'дедлайн', 'презентаци', 'доклад']
  },
  {
    id: 'habit_master_finance',
    name: 'Магистратура (Финансы / Оценка)',
    icon: '🎓',
    category: 'Карьера & Проекты',
    keywords: ['магистратур', 'финунивер', 'оценк', 'лекци', 'экзамен', 'зачет', 'учеб', 'семинар', 'курсов', 'ватолин']
  },
  {
    id: 'habit_coding_ai',
    name: 'Код / Агенты (Cursor, Python)',
    icon: '💻',
    category: 'Карьера & Проекты',
    keywords: ['код', 'программир', 'python', 'cursor', 'курсор', 'бот', 'разработк', 'скрипт', 'агент', 'github', 'репо', 'компас', 'сенека']
  },
  {
    id: 'habit_reading',
    name: 'Чтение книг / Исследования',
    icon: '📖',
    category: 'Разум & Фокус',
    keywords: ['книг', 'читал', 'чтени', 'страниц', 'автор', 'глав', 'научпоп', 'naked science', 'стать']
  },
  {
    id: 'habit_english',
    name: 'Английский язык',
    icon: '🇬🇧',
    category: 'Разум & Фокус',
    keywords: ['английск', 'english', 'слова', 'vocabulary', 'учил язык', 'грамматик']
  },

  // Discipline & Impulse Control (Stoic Pillars)
  {
    id: 'habit_trading_discipline',
    name: 'Трейдинг без тильта и FOMO',
    icon: '🛡️',
    category: 'Дисциплина',
    keywords: ['трейдинг', 'шорт', 'лонг', 'сделк', 'тильт', 'fomo', 'фомо', 'депозит', 'график', 'стоп', 'вход', 'риск-менеджмент', 'бэктест', 'бектест']
  },
  {
    id: 'habit_no_doomscroll',
    name: 'Контроль экранного времени (без рилсов)',
    icon: '📵',
    category: 'Дисциплина',
    keywords: ['рилс', 'тирток', 'reels', 'tiktok', 'шортс', 'инст', 'инстаграм', 'экран', 'скролл', 'залипал', 'залипать', 'ютуб', 'видео']
  },
  {
    id: 'habit_sleep_hygiene',
    name: 'Сон вовремя (до 00:00)',
    icon: '⏰',
    category: 'Дисциплина',
    keywords: ['сон', 'спать', 'лечь', 'полноч', 'выспаться', 'подъем', '00:00', 'режим', 'рано']
  },
  {
    id: 'habit_no_energy_drinks',
    name: 'Без энергетиков / стимуляторов',
    icon: '⚡',
    category: 'Дисциплина',
    keywords: ['энергетик', 'red bull', 'monster', 'flash', 'берн', 'кофеин', 'банка']
  },
  {
    id: 'habit_anger_control',
    name: 'Контроль гнева / Эмоциональное равновесие',
    icon: '🧘',
    category: 'Дисциплина',
    keywords: ['вспылил', 'сорвался', 'сдержал', 'злость', 'эмоци', 'раздраж', 'спор', 'терпени', 'хладнокрови']
  },

  // Life & Relationships
  {
    id: 'habit_family_call',
    name: 'Семья / Близкие люди',
    icon: '🤝',
    category: 'Отношения & Быт',
    keywords: ['родите', 'мама', 'папа', 'друг', 'встреч', 'позвонил', 'разговор', 'помог', 'бабушк']
  },
  {
    id: 'habit_home_order',
    name: 'Порядок дома / Быт',
    icon: '🧹',
    category: 'Отношения & Быт',
    keywords: ['уборк', 'порядок', 'разобрал', 'чистот', 'быт', 'помыл', 'вещи']
  }
];

/**
 * Intelligent stemmer and keyword matcher
 */
function matchArchetype(text) {
  const lower = text.toLowerCase();
  const matched = [];

  for (const arch of PATTERN_ARCHETYPES) {
    const hits = arch.keywords.filter(kw => lower.includes(kw));
    if (hits.length > 0) {
      matched.push({
        id: arch.id,
        name: arch.name,
        icon: arch.icon,
        category: arch.category,
        relevance: hits.length
      });
    }
  }

  // Sort by relevance (number of matched keywords)
  return matched.sort((a, b) => b.relevance - a.relevance);
}

/**
 * Dynamic Candidate Habit Extractor (Discovers novel patterns not in predefined list)
 * Finds action-noun pairs like: "пробежал 5км", "сделал бектест", "прошел курс"
 */
function discoverDynamicHabits(text) {
  const lower = text.toLowerCase();
  const candidates = [];

  // Common stop words to prune
  const stopWords = new Set([
    'сегодня', 'вчера', 'завтра', 'очень', 'просто', 'короче', 'немного', 'вообще',
    'потом', 'также', 'тоже', 'хотя', 'чтобы', 'когда', 'после', 'потому', 'надо',
    'было', 'были', 'быть', 'свой', 'свои', 'меня', 'тебя', 'себя', 'этого', 'этом'
  ]);

  // Clean punctuation except sentence boundaries
  const words = lower.replace(/[^а-яa-z0-9\s-]/gi, ' ').split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));

  // If text mentions specific verbs of accomplishment or restraint
  const actionTriggers = [
    { prefix: 'прочитал', namePrefix: 'Чтение: ', icon: '📖' },
    { prefix: 'выучил', namePrefix: 'Обучение: ', icon: '🧠' },
    { prefix: 'написал', namePrefix: 'Текст / Код: ', icon: '✍️' },
    { prefix: 'сделал', namePrefix: 'Практика: ', icon: '🎯' },
    { prefix: 'пробежал', namePrefix: 'Бег: ', icon: '🏃' },
    { prefix: 'купил', namePrefix: 'Покупки: ', icon: '🛒' },
    { prefix: 'отложил', namePrefix: 'Копилка: ', icon: '💰' },
    { prefix: 'отказался', namePrefix: 'Отказ от: ', icon: '🛑' }
  ];

  for (const trigger of actionTriggers) {
    const idx = words.findIndex(w => w.startsWith(trigger.prefix));
    if (idx >= 0 && idx + 1 < words.length) {
      const nextWord = words[idx + 1];
      if (!stopWords.has(nextWord)) {
        const id = 'dyn_' + trigger.prefix + '_' + nextWord;
        const name = trigger.namePrefix + nextWord.charAt(0).toUpperCase() + nextWord.slice(1);
        candidates.push({
          id,
          name,
          icon: trigger.icon,
          category: 'Новые привычки',
          isDynamic: true
        });
      }
    }
  }

  return candidates;
}

/**
 * Normalizes speech recognition acoustic slips before parsing
 */
function normalizeSpokenArtifacts(text) {
  if (!text) return '';
  return text
    .replace(/дарн[а-яё]*\s+приводчик[а-яё]*/gi, 'дурной привычке')
    .replace(/дарн[а-яё]*\s+привычк[а-яё]*/gi, 'дурной привычке')
    .replace(/обозделал[а-яё]*/gi, 'обуздал')
    .replace(/с\s+предлив[а-яё]*/gi, 'справедливыми')
    .replace(/вечерн[а-яё]*\s+компус[а-яё]*/gi, 'вечерний компас')
    .replace(/(^|[^а-яёa-z0-9])сынок(?=[^а-яёa-z0-9]|$)/gi, '$1Сенека')
    .replace(/бактейст[а-яё]*/gi, 'бэктесте')
    .replace(/(^|[^а-яёa-z0-9])линился(?=[^а-яёa-z0-9]|$)/gi, '$1ленился');
}

/**
 * Detect fairness attitude (Marcus Aurelius moral compass)
 */
function detectFairness(text) {
  const lower = text.toLowerCase();
  
  if (
    lower.includes('схалявил') || lower.includes('схалтурил') || lower.includes('ленился') ||
    lower.includes('забил') || lower.includes('не сделал') || lower.includes('пропустил') ||
    lower.includes('думаю, что нет') || lower.includes('думаю что нет') || lower.includes('не было') ||
    lower.includes('дал слабину') || lower.includes('не совсем') || lower.includes('не особо') ||
    /(^|[^а-яёa-z0-9])нет(?=[^а-яёa-z0-9]|$)/i.test(lower)
  ) {
    return {
      status: 'slack',
      label: '⚠️ Дал слабину / Признал недостаток дисциплины',
      icon: '⚠️'
    };
  }
  
  if (lower.includes('вспылил') || lower.includes('сорвался') || lower.includes('резко') || lower.includes('эмоци') || lower.includes('раздраж') || lower.includes('поругался')) {
    return {
      status: 'mixed',
      label: '🤔 Был резок, но вовремя осознал',
      icon: '🤔'
    };
  }
  
  return {
    status: 'clean',
    label: '⚖️ Чист перед собой и людьми',
    icon: '⚖️'
  };
}

/**
 * Purges conversational filler words and cleans whitespace (Cyrillic-aware)
 */
function cleanFillerWords(text) {
  if (!text) return '';
  const fillers = [
    'короче говоря', 'в принципе', 'так сказать', 'собственно говоря', 'на самом деле', 'по сути дела',
    'в общем-то', 'в общем и целом', 'в общем', 'как бы', 'короче', 'типа', 'нууу', 'нуу', 'ну', 'собственно',
    'слушай', 'значит', 'вот', 'по сути', 'эээ', 'кстати', 'вообще', 'понимаешь', 'то есть', 'опять же',
    'то бишь', 'как говорится', 'как-то так', 'что-то еще', 'но это так', 'они то что', 'не то что', 'давай так',
    'честно говоря', 'если честно', 'я думаю что', 'я думаю, что', 'первый это', 'первый, это', 'второй это', 'второй, это',
    'в этом плане', 'в этом смысле'
  ];
  
  const pattern = new RegExp('(^|[^а-яёa-z0-9])(' + fillers.join('|') + ')(?=[^а-яёa-z0-9]|$)', 'gi');
  
  // Double pass to catch consecutive fillers like "ну типа короче"
  let cleaned = text
    .replace(pattern, ' ')
    .replace(pattern, ' ')
    .replace(/(^|[^а-яёa-z0-9])потом(?=[^а-яёa-z0-9]|$)/gi, ' ')
    .replace(/[,;]\s*[,;]/g, ',')
    .replace(/[.,;]\s*\./g, '.')
    .replace(/,\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();

  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

/**
 * Extracts concise essence from rambling sentences
 */
function extractEssence(sentence, maxLength = 140) {
  let cleaned = cleanFillerWords(sentence);
  // Strip opening conversational prefixes and index lead-ins
  cleaned = cleaned.replace(/^(?:я\s+сегодня|сегодня\s+я|сегодня|вчера|в\s+итоге|в\s+общем|кстати|это\s+то,\s+что|это\s+то\s+что|то,\s+что|то\s+что|первый,\s+это|первый\s+это|второй,\s+это|второй\s+это)\s+/i, '');
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  if (cleaned.length > maxLength) {
    const cut = cleaned.slice(0, maxLength);
    const lastSpace = cut.lastIndexOf(' ');
    cleaned = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '...';
  }
  return cleaned;
}

/**
 * Main parser function: extracts 4 pillars and automatically maps + learns habit patterns
 */
function parseReflectionText(rawText) {
  if (!rawText || !rawText.trim()) {
    return null;
  }

  const normalized = normalizeSpokenArtifacts(rawText.trim());
  const clean = cleanFillerWords(normalized);
  const sentences = clean.split(/[.!?\n]+/).map(s => s.trim()).filter(Boolean);

  // 1. Detect Archetypes & Discover Dynamic Habits
  const matchedArchetypes = matchArchetype(clean);
  const discoveredHabits = discoverDynamicHabits(clean);
  
  // Merge tags, deduplicate
  const allDetected = [...matchedArchetypes, ...discoveredHabits];
  const uniqueTagsMap = new Map();
  allDetected.forEach(item => {
    if (!uniqueTagsMap.has(item.id)) {
      uniqueTagsMap.set(item.id, item);
    }
  });
  const detectedPatterns = Array.from(uniqueTagsMap.values());

  let habitParts = [];
  let betterParts = [];
  let fairNoteParts = [];
  let nextParts = [];
  let detectedFairnessStatus = null;

  // Check if speech follows the 4 questions explicitly (e.g. "какую привычку... чем стал лучше... справедливость... как лучше")
  const p1Match = clean.search(/(?:каку[юе]|какой)\s+(?:[а-яё]+\s+)*(?:привычк|обуздал)/i);
  const p2Match = clean.search(/(?:чем\s+(?:я\s+)?стал[а-яё]*\s+лучше|стал[а-яё]*\s+лучше)/i);
  const p3Match = clean.search(/справедлив[а-яё]*/i);
  const p4Match = clean.search(/(?:как\s+(?:стать\s+)?лучше|как\s+лучше)/i);

  if (p1Match >= 0 && (p2Match > p1Match || p3Match > p1Match || p4Match > p1Match)) {
    const endP1 = p2Match > p1Match ? p2Match : (p3Match > p1Match ? p3Match : (p4Match > p1Match ? p4Match : clean.length));
    const rawP1 = clean.slice(p1Match, endP1).replace(/^(?:[^?.:!]+[?.:!]|каку[юе]\s+привычку[^,.:!]*)[,.:!\s-]*/i, '').trim();
    if (rawP1) habitParts.push(extractEssence(rawP1));

    if (p2Match >= 0) {
      const endP2 = p3Match > p2Match ? p3Match : (p4Match > p2Match ? p4Match : clean.length);
      const rawP2 = clean.slice(p2Match, endP2).replace(/^(?:чем\s+(?:я\s+)?стал[а-яё]*\s+лучше|стал[а-яё]*\s+лучше)[?,.:!\s-]*/i, '').trim();
      if (rawP2) betterParts.push(extractEssence(rawP2));
    }

    if (p3Match >= 0) {
      const endP3 = p4Match > p3Match ? p4Match : clean.length;
      const rawP3 = clean.slice(p3Match, endP3);
      detectedFairnessStatus = detectFairness(rawP3);
      const cleanedP3 = rawP3.replace(/^справедлив[а-яё]*[?,.:!\s-]*/i, '').trim();
      if (cleanedP3) fairNoteParts.push(extractEssence(cleanedP3));
    }

    if (p4Match >= 0) {
      const rawP4 = clean.slice(p4Match).replace(/^(?:как\s+(?:стать\s+)?лучше|как\s+лучше)[?,.:!\s-]*/i, '').trim();
      if (rawP4) nextParts.push(extractEssence(rawP4));
    }
  }

  // Fallback to sentence-by-sentence analysis if sections were not explicitly named
  if (habitParts.length === 0 && betterParts.length === 0) {
    for (const s of sentences) {
      const l = s.toLowerCase();
      
      // Tomorrow focus
      if (l.includes('завтра') || l.includes('план') || l.includes('утром') || l.includes('следующ')) {
        nextParts.push(extractEssence(s));
        continue;
      }

      // Impulse control / Curbed habit
      if (l.includes('удержался') || l.includes('не полез') || l.includes('не стал') || l.includes('обуздал') || l.includes('сдержал') || l.includes('не залипал') || l.includes('без ') || l.includes('не сорвался') || l.includes('отказался') || l.includes('поборол') || l.includes('сидел в') || l.includes('ленился')) {
        habitParts.push(extractEssence(s));
        continue;
      }

      // Fairness & interpersonal
      if (l.includes('справедлив') || l.includes('созвон') || l.includes('коллег') || l.includes('честн') || l.includes('вспылил') || l.includes('извинил') || l.includes('схалявил') || l.includes('совесть') || l.includes('поступил')) {
        fairNoteParts.push(extractEssence(s));
        continue;
      }

      // Growth & accomplishments
      if (l.includes('сделал') || l.includes('сдал') || l.includes('закрыл') || l.includes('дожал') || l.includes('был в') || l.includes('сходил') || l.includes('прочитал') || l.includes('лучше') || l.includes('прошел') || l.includes('написал') || l.includes('занимался') || l.includes('создал') || l.includes('начал')) {
        betterParts.push(extractEssence(s));
        continue;
      }

      if (betterParts.length === 0) betterParts.push(extractEssence(s));
      else if (habitParts.length === 0) habitParts.push(extractEssence(s));
      else if (nextParts.length === 0) nextParts.push(extractEssence(s));
    }
  }

  const fairness = detectedFairnessStatus || detectFairness(clean);

  // Synthesize concise outputs
  const habit = habitParts.length > 0 ? habitParts.join('. ') : 'Сохранил самообладание и контроль над ключевыми импульсами дня';
  const better = betterParts.length > 0 ? betterParts.join('. ') : 'Сделал шаг вперед в ключевых приоритетах дня';
  const fairNote = fairNoteParts.length > 0 ? fairNoteParts.join('. ') : fairness.label;
  const next = nextParts.length > 0 ? nextParts.join('. ') : 'Сохранить набранную дисциплину и фокус';

  return {
    rawTranscript: clean,
    pillars: {
      curbedHabit: habit,
      betterToday: better,
      fairnessStatus: fairness.status,
      fairnessLabel: fairness.label,
      fairnessNotes: fairNote,
      nextStep: next
    },
    patterns: detectedPatterns,
    tags: detectedPatterns.map(p => p.id),
    createdAt: new Date().toISOString()
  };
}

/**
 * Format High-Contrast HTML Card for Telegram
 */
function formatTelegramCard(parsed, stats = null) {
  const p = parsed.pillars;
  let text = `🏛️ <b>ВЕЧЕРНИЙ СТОИЧЕСКИЙ ЧЕК-ИН</b>\n`;
  text += `<i>${new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</i>\n\n`;

  text += `🛡️ <b>1. Обузданная привычка:</b>\n`;
  text += `<blockquote>${escapeHtml(p.curbedHabit)}</blockquote>\n`;

  text += `⚡ <b>2. Чем стал лучше:</b>\n`;
  text += `<blockquote>${escapeHtml(p.betterToday)}</blockquote>\n`;

  text += `⚖️ <b>3. Справедливость поступков:</b>\n`;
  text += `<blockquote>${escapeHtml(p.fairnessLabel)}\n<i>${escapeHtml(p.fairnessNotes)}</i></blockquote>\n`;

  text += `🚀 <b>4. Вектор на завтра:</b>\n`;
  text += `<blockquote>${escapeHtml(p.nextStep)}</blockquote>\n`;

  // Display recognized patterns
  if (parsed.patterns && parsed.patterns.length > 0) {
    const badges = parsed.patterns.map(pat => {
      return `${pat.icon} <b>${escapeHtml(pat.name)}</b>`;
    }).join(' • ');
    text += `🏷️ <b>Выявленные привычки:</b>\n${badges}\n\n`;
  }

  if (stats) {
    text += `🔥 <b>Текущий стрик:</b> ${stats.currentStreak} дн. (всего: ${stats.totalDays} отчетов)\n`;
  }

  return text;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generates an executive Weekly Stoic Retrospective from 7 days of reflections
 */
function generateWeeklySummary(reflections = [], stats = null) {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString().slice(0, 10);
  
  // Filter last 7 days of reflections
  const weekReflections = reflections.filter(r => (r.createdAt || '').slice(0, 10) >= sevenDaysAgo);
  
  if (weekReflections.length === 0) {
    return {
      hasData: false,
      text: `📅 <b>СТОИЧЕСКИЙ ОТЧЕТ ЗА НЕДЕЛЮ</b>\n\n<i>За последние 7 дней записей пока нет. Начни записывать вечерние голосовые отчёты, и в конце недели здесь появится детальный синтез твоих привычек и прогресса!</i>`
    };
  }

  // 1. Frequency count of all patterns across the week
  const patternCounts = {};
  const fairnessCounts = { clean: 0, mixed: 0, slack: 0 };
  const winsList = [];
  const impulseList = [];

  weekReflections.forEach(r => {
    // Tally fairness
    const f = r.pillars?.fairnessStatus || 'clean';
    fairnessCounts[f] = (fairnessCounts[f] || 0) + 1;

    // Collect wins and impulse notes
    if (r.pillars?.betterToday && r.pillars.betterToday.length > 5) {
      winsList.push(r.pillars.betterToday);
    }
    if (r.pillars?.curbedHabit && r.pillars.curbedHabit.length > 5) {
      impulseList.push(r.pillars.curbedHabit);
    }

    // Tally pattern tags
    const patterns = r.patterns || [];
    patterns.forEach(p => {
      const id = p.id || p;
      if (!patternCounts[id]) {
        patternCounts[id] = {
          id,
          name: p.name || id,
          icon: p.icon || '⚡',
          category: p.category || 'Привычки',
          count: 0
        };
      }
      patternCounts[id].count++;
    });
  });

  // Sort patterns by occurrence
  const sortedPatterns = Object.values(patternCounts).sort((a, b) => b.count - a.count);
  const crystallizedTags = sortedPatterns.filter(p => p.count >= 2);

  // 2. Build high-impact executive summary text
  let text = `🏛️ <b>СТОИЧЕСКИЙ РАЗБОР НЕДЕЛИ</b>\n`;
  text += `<i>Синтез за последние 7 дней • Зафиксировано: ${weekReflections.length} из 7 дней</i>\n\n`;

  // Top patterns
  text += `📊 <b>Кристаллизованные привычки недели:</b>\n`;
  if (sortedPatterns.length === 0) {
    text += `<i>(Недостаточно данных для выделения повторяющихся привычек)</i>\n`;
  } else {
    sortedPatterns.slice(0, 5).forEach(p => {
      const pct = Math.round((p.count / weekReflections.length) * 100);
      text += `• ${p.icon} <b>${escapeHtml(p.name)}:</b> <code>${p.count} дн.</code> (${pct}% недели)\n`;
    });
  }
  text += `\n`;

  // Ethical balance
  const cleanPct = Math.round((fairnessCounts.clean / weekReflections.length) * 100);
  text += `⚖️ <b>Индекс честности и совести:</b> ${cleanPct}%\n`;
  text += `• Дней полной чистоты: <b>${fairnessCounts.clean}</b>\n`;
  if (fairnessCounts.mixed > 0) text += `• Дней с эмоциональной резкостью: <b>${fairnessCounts.mixed}</b>\n`;
  if (fairnessCounts.slack > 0) text += `• Дней с признанной халявой: <b>${fairnessCounts.slack}</b>\n`;
  text += `\n`;

  // Top Wins summary
  text += `🏆 <b>Главные победы и прорывы:</b>\n`;
  const topWins = winsList.slice(0, 3);
  topWins.forEach(w => {
    text += `<blockquote>⚡ ${escapeHtml(w)}</blockquote>`;
  });
  text += `\n`;

  // Impulses struggled with
  text += `🛡️ <b>Фронт борьбы с привычками:</b>\n`;
  const topImpulses = impulseList.slice(0, 3);
  topImpulses.forEach(imp => {
    text += `<blockquote>📵 ${escapeHtml(imp)}</blockquote>`;
  });
  text += `\n`;

  // Strategic next week directive
  text += `🎯 <b>Вектор на следующую неделю:</b>\n`;
  text += `<i>Закрепить лидерские привычки, снизить отвлекающие триггеры и повысить индекс честности.</i>\n`;

  return {
    hasData: true,
    totalDays: weekReflections.length,
    crystallizedTags,
    sortedPatterns,
    text
  };
}

module.exports = {
  PATTERN_ARCHETYPES,
  matchArchetype,
  discoverDynamicHabits,
  detectFairness,
  parseReflectionText,
  formatTelegramCard,
  generateWeeklySummary
};

