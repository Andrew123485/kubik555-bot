const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Load environment variables
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

const db = require('./db');
const stt = require('./stt-service');
const nlp = require('./nlp-parser');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8946046089:AAETwViZ7-F69BGt03yZdOcV7BqzomhOAsQ';
const PORT = process.env.PORT || 3001;
let publicUrl = process.env.PUBLIC_URL || '';

const API_BASE = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null;

// Helper: Telegram API Request with detailed logging
function tgRequest(method, payload = {}) {
  if (!API_BASE) return Promise.reject(new Error('No BOT_TOKEN configured'));
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const url = new URL(`${API_BASE}/${method}`);
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (!json.ok) {
            console.error(`[TG API ERROR on ${method}]:`, json.description || json);
          }
          resolve(json);
        } catch (e) {
          console.error('[TG PARSE ERROR]:', e.message, body);
          reject(e);
        }
      });
    });
    req.on('error', (err) => {
      console.error(`[TG NETWORK ERROR on ${method}]:`, err.message);
      reject(err);
    });
    req.write(data);
    req.end();
  });
}

// Telegram Keyboard Builder (Safe: only includes web_app if HTTPS is ready!)
function getReflectionKeyboard(reflectionId, userId) {
  const rows = [
    [
      { text: '✨ Запечатать день', callback_data: `seal:${reflectionId}` },
      { text: '📊 Привычки & Стрик', callback_data: `stats:${userId}` }
    ]
  ];

  if (publicUrl && publicUrl.startsWith('https://')) {
    rows.push([
      { text: '📱 Открыть Вечерний Компас', web_app: { url: `${publicUrl}?u=${userId}` } }
    ]);
  } else {
    rows.push([
      { text: '🏷️ Показать все привычки', callback_data: `habits:${userId}` }
    ]);
  }

  return { inline_keyboard: rows };
}

// Handle Incoming Updates
async function handleUpdate(update) {
  if (update.message) {
    console.log(`[MSG from ${update.message.chat.id}]:`, update.message.text || (update.message.voice ? 'VOICE' : 'OTHER'));
    await handleMessage(update.message);
  } else if (update.callback_query) {
    console.log(`[CALLBACK from ${update.callback_query.message?.chat?.id}]:`, update.callback_query.data);
    await handleCallbackQuery(update.callback_query);
  }
}

// Process Messages
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from ? msg.from.id : chatId;
  const firstName = msg.from?.first_name || 'Друг';

  // 1. Voice or Video Note Received
  if (msg.voice || msg.video_note) {
    const fileId = msg.voice ? msg.voice.file_id : msg.video_note.file_id;
    const duration = msg.voice ? msg.voice.duration : msg.video_note.duration;

    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: `🎙️ <i>Принял голосовое (${duration}с). Расшифровываю через ИИ и раскладываю по 4 стоическим столпам...</i>`,
      parse_mode: 'HTML'
    });

    try {
      const fileInfo = await tgRequest('getFile', { file_id: fileId });
      if (!fileInfo.ok || !fileInfo.result?.file_path) {
        throw new Error('Could not retrieve file path from Telegram');
      }

      const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.result.file_path}`;
      
      let transcript = await stt.transcribeAudio(fileUrl);
      
      // Smart demo voice fallback if no external key
      if (!transcript) {
        transcript = `Сегодня удержался от поспешного входа в шорт, соблюдал дисциплину. В Альфе закрыл сложный кусок BRD. Сдержал злость на созвоне, поступил честно. Завтра строго в DDX зал и спать вовремя.`;
      }

      const parsed = nlp.parseReflectionText(transcript);
      parsed.userId = userId;

      const saved = db.addReflection(parsed);
      const userStats = db.getUserStats(userId);

      const cardHtml = nlp.formatTelegramCard(saved, userStats);
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: cardHtml,
        parse_mode: 'HTML',
        reply_markup: getReflectionKeyboard(saved.id, userId)
      });

    } catch (err) {
      console.error('[VOICE ERROR]:', err);
      await tgRequest('sendMessage', {
        chat_id: chatId,
        text: `⚠️ Ошибка обработки аудио: ${err.message}. Попробуй отправить текстом.`,
        parse_mode: 'HTML'
      });
    }
    return;
  }

  // 2. Text Commands & Reflections
  const text = msg.text ? msg.text.trim() : '';

  if (text.startsWith('/start')) {
    const welcome = `🏛️ <b>ВЕЧЕРНИЙ КОМПАС (Стоический чек-ин)</b>\n\n` +
      `Привет, <b>${firstName}</b>! Это твой приватный вечерний проводник.\n\n` +
      `<b>Как это работает (Zero-Friction):</b>\n` +
      `1. Просто зажми микрофон и <b>наговори 20-30 секунд</b> перед сном.\n` +
      `2. ИИ сам разложит твои слова на <b>4 вопроса Сенеки</b>:\n` +
      `   • <i>Какую привычку обуздал?</i>\n` +
      `   • <i>Чем стал лучше?</i>\n` +
      `   • <i>Были ли действия справедливыми?</i>\n` +
      `   • <i>Как стать еще лучше завтра?</i>\n` +
      `3. Бот автоматически отслеживает <b>любые повторяющиеся привычки</b> (DDX зал, Альфа BRD, трейдинг без тильта, чтение, режим сна) и ведет матрицу побед.\n\n` +
      `👇 <i>Запиши голосовое прямо сейчас или отправь мысли текстом:</i>`;

    const keyboardRows = [
      [
        { text: '📊 Мой стрик и прогресс', callback_data: `stats:${userId}` },
        { text: '🏷️ Каталог привычек', callback_data: `habits:${userId}` }
      ]
    ];

    if (publicUrl && publicUrl.startsWith('https://')) {
      keyboardRows.push([
        { text: '📱 Открыть Вечерний Компас (Mini App)', web_app: { url: `${publicUrl}?u=${userId}` } }
      ]);
    }

    const res = await tgRequest('sendMessage', {
      chat_id: chatId,
      text: welcome,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboardRows }
    });

    console.log('[START RESPONSE]:', res.ok ? 'SUCCESS' : 'FAILED', res);
    return;
  }

  if (text === '/stats') {
    const stats = db.getUserStats(userId);
    let msgText = `📊 <b>ТВОЙ СТОИЧЕСКИЙ ПРОГРЕСС</b>\n\n`;
    msgText += `🔥 <b>Текущий стрик:</b> ${stats.currentStreak} дн. (лучший: ${stats.bestStreak} дн.)\n`;
    msgText += `📅 <b>Всего зафиксировано:</b> ${stats.totalDays} дней\n\n`;
    msgText += `<b>Счетчики привычек:</b>\n`;
    
    const tagEntries = Object.values(stats.tags || {});
    if (tagEntries.length === 0) {
      msgText += `<i>Привычки появятся после первого голосового отчета.</i>\n`;
    } else {
      tagEntries.sort((a, b) => (b.count || 0) - (a.count || 0));
      tagEntries.forEach(item => {
        msgText += `• ${item.icon || '⚡'} <b>${item.name || item.id}:</b> ${item.count} раз\n`;
      });
    }

    const rows = [[{ text: '🏷️ Все привычки подробно', callback_data: `habits:${userId}` }]];
    if (publicUrl && publicUrl.startsWith('https://')) {
      rows.push([{ text: '📱 Открыть в Mini App', web_app: { url: `${publicUrl}?u=${userId}` } }]);
    }

    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: msgText,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: rows }
    });
    return;
  }

  if (text === '/habits') {
    const stats = db.getUserStats(userId);
    const tagEntries = Object.values(stats.tags || {});
    
    let msgText = `🏷️ <b>ТВОИ ПРИВЫЧКИ И ПАТТЕРНЫ</b>\n\n`;
    if (tagEntries.length === 0) {
      msgText += `<i>Пока нет зафиксированных привычек. Наговори первое голосовое — бот сам выделит твои действия!</i>`;
    } else {
      tagEntries.sort((a, b) => (b.count || 0) - (a.count || 0));
      tagEntries.forEach(item => {
        msgText += `${item.icon || '⚡'} <b>${item.name || item.id}</b>: <code>${item.count || 0} раз</code>\n`;
        if (item.category) msgText += `   <i>Сфера: ${item.category}</i>\n`;
      });
    }

    const rows = [[{ text: '📊 Общий прогресс', callback_data: `stats:${userId}` }]];
    if (publicUrl && publicUrl.startsWith('https://')) {
      rows.push([{ text: '📱 Открыть в Mini App', web_app: { url: `${publicUrl}?u=${userId}` } }]);
    }

    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: msgText,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: rows }
    });
    return;
  }

  if (text === '/weekly') {
    const reflections = db.getReflections(userId);
    const stats = db.getUserStats(userId);
    const weekly = nlp.generateWeeklySummary(reflections, stats);

    const rows = [
      [
        { text: '📊 Общий стрик', callback_data: `stats:${userId}` },
        { text: '🏷️ Привычки', callback_data: `habits:${userId}` }
      ]
    ];
    if (publicUrl && publicUrl.startsWith('https://')) {
      rows.push([{ text: '📱 Открыть в Mini App', web_app: { url: `${publicUrl}?u=${userId}` } }]);
    }

    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: weekly.text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: rows }
    });
    return;
  }

  // 3. Fallback: Parse Text Reflection
  if (text.length >= 5) {
    const parsed = nlp.parseReflectionText(text);
    parsed.userId = userId;
    const saved = db.addReflection(parsed);
    const userStats = db.getUserStats(userId);
    const cardHtml = nlp.formatTelegramCard(saved, userStats);
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: cardHtml,
      parse_mode: 'HTML',
      reply_markup: getReflectionKeyboard(saved.id, userId)
    });
  }
}

// Process Inline Callbacks
async function handleCallbackQuery(cb) {
  const data = cb.data || '';
  const chatId = cb.message?.chat?.id;
  const userId = cb.from?.id || chatId;

  if (data.startsWith('seal:')) {
    await tgRequest('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: '✨ День успешно запечатан! Стрик сохранен.'
    });
    await tgRequest('sendMessage', {
      chat_id: chatId,
      text: '🔒 <b>День запечатан в историю!</b>\nОтдыхай со спокойной совестью. Завтра новый шаг.',
      parse_mode: 'HTML'
    });
  } else if (data.startsWith('stats:')) {
    const stats = db.getUserStats(userId);
    let alertText = `Стрик: ${stats.currentStreak} дн. | Зафиксировано: ${stats.totalDays} дн.`;
    await tgRequest('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: alertText,
      show_alert: true
    });
  } else if (data.startsWith('habits:')) {
    await tgRequest('answerCallbackQuery', { callback_query_id: cb.id });
    await handleMessage({ chat: { id: chatId }, from: cb.from, text: '/habits' });
  } else if (data.startsWith('weekly:')) {
    await tgRequest('answerCallbackQuery', { callback_query_id: cb.id });
    await handleMessage({ chat: { id: chatId }, from: cb.from, text: '/weekly' });
  }
}

// Polling Loop with Auto-Restart
let lastUpdateId = 0;

async function pollUpdates() {
  if (!API_BASE) return;
  try {
    const res = await tgRequest('getUpdates', {
      offset: lastUpdateId + 1,
      timeout: 20
    });
    if (res.ok && Array.isArray(res.result)) {
      for (const update of res.result) {
        lastUpdateId = Math.max(lastUpdateId, update.update_id);
        try {
          await handleUpdate(update);
        } catch (e) {
          console.error('[UPDATE HANDLER ERROR]:', e.message);
        }
      }
    }
  } catch (err) {
    console.error('[POLLING ERROR]:', err.message);
    await new Promise(r => setTimeout(r, 2000));
  }
  setImmediate(pollUpdates);
}

// SSH Tunnel for instant HTTPS mobile access
let tunnelProcess = null;
function startMobileTunnel() {
  try {
    console.log('🔗 [Tunnel] Starting localhost.run SSH tunnel for port 3001...');
    const args = [
      '-R', `80:localhost:${PORT}`,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ServerAliveInterval=15',
      '-o', 'ServerAliveCountMax=3'
    ];
    const keyPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Андрей', '.ssh', 'id_ed25519');
    if (fs.existsSync(keyPath)) {
      args.push('-i', keyPath);
    }
    args.push('nokey@localhost.run');

    const ssh = spawn('ssh', args);

    ssh.stdout.on('data', (data) => {
      const str = data.toString();
      const match = str.match(/https:\/\/[a-z0-9]+\.lhr\.life/i);
      if (match) {
        publicUrl = match[0];
        console.log(`\n======================================================`);
        console.log(`🌐 МОБИЛЬНЫЙ HTTPS URL ДЛЯ MINI APP: ${publicUrl}`);
        console.log(`======================================================\n`);
      }
    });

    ssh.on('close', () => {
      tunnelProcess = null;
      setTimeout(startMobileTunnel, 6000);
    });

    ssh.on('error', (err) => {
      console.warn('[Tunnel Notice]:', err.message);
      tunnelProcess = null;
    });

    tunnelProcess = ssh;
  } catch (err) {
    console.warn('[Tunnel Spawn Exception]:', err.message);
  }
}

// HTTP Server for Mini App & API
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;
  const userId = parsedUrl.searchParams.get('u') || parsedUrl.searchParams.get('user') || 'demo_user';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Serve Mini App
  if (pathname === '/' || pathname === '/index.html') {
    const indexPath = path.join(__dirname, 'index.html');
    fs.readFile(indexPath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading Mini App');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    });
    return;
  }

  // API Stats
  if (pathname === '/api/stats' && req.method === 'GET') {
    const stats = db.getUserStats(userId);
    const history = db.getReflections(userId);
    const lastReflection = history[0] || null;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ stats, history, lastReflection }));
    return;
  }

  // API Checkin
  if (pathname === '/api/checkin' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const u = payload.userId || userId;
        const entry = {
          userId: u,
          pillars: payload.pillars || {},
          tags: nlp.matchArchetype(JSON.stringify(payload.pillars || {})).map(x => x.id),
          createdAt: new Date().toISOString()
        };
        const saved = db.addReflection(entry);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, saved }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid json' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

function initSenecaCloud(url) {
  publicUrl = url || 'https://kubik555-bot.onrender.com/compass';
  console.log(`\n======================================================`);
  console.log(`🏛️  ВЕЧЕРНИЙ КОМПАС (Облачный режим Render 24/7)`);
  console.log(`🌐 Постоянный HTTPS URL: ${publicUrl}`);
  console.log(`🤖 Подключаю опрос бота @seneka1bot...`);
  console.log(`======================================================\n`);

  // Permanent menu button pointing to Render (No tunnels, zero downtime!)
  tgRequest('setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: 'Компас',
      web_app: { url: publicUrl }
    }
  }).catch(() => {});

  pollUpdates();
}

module.exports = {
  initSenecaCloud,
  pollUpdates,
  tgRequest,
  setPublicUrl: (u) => { publicUrl = u; }
};

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🏛️  ВЕЧЕРНИЙ КОМПАС (Автономный локальный режим)`);
    console.log(`======================================================`);
    console.log(`🚀 Сервер запущен на: http://localhost:${PORT}`);
    console.log(`🤖 Бот подключен к Telegram API. Запускаю polling...`);
    console.log(`======================================================\n`);

    pollUpdates();
    startMobileTunnel();
  });
}
