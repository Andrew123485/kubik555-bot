const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const zlib = require('zlib');
const crypto = require('crypto');

// Process safety
process.on('uncaughtException', err => console.error('[FATAL UNCAUGHT EXCEPTION]:', err));
process.on('unhandledRejection', err => console.error('[UNHANDLED REJECTION]:', err));

// Seneca Evening Compass Bot & Storage
let senecaBot = null;
let senecaDb = null;
let senecaNlp = null;
try {
  senecaBot = require('./evening-compass/bot.js');
  senecaDb = require('./evening-compass/db.js');
  senecaNlp = require('./evening-compass/nlp-parser.js');
  console.log('🏛️ Seneca Evening Compass modules loaded successfully.');
} catch (e) {
  console.warn('[Seneca Load Warning]:', e.message);
}

const BOT_TOKEN = '8914875997:AAGuUI99UFJv9SWbUWyXOMvTbhUBEc7tDj8';
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
const DB_FILE = path.join(__dirname, 'telegram_dice_history.json');
const DB_BACKUP = path.join(__dirname, 'telegram_dice_history.backup.json');

// In-memory / persistent store with automatic backup fallback
let history = [];
try {
  if (fs.existsSync(DB_FILE)) {
    history = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } else if (fs.existsSync(DB_BACKUP)) {
    history = JSON.parse(fs.readFileSync(DB_BACKUP, 'utf8'));
  }
} catch (e) {
  console.error('Error reading db:', e);
  try {
    if (fs.existsSync(DB_BACKUP)) {
      history = JSON.parse(fs.readFileSync(DB_BACKUP, 'utf8'));
    }
  } catch (err) {}
}

function saveDb() {
  try {
    const data = JSON.stringify(history, null, 2);
    fs.writeFileSync(DB_FILE, data, 'utf8');
    fs.writeFileSync(DB_BACKUP, data, 'utf8');
  } catch (e) {
    console.error('Error saving db:', e);
  }
}

// User state for pending notes: { chatId: { step: 'waiting_note', recordId: '...', cardMessageId: ... } }
const userStates = {};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PORT = process.env.PORT || 3000;
let publicUrl = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'https://kubik555-bot.onrender.com';
const isCloud = !!(process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || (process.env.PORT && process.env.PORT !== '3000'));

const URL_FILE = path.join(__dirname, 'tunnel_url.txt');
try {
  if (fs.existsSync(URL_FILE)) {
    const u = fs.readFileSync(URL_FILE, 'utf8').trim();
    if (u.startsWith('http') && !u.includes('.lhr.life') && !isCloud) publicUrl = u;
  }
} catch (e) {}

function getPublicUrl(chatId) {
  if (chatId) return `${publicUrl}?u=${chatId}`;
  return publicUrl;
}

let tunnelProcess = null;
function startTunnel() {
  console.log('🔗 [Tunnel] Starting localhost.run SSH tunnel for mobile access...');
  try {
    const keyPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Андрей', '.ssh', 'id_ed25519');
    const args = [
      '-R', '80:localhost:3000',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ServerAliveInterval=15',
      '-o', 'ServerAliveCountMax=3'
    ];
    if (fs.existsSync(keyPath)) {
      args.push('-i', keyPath);
    }
    args.push('nokey@localhost.run');

    const ssh = spawn('ssh', args);

    const handleOutput = (data) => {
      const str = data.toString();
      const match = str.match(/https:\/\/[a-z0-9]+\.lhr\.life/i);
      if (match) {
        publicUrl = match[0];
        try {
          fs.writeFileSync(URL_FILE, publicUrl, 'utf8');
        } catch (e) {}
        console.log('\n======================================================');
        console.log('📱 МОБИЛЬНАЯ ССЫЛКА НА 3D КУБИК:');
        console.log('======================================================\n');
        // Never overwrite stable cloud menu button with temporary localhost.run tunnel
        if (!isCloud) {
          // keep menu button pointing to https://kubik555-bot.onrender.com
        }
      }
    };

    ssh.stdout.on('data', handleOutput);
    ssh.stderr.on('data', handleOutput);

    ssh.on('close', (code) => {
      console.warn(`[Tunnel] SSH connection closed (code ${code}). Reconnecting in 5s...`);
      tunnelProcess = null;
      setTimeout(startTunnel, 5000);
    });

    ssh.on('error', (err) => {
      console.error('[Tunnel Error]:', err.message);
      tunnelProcess = null;
    });

    tunnelProcess = ssh;
  } catch (err) {
    console.error('[Tunnel Spawn Error]:', err);
  }
}

// Unified HTTP Server for Web App & Sync API
const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, 'http://localhost:3000');
  const pathname = urlObj.pathname;
  const queryUser = urlObj.searchParams.get('u') || urlObj.searchParams.get('user');

  console.log(`[HTTP ${req.method}] ${pathname}${queryUser ? ' (user: ' + queryUser + ')' : ''}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // GET /api/history
  if (pathname === '/api/history' && req.method === 'GET') {
    const userRecords = queryUser ? history.filter(r => String(r.chatId) === String(queryUser)) : [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(userRecords));
    return;
  }

  // POST /api/history/sync (Bi-directional multi-device sync, scoped per user)
  if (pathname === '/api/history/sync' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const userId = String(payload.userId || queryUser || '');
        if (!userId) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, records: [] }));
          return;
        }

        const incoming = Array.isArray(payload) ? payload : (payload.records || []);
        const deletedIds = Array.isArray(payload.deletedIds) ? payload.deletedIds : [];
        
        let changed = false;

        // 1. Remove deleted items for this user
        if (deletedIds.length > 0) {
          const prevLen = history.length;
          history = history.filter(r => !(deletedIds.includes(r.id) && String(r.chatId) === userId));
          if (history.length !== prevLen) {
            changed = true;
          }
        }

        incoming.forEach(item => {
          if (!item || !item.id) return;
          if (deletedIds.includes(item.id)) return; // Skip if deleted!
          if (String(item.id).endsWith('00000')) return; // Skip legacy generated test IDs!

          item.chatId = userId;
          if (!item.diceValue && item.diceNumber) item.diceValue = item.diceNumber;
          if (!item.diceNumber && item.diceValue) item.diceNumber = item.diceValue;
          if (!item.outcome) item.outcome = 'unknown';

          const idx = history.findIndex(r => r.id === item.id && String(r.chatId) === userId);
          if (idx >= 0) {
            if ((!history[idx].notes && item.notes) || (history[idx].outcome === 'unknown' && item.outcome !== 'unknown') || (history[idx].followed === 'pending' && item.followed !== 'pending')) {
              history[idx] = { ...history[idx], ...item, chatId: userId };
              changed = true;
            }
          } else {
            history.unshift(item);
            changed = true;
          }
        });

        if (changed) {
          history.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
          saveDb();
        }

        const userRecords = history.filter(r => String(r.chatId) === userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, records: userRecords }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid json' }));
      }
    });
    return;
  }

  // POST /api/history (Create or Update, scoped per user)
  if (pathname === '/api/history' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const item = JSON.parse(body);
        const userId = String(item.chatId || queryUser || '');
        if (!userId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'missing user id' }));
          return;
        }
        item.chatId = userId;
        if (!item.diceValue && item.diceNumber) item.diceValue = item.diceNumber;
        if (!item.diceNumber && item.diceValue) item.diceNumber = item.diceValue;
        if (!item.outcome) item.outcome = 'unknown';

        const existingIdx = history.findIndex(r => r.id === item.id && String(r.chatId) === userId);
        if (existingIdx >= 0) {
          history[existingIdx] = { ...history[existingIdx], ...item, chatId: userId };
        } else {
          history.unshift(item);
        }
        saveDb();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid json' }));
      }
    });
    return;
  }

  // POST /api/history/delete (Scoped per user)
  if (pathname === '/api/history/delete' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { id, userId } = JSON.parse(body);
        const u = String(userId || queryUser || '');
        if (!u) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'missing user id' }));
          return;
        }
        history = history.filter(r => !(r.id === id && String(r.chatId) === u));
        saveDb();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid json' }));
      }
    });
    return;
  }

  // POST /api/history/clear (Full reset for requesting user only)
  if (pathname === '/api/history/clear' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { userId } = JSON.parse(body);
        const u = String(userId || queryUser || '');
        if (u) {
          history = history.filter(r => String(r.chatId) !== u);
          saveDb();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid json' }));
      }
    });
    return;
  }

  // ----------------------------------------------------
  // SENECA COMPASS ROUTES (Cyber-Stoic 2.0 Reflection)
  // ----------------------------------------------------
  if (pathname === '/compass' || pathname === '/compass/') {
    const compassHtmlPath = path.join(__dirname, 'evening-compass', 'index.html');
    fs.readFile(compassHtmlPath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading compass html');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(data);
      }
    });
    return;
  }

  // Seneca API: Stats
  if ((pathname === '/api/compass/stats' || pathname === '/api/compass') && req.method === 'GET') {
    if (senecaDb) {
      const u = queryUser || 'default';
      const stats = senecaDb.getUserStats(u);
      const historyList = senecaDb.getReflections(u);
      const lastReflection = historyList[0] || null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ stats, history: historyList, lastReflection }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ stats: { currentStreak: 0, bestStreak: 0, totalDays: 0, tags: {} }, history: [] }));
    }
    return;
  }

  // Seneca API: Checkin
  if (pathname === '/api/compass/checkin' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const u = payload.userId || queryUser || 'default';
        if (senecaDb && senecaNlp) {
          const entry = {
            userId: u,
            pillars: payload.pillars || {},
            tags: senecaNlp.matchArchetype(JSON.stringify(payload.pillars || {})).map(x => x.id),
            createdAt: new Date().toISOString()
          };
          const saved = senecaDb.addReflection(entry);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, saved }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        }
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid json' }));
      }
    });
    return;
  }

  // Seneca Static Assets under /compass/...
  if (pathname.startsWith('/compass/')) {
    const rel = pathname.replace(/^\/compass\//, '');
    const compassFile = path.join(__dirname, 'evening-compass', rel);
    fs.readFile(compassFile, (err, data) => {
      if (err) {
        fs.readFile(path.join(__dirname, 'evening-compass', 'index.html'), (e2, d2) => {
          if (e2) { res.writeHead(404); res.end('Not found'); }
          else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d2); }
        });
      } else {
        const ext = path.extname(compassFile).toLowerCase();
        const mimeMap = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.css': 'text/css; charset=utf-8'
        };
        res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
        res.end(data);
      }
    });
    return;
  }

  // Static files
  const cleanPath = (pathname === '/' || pathname === '') ? 'index.html' : pathname.replace(/^\/+/, '');
  let p = path.join(__dirname, cleanPath);
  fs.readFile(p, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      const ext = path.extname(p).toLowerCase();
      const mimeMap = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.css': 'text/css; charset=utf-8',
        '.ico': 'image/x-icon',
        '.glb': 'model/gltf-binary',
        '.gltf': 'model/gltf+json'
      };
      const mime = mimeMap[ext] || 'application/octet-stream';

      // Robust Caching & ETag for Instant 0ms Reloads
      const etag = `"${crypto.createHash('md5').update(data).digest('hex').substring(0, 16)}"`;
      res.setHeader('ETag', etag);

      if (ext === '.html' || cleanPath === 'sw.js' || cleanPath === 'manifest.json') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }

      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304);
        res.end();
        return;
      }

      const acceptEncoding = req.headers['accept-encoding'] || '';
      if (acceptEncoding.includes('gzip') && data.length > 512) {
        zlib.gzip(data, { level: 6 }, (zErr, gzipped) => {
          if (!zErr && gzipped) {
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Content-Length', gzipped.length);
            res.writeHead(200, { 'Content-Type': mime });
            res.end(gzipped);
          } else {
            res.setHeader('Content-Length', Buffer.byteLength(data));
            res.writeHead(200, { 'Content-Type': mime });
            res.end(data);
          }
        });
      } else {
        res.setHeader('Content-Length', Buffer.byteLength(data));
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web Server & Sync API running on port ${PORT}`);
});

// Resilient Telegram API Helper: ALWAYS resolves, never unhandled reject
function apiRequest(method, payload) {
  return new Promise((resolve) => {
    try {
      const url = `${API_BASE}/${method}`;
      const data = JSON.stringify(payload);
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 35000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (!parsed.ok) {
              console.error(`[API ERROR ${method}]:`, parsed.description || body);
            }
            resolve(parsed);
          } catch (e) {
            console.error(`[PARSE ERROR ${method}]:`, body);
            resolve({ ok: false, error: body });
          }
        });
      });

      req.on('error', (err) => {
        console.error(`[NET ERROR ${method}]:`, err.message);
        resolve({ ok: false, error: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'timeout' });
      });

      req.write(data);
      req.end();
    } catch (err) {
      console.error(`[REQUEST SYNC ERROR ${method}]:`, err.message);
      resolve({ ok: false, error: err.message });
    }
  });
}

// Automatically update Telegram's native persistent WebApp Menu Button
async function updateMenuButton(url) {
  try {
    const res = await apiRequest('setChatMenuButton', {
      menu_button: {
        type: 'web_app',
        text: '🎲 3D Кубик',
        web_app: {
          url: url
        }
      }
    });
    console.log('📌 Telegram Persistent Menu Button configured to:', url, res && res.ok ? 'OK' : (res ? res.description : 'err'));
  } catch (e) {
    console.error('Error setting Telegram menu button:', e);
  }
}

// Telegram helpers with automatic fallback if HTML parse fails
async function sendMessage(chatId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  let res = await apiRequest('sendMessage', payload);
  if (!res.ok && res.description && res.description.includes("can't parse entities")) {
    console.warn('[FALLBACK PLAIN TEXT sendMessage]');
    delete payload.parse_mode;
    payload.text = text.replace(/<[^>]*>/g, '');
    res = await apiRequest('sendMessage', payload);
  }
  return res;
}

async function editMessageText(chatId, messageId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: 'HTML'
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  let res = await apiRequest('editMessageText', payload);
  if (!res.ok && res.description && res.description.includes("can't parse entities")) {
    console.warn('[FALLBACK PLAIN TEXT editMessageText]');
    delete payload.parse_mode;
    payload.text = text.replace(/<[^>]*>/g, '');
    res = await apiRequest('editMessageText', payload);
  }
  return res;
}

async function sendDice(chatId) {
  return await apiRequest('sendDice', {
    chat_id: chatId,
    emoji: '🎲'
  });
}

function detectCategory(q) {
  if (!q || q === 'Решение по жребию') return 'Спонтанность';
  const l = q.toLowerCase();
  if (l.match(/купить|купил|купи|покуп|цена|руб|доллар|деньг|акци|бизнес|доход|трат/i)) return 'Покупки и деньги';
  if (l.match(/работ|проект|начальник|клиент|коллег|ваканси|собесед|резюме|оффер|задач/i)) return 'Работа и карьера';
  if (l.match(/девушк|парен|отношен|любов|семь|мама|папа|друг|подруг|написат|позвонит|встрет/i)) return 'Отношения и семья';
  if (l.match(/спорт|зал|трениров|здоров|бег|врач|еда|питани|диет|сон|спать/i)) return 'Здоровье и спорт';
  if (l.match(/уборк|помыт|квартир|быт|готовк|ремонт|магазин|дом|ужин/i)) return 'Быт и рутина';
  return 'Общее';
}

// Modern Minimalist Card using Telegram Native Blockquotes
function formatRecordCard(record) {
  let followStr = '⏳ <i>Думаю</i>';
  if (record.followed === 'followed') followStr = '🟢 <b>Послушался</b>';
  else if (record.followed === 'defied') followStr = '🔴 <b>Сделал наоборот</b>';

  let outcomeStr = '❓ <i>Не ясно</i>';
  if (record.outcome === 'pleased') outcomeStr = '😊 <b>Доволен</b>';
  else if (record.outcome === 'neutral') outcomeStr = '😐 <b>Нормально</b>';
  else if (record.outcome === 'regret') outcomeStr = '😞 <b>Пожалел</b>';

  const isDefaultQ = !record.question || record.question === 'Решение по жребию';
  const qTitle = isDefaultQ ? '🎲 <b>Решение по жребию</b>' : `🎯 <b>«${escapeHtml(record.question)}»</b>`;

  let text = `${qTitle}\n\n`;
  text += `<blockquote>`;
  if (record.category && record.category !== 'Общее') {
    text += `<b>Сфера:</b> <i>${escapeHtml(record.category)}</i>\n`;
  }
  text += `<b>Действие:</b> ${followStr}\n`;
  text += `<b>Ощущения:</b> ${outcomeStr}\n`;
  if (record.notes) {
    text += `<b>Заметка:</b> <i>«${escapeHtml(record.notes)}»</i>`;
  } else {
    text += `<b>Заметка:</b> <i>(можно добавить позже)</i>`;
  }
  text += `</blockquote>`;
  return text;
}

function getRecordKeyboard(record) {
  const f = record.followed || 'pending';
  const o = record.outcome || 'unknown';
  const id = record.id;

  return {
    inline_keyboard: [
      // Row 1: Действие
      [
        { text: `${f === 'followed' ? '🟢 Послушался ✓' : 'Послушался'}`, callback_data: `act:followed:${id}` },
        { text: `${f === 'defied' ? '🔴 Наоборот ✓' : 'Наоборот'}`, callback_data: `act:defied:${id}` },
        { text: `${f === 'pending' ? '⏳ Думаю ✓' : 'Думаю'}`, callback_data: `act:pending:${id}` }
      ],
      // Row 2: Исход
      [
        { text: `${o === 'pleased' ? '😊 Доволен ✓' : '😊 Доволен'}`, callback_data: `out:pleased:${id}` },
        { text: `${o === 'neutral' ? '😐 Нормально ✓' : '😐 Нормально'}`, callback_data: `out:neutral:${id}` },
        { text: `${o === 'regret' ? '😞 Пожалел ✓' : '😞 Пожалел'}`, callback_data: `out:regret:${id}` },
        { text: `${o === 'unknown' ? '❓ Не ясно ✓' : '❓ Не ясно'}`, callback_data: `out:unknown:${id}` }
      ],
      // Row 3: Заметки
      [
        { text: record.notes ? '✏️ Изменить заметку' : '📝 Заметка / последствия', callback_data: `note:${id}` }
      ],
      // Row 4: ИИ
      [
        { text: '✨ Скопировать для ИИ', callback_data: `ai:${id}` }
      ]
    ]
  };
}

// Resilient Polling Loop
let lastUpdateId = 0;

async function pollUpdates() {
  try {
    const res = await apiRequest('getUpdates', {
      offset: lastUpdateId + 1,
      timeout: 25
    });

    if (res.ok && Array.isArray(res.result)) {
      for (const update of res.result) {
        lastUpdateId = Math.max(lastUpdateId, update.update_id);
        try {
          await handleUpdate(update);
        } catch (err) {
          console.error(`[ERROR IN UPDATE ${update.update_id}]:`, err);
        }
      }
    }
  } catch (err) {
    console.error('Polling error:', err.message);
    await new Promise(r => setTimeout(r, 2000));
  }
  setImmediate(pollUpdates);
}

// Handler
async function handleUpdate(update) {
  if (update.message) {
    console.log(`[MSG from ${update.message.chat.id}]:`, update.message.text);
    await handleMessage(update.message);
  } else if (update.callback_query) {
    console.log(`[CB from ${update.callback_query.message ? update.callback_query.message.chat.id : '?'}]:`, update.callback_query.data);
    await handleCallbackQuery(update.callback_query);
  }
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : '';

  // Check if waiting for note
  if (userStates[chatId] && userStates[chatId].step === 'waiting_note') {
    const { recordId, cardMessageId } = userStates[chatId];
    const record = history.find(r => r.id === recordId && String(r.chatId) === String(chatId));
    if (record) {
      record.notes = text;
      saveDb();
      delete userStates[chatId];
      await sendMessage(chatId, `✅ <b>Заметка сохранена:</b>\n<i>«${escapeHtml(text)}»</i>`);
      
      if (cardMessageId) {
        try {
          await editMessageText(chatId, cardMessageId, formatRecordCard(record), getRecordKeyboard(record));
        } catch (e) {
          // ignore
        }
      }
      return;
    }
    delete userStates[chatId];
  }

  // Commands
  if (text === '/start') {
    const userUrl = getPublicUrl(chatId);
    const welcome = `🎲 <b>Кубик Решений</b>\n\n` +
      `Интерактивный 3D-кубик судьбы с синхронизацией истории, статистикой и аналитикой для принятия решений.\n\n` +
      `<b>Правило:</b>\n` +
      `🟢 Чётное (2, 4, 6) — <b>ДА</b>\n` +
      `🔴 Нечётное (1, 3, 5) — <b>НЕТ</b>\n\n` +
      `📱 <b>Открыть на телефоне:</b>\n` +
      `👉 Нажми большую кнопку <b>«✨ Открыть 3D Кубик»</b> внизу экрана или перейди по ссылке:\n` +
      `<a href="${userUrl}">${userUrl}</a>\n\n` +
      `<i>Также можно написать вопрос прямо в чат или бросить кубик кнопкой ниже.</i>`;
    
    await sendMessage(chatId, welcome, {
      keyboard: [
        [{ text: '✨ Открыть 3D Кубик', web_app: { url: userUrl } }],
        [{ text: '🎲 Бросить кубик в чате' }],
        [{ text: '⏳ Ждут заполнения' }, { text: '📜 История решений' }],
        [{ text: '📊 Моя статистика' }, { text: '📋 Отчёт для ИИ' }],
        [{ text: '🔄 Обнуление' }]
      ],
      resize_keyboard: true
    });
    return;
  }

  if (text === '/app' || text === '/cube' || text === '/web' || text === '/link' || text === '🌐 Ссылка на кубик') {
    const userUrl = getPublicUrl(chatId);
    await sendMessage(chatId, `✨ <b>Интерактивный 3D Кубик:</b>\n<a href="${userUrl}">${userUrl}</a>`, {
      inline_keyboard: [
        [{ text: '🎲 Открыть 3D Кубик в Telegram', web_app: { url: userUrl } }],
        [{ text: '🌐 Открыть в браузере', url: userUrl }]
      ]
    });
    return;
  }

  // Reset / Clear confirmation
  if (text === '/reset' || text === '/clear' || text === '/обнуление' || text === '🔄 Обнуление') {
    await sendMessage(chatId, `⚠️ <b>Обнуление вашей истории</b>\n\nТы действительно хочешь удалить все свои записи решений и начать с чистого листа?`, {
      inline_keyboard: [
        [
          { text: '🔴 Да, обнулить моё', callback_data: 'reset:confirm' },
          { text: '⚪ Отмена', callback_data: 'reset:cancel' }
        ]
      ]
    });
    return;
  }

  // Immediate clear
  if (text === '/clear_all' || text === '/force_reset') {
    history = history.filter(r => String(r.chatId) !== String(chatId));
    saveDb();
    delete userStates[chatId];
    await sendMessage(chatId, `✨ <b>Ваша история решений полностью обнулена!</b>\nВсе ваши записи очищены.`);
    return;
  }

  if (text === '/pending' || text === '⏳ Ждут заполнения') {
    await sendPendingDecisions(chatId);
    return;
  }

  if (text === '/history' || text === '📜 История решений') {
    await sendHistory(chatId);
    return;
  }

  if (text === '/stats' || text === '📊 Моя статистика') {
    await sendStats(chatId);
    return;
  }

  if (text === '/export' || text === '📋 Отчёт для ИИ') {
    await sendAiExport(chatId);
    return;
  }

  // If user sent a question or clicked roll
  const question = (text === '🎲 Бросить кубик без вопроса' || text === '🎲 Бросить кубик в чате') ? 'Решение по жребию' : text;
  
  // Send dice
  const diceMsg = await sendDice(chatId);
  const val = diceMsg.result && diceMsg.result.dice ? diceMsg.result.dice.value : (Math.floor(Math.random() * 6) + 1);
  const isEven = val % 2 === 0;
  const verdictText = isEven ? 'ДА' : 'НЕТ';

  const recordId = 'rec_' + Date.now();
  const detectedCat = detectCategory(question);
  const record = {
    id: recordId,
    chatId: String(chatId),
    question: question,
    category: detectedCat,
    diceValue: val,
    isEven: isEven,
    verdictText: verdictText,
    followed: 'pending',
    outcome: 'unknown',
    notes: '',
    createdAt: new Date().toISOString()
  };
  history.push(record);
  saveDb();

  setTimeout(async () => {
    try {
      const cardText = formatRecordCard(record);
      const keyboard = getRecordKeyboard(record);
      await sendMessage(chatId, cardText, keyboard);
    } catch (e) {
      console.error('Error sending dice record card:', e);
    }
  }, 3200);
}

// Handle inline buttons
async function handleCallbackQuery(cb) {
  const chatId = cb.message ? cb.message.chat.id : null;
  const messageId = cb.message ? cb.message.message_id : null;
  const data = cb.data;

  if (!chatId) return;

  // Reset confirmation
  if (data === 'reset:confirm') {
    history = history.filter(r => String(r.chatId) !== String(chatId));
    saveDb();
    delete userStates[chatId];
    await apiRequest('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: 'Ваша история обнулена!'
    });
    if (messageId) {
      await editMessageText(chatId, messageId, '🗑️ <i>Ваша история очищена по запросу.</i>', { inline_keyboard: [] });
    }
    await sendMessage(chatId, '✨ <b>Ваша история решений успешно обнулена!</b>\n\nВсе ваши старые записи удалены. База чиста, можно принимать решения заново 🎲');
    return;
  }

  if (data === 'reset:cancel') {
    await apiRequest('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: 'Отменено'
    });
    if (messageId) {
      await editMessageText(chatId, messageId, '👌 <i>Обнуление отменено. Ваша история решений сохранена.</i>', { inline_keyboard: [] });
    }
    return;
  }

  if (data.startsWith('act:')) {
    const [, status, recordId] = data.split(':');
    const record = history.find(r => r.id === recordId && String(r.chatId) === String(chatId));
    if (record) {
      record.followed = status;
      saveDb();
      const statusLabel = status === 'followed' ? 'Послушался' : (status === 'defied' ? 'Сделал наоборот' : 'В раздумьях');
      await apiRequest('answerCallbackQuery', {
        callback_query_id: cb.id,
        text: `✓ ${statusLabel}`
      });
      if (messageId) {
        await editMessageText(chatId, messageId, formatRecordCard(record), getRecordKeyboard(record));
      }
    }
  } else if (data.startsWith('out:')) {
    const [, outcome, recordId] = data.split(':');
    const record = history.find(r => r.id === recordId && String(r.chatId) === String(chatId));
    if (record) {
      record.outcome = outcome;
      saveDb();
      const labelMap = { pleased: '😊 Доволен', neutral: '😐 Нормально', regret: '😞 Пожалел', unknown: '❓ Не ясно' };
      await apiRequest('answerCallbackQuery', {
        callback_query_id: cb.id,
        text: `✓ ${labelMap[outcome] || outcome}`
      });
      if (messageId) {
        await editMessageText(chatId, messageId, formatRecordCard(record), getRecordKeyboard(record));
      }
    }
  } else if (data.startsWith('note:')) {
    const recordId = data.split(':')[1];
    const record = history.find(r => r.id === recordId && String(r.chatId) === String(chatId));
    if (record) {
      userStates[chatId] = { step: 'waiting_note', recordId: recordId, cardMessageId: messageId };
      await apiRequest('answerCallbackQuery', {
        callback_query_id: cb.id
      });
      const promptText = record && record.question && record.question !== 'Решение по жребию'
        ? `✍️ <b>Последствия и заметки к вопросу:</b>\n«${escapeHtml(record.question)}»\n\nК чему привело решение? Какие мысли возникли спустя время?\n<i>(Напиши ответным сообщением текстом в этот чат)</i>`
        : `✍️ <b>Последствия и заметки:</b>\nК чему привело решение? Какие мысли возникли?\n<i>(Напиши ответным сообщением текстом в этот чат)</i>`;
      await sendMessage(chatId, promptText);
    }
  } else if (data.startsWith('open:')) {
    const recordId = data.split(':')[1];
    const record = history.find(r => r.id === recordId && String(r.chatId) === String(chatId));
    if (record) {
      await apiRequest('answerCallbackQuery', { callback_query_id: cb.id });
      const cardText = formatRecordCard(record);
      const keyboard = getRecordKeyboard(record);
      await sendMessage(chatId, cardText, keyboard);
    } else {
      await apiRequest('answerCallbackQuery', { callback_query_id: cb.id, text: 'Решение не найдено' });
    }
  } else if (data === 'open_pending') {
    await apiRequest('answerCallbackQuery', { callback_query_id: cb.id });
    await sendPendingDecisions(chatId);
  } else if (data.startsWith('ai:') || data === 'ai:export') {
    await apiRequest('answerCallbackQuery', { callback_query_id: cb.id, text: 'Генерирую отчёт для ИИ...' });
    await sendAiExport(chatId);
  }
}

// Send Pending Decisions (Those needing outcome or follow-up)
async function sendPendingDecisions(chatId) {
  const userRecords = history.filter(r => String(r.chatId) === String(chatId));
  const pending = userRecords.filter(r => r.outcome === 'unknown' || r.followed === 'pending');

  if (pending.length === 0) {
    await sendMessage(chatId, `🎉 <b>Все решения уже оценены и заполнены!</b>\nУ тебя нет бросков, ожидающих подтверждения.`);
    return;
  }

  let text = `⏳ <b>РЕШЕНИЯ, ОЖИДАЮЩИЕ ЗАПОЛНЕНИЯ (${pending.length})</b>\n\n`;
  text += `Ты можешь в любой момент открыть старые решения и дополнить их итогами.\n\n`;
  text += `<i>Нажми на решение ниже, чтобы открыть его карточку:</i>`;

  const recentPending = pending.slice(-6).reverse();
  const buttons = recentPending.map((r, idx) => {
    const d = new Date(r.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
    let label = r.question && r.question !== 'Решение по жребию' ? `«${r.question}»` : 'Жребий';
    if (label.length > 25) label = label.slice(0, 24) + '…';
    return [{ text: `📝 ${label} (${d})`, callback_data: `open:${r.id}` }];
  });

  await sendMessage(chatId, text, { inline_keyboard: buttons });
}

// Send History
async function sendHistory(chatId) {
  const userRecords = history.filter(r => String(r.chatId) === String(chatId));
  if (userRecords.length === 0) {
    await sendMessage(chatId, `📭 <b>История пуста.</b>\nЗадай вопрос или брось кубик!`);
    return;
  }

  let msg = `📜 <b>ПОСЛЕДНИЕ РЕШЕНИЯ (${userRecords.length}):</b>\n\n`;
  const recent = userRecords.slice(-5).reverse();

  recent.forEach((r, idx) => {
    const d = new Date(r.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

    let followLabel = '⏳ Думаю';
    if (r.followed === 'followed') followLabel = '🟢 Послушался';
    else if (r.followed === 'defied') followLabel = '🔴 Наоборот';

    let outcomeLabel = '❓ Не ясно';
    if (r.outcome === 'pleased') outcomeLabel = '😊 Доволен';
    else if (r.outcome === 'neutral') outcomeLabel = '😐 Нормально';
    else if (r.outcome === 'regret') outcomeLabel = '😞 Пожалел';

    const qText = r.question && r.question !== 'Решение по жребию' ? `«${escapeHtml(r.question)}»` : 'Решение по жребию';
    msg += `<b>${idx + 1}. [${d}] ${qText}</b>\n`;
    msg += `<blockquote>• <b>Действие:</b> ${followLabel} • <b>Исход:</b> ${outcomeLabel}\n`;
    if (r.notes) {
      msg += `• <b>Заметка:</b> <i>«${escapeHtml(r.notes)}»</i>\n`;
    }
    msg += `</blockquote>\n`;
  });

  msg += `<i>Выбери решение, чтобы открыть и дополнить его критерии:</i>`;

  const buttons = recent.map((r, idx) => {
    let label = r.question && r.question !== 'Решение по жребию' ? `«${r.question}»` : `Жребий #${idx + 1}`;
    if (label.length > 25) label = label.slice(0, 24) + '…';
    return [{ text: `✏️ Открыть: ${label}`, callback_data: `open:${r.id}` }];
  });

  await sendMessage(chatId, msg, { inline_keyboard: buttons });
}

function makeProgressBar(pct, totalLen = 14) {
  const filled = Math.min(totalLen, Math.max(0, Math.round((pct / 100) * totalLen)));
  const empty = totalLen - filled;
  return '▰'.repeat(filled) + '▱'.repeat(empty);
}

// Send Professional Stats & Analytics
async function sendStats(chatId) {
  const userRecords = history.filter(r => String(r.chatId) === String(chatId));
  const total = userRecords.length;
  if (total === 0) {
    await sendMessage(chatId, `📭 <b>История решений пуста.</b>\nЗадай свой первый вопрос или нажми «🎲 Бросить кубик без вопроса»!`);
    return;
  }

  const yesCount = userRecords.filter(r => r.isEven).length;
  const noCount = total - yesCount;
  const yesPct = Math.round((yesCount / total) * 100);
  const noPct = 100 - yesPct;

  const followedCount = userRecords.filter(r => r.followed === 'followed').length;
  const defiedCount = userRecords.filter(r => r.followed === 'defied').length;
  const pendingCount = userRecords.filter(r => r.followed === 'pending' || !r.followed).length;
  const followRate = Math.round((followedCount / total) * 100);

  const pleasedCount = userRecords.filter(r => r.outcome === 'pleased').length;
  const neutralCount = userRecords.filter(r => r.outcome === 'neutral').length;
  const regretCount = userRecords.filter(r => r.outcome === 'regret').length;
  const unknownCount = userRecords.filter(r => !r.outcome || r.outcome === 'unknown').length;
  const ratedCount = pleasedCount + neutralCount + regretCount;
  const pleasedRate = ratedCount > 0 ? Math.round((pleasedCount / ratedCount) * 100) : 0;

  // Correlation Matrix: "Где положительно сбывается"
  const followedRecords = userRecords.filter(r => r.followed === 'followed');
  const followedPleased = followedRecords.filter(r => r.outcome === 'pleased').length;
  const followedNeutral = followedRecords.filter(r => r.outcome === 'neutral').length;
  const followedRegret = followedRecords.filter(r => r.outcome === 'regret').length;
  const followedRate = followedRecords.length > 0 ? Math.round((followedPleased / followedRecords.length) * 100) : 0;

  const defiedRecords = userRecords.filter(r => r.followed === 'defied');
  const defiedPleased = defiedRecords.filter(r => r.outcome === 'pleased').length;
  const defiedNeutral = defiedRecords.filter(r => r.outcome === 'neutral').length;
  const defiedRegret = defiedRecords.filter(r => r.outcome === 'regret').length;
  const defiedRate = defiedRecords.length > 0 ? Math.round((defiedPleased / defiedRecords.length) * 100) : 0;

  // Category statistics & ranking
  const catMap = {};
  userRecords.forEach(r => {
    const c = r.category || 'Общее';
    if (!catMap[c]) catMap[c] = { total: 0, pleased: 0, neutral: 0, regret: 0 };
    catMap[c].total++;
    if (r.outcome === 'pleased') catMap[c].pleased++;
    else if (r.outcome === 'neutral') catMap[c].neutral++;
    else if (r.outcome === 'regret') catMap[c].regret++;
  });

  const sortedCats = Object.keys(catMap).sort((a, b) => {
    const rateA = catMap[a].pleased / catMap[a].total;
    const rateB = catMap[b].pleased / catMap[b].total;
    if (rateB !== rateA) return rateB - rateA;
    return catMap[b].total - catMap[a].total;
  });

  // Algorithm psychological insight
  let insight = '';
  if (followedRecords.length >= 1 && defiedRecords.length >= 1) {
    if (followedRate > defiedRate) {
      insight = `Доверие кубику приносит вам больше удовлетворения (${followedRate}% доволен vs ${defiedRate}% вопреки). Жребий эффективно снимает сомнения.`;
    } else if (defiedRate > followedRate) {
      insight = `Действия вопреки жребию дают высокий успех (${defiedRate}% доволен). Кубик работает для вас как «проявитель скрытого истинного желания».`;
    } else {
      insight = `Паритет: следование совету и действия вопреки приносят равную сбываемость (${followedRate}%). Вы осознанно взвешиваете последствия.`;
    }
  } else if (followedRecords.length >= 2) {
    insight = `Вы придерживаетесь советов жребия в ${followRate}% случаев. Удовлетворённость результатом составляет ${followedRate}%.`;
  } else {
    insight = `Отмечайте исходы решений («Доволен» / «Пожалел»), чтобы алгоритм рассчитал ваши скрытые паттерны и зоны максимальной удачи.`;
  }

  // Construct styled editorial message
  let msg = `📊 <b>АНАЛИТИКА И СТАТИСТИКА РЕШЕНИЙ</b>\n\n`;

  // Top KPIs
  msg += `<blockquote>`;
  msg += `🎲 <b>Всего обращений:</b> <code>${total}</code>\n`;
  msg += `⚖️ <b>Баланс вердиктов:</b> Чёт: <b>${yesCount}</b> • Нечет: <b>${noCount}</b>\n`;
  msg += `🎯 <b>Индекс доверия жребию:</b> <code>${followRate}%</code> (${followedCount} из ${total})\n`;
  msg += `✨ <b>Индекс «Доволен»:</b> <code>${pleasedRate}%</code>`;
  msg += `</blockquote>\n\n`;

  // Verdict breakdown
  msg += `<b>⚖️ Баланс вердиктов кубика:</b>\n`;
  msg += `<blockquote>`;
  msg += `🟢 <b>Чётное (ДА):</b> ${yesCount} (${yesPct}%)\n`;
  msg += `<code>${makeProgressBar(yesPct, 14)}</code>\n`;
  msg += `🔴 <b>Нечётное (НЕТ):</b> ${noCount} (${noPct}%)\n`;
  msg += `<code>${makeProgressBar(noPct, 14)}</code>`;
  msg += `</blockquote>\n\n`;

  // Actions
  msg += `<b>🧭 Твои действия:</b>\n`;
  msg += `<blockquote>`;
  msg += `• 🟢 Послушался: <b>${followedCount}</b> (${Math.round((followedCount / total) * 100)}%)\n`;
  msg += `• 🔴 Сделал наоборот: <b>${defiedCount}</b> (${Math.round((defiedCount / total) * 100)}%)\n`;
  msg += `• ⏳ В раздумьях: <b>${pendingCount}</b> (${Math.round((pendingCount / total) * 100)}%)`;
  msg += `</blockquote>\n\n`;

  // Outcomes
  msg += `<b>💭 Оценка исходов и эмоций:</b>\n`;
  msg += `<blockquote>`;
  msg += `• 😊 Доволен: <b>${pleasedCount}</b>\n`;
  msg += `• 😐 Нормально: <b>${neutralCount}</b>\n`;
  msg += `• 😞 Пожалел: <b>${regretCount}</b>\n`;
  msg += `• ❓ Не ясно: <b>${unknownCount}</b>`;
  msg += `</blockquote>\n\n`;

  // Correlation: "Где положительно сбывается"
  msg += `<b>✨ ГДЕ ПОЛОЖИТЕЛЬНО СБЫВАЕТСЯ:</b>\n`;
  msg += `<blockquote>`;
  msg += `<b>1. Когда последовал кубику:</b>\n`;
  if (followedRecords.length > 0) {
    msg += `🟢 Доволен: <b>${followedRate}%</b> <i>(${followedPleased} из ${followedRecords.length})</i>\n`;
    msg += `<code>${makeProgressBar(followedRate, 12)}</code>\n`;
    msg += `<i>• Нормально: ${followedNeutral} • Пожалел: ${followedRegret}</i>\n\n`;
  } else {
    msg += `<i>(Пока нет оценённых решений при следовании кубику)</i>\n\n`;
  }

  msg += `<b>2. Когда сделал вопреки кубику:</b>\n`;
  if (defiedRecords.length > 0) {
    msg += `🔴 Доволен: <b>${defiedRate}%</b> <i>(${defiedPleased} из ${defiedRecords.length})</i>\n`;
    msg += `<code>${makeProgressBar(defiedRate, 12)}</code>\n`;
    msg += `<i>• Нормально: ${defiedNeutral} • Пожалел: ${defiedRegret}</i>`;
  } else {
    msg += `<i>(Пока нет решений, где сделано вопреки)</i>`;
  }
  msg += `</blockquote>\n\n`;

  // Categories
  if (sortedCats.length > 0 && !(sortedCats.length === 1 && sortedCats[0] === 'Общее')) {
    msg += `<b>🏆 Успешность по сферам жизни (% Доволен):</b>\n`;
    msg += `<blockquote>`;
    sortedCats.slice(0, 5).forEach((cat, idx) => {
      const c = catMap[cat];
      const rate = Math.round((c.pleased / c.total) * 100);
      msg += `${idx + 1}. <b>${escapeHtml(cat)}</b> — ${rate}% (${c.pleased}/${c.total})\n`;
      msg += `<code>${makeProgressBar(rate, 12)}</code>\n`;
    });
    msg += `</blockquote>\n\n`;
  }

  // Psychological insight
  msg += `<b>🧠 Анализ паттернов:</b>\n`;
  msg += `<blockquote><i>«${escapeHtml(insight)}»</i></blockquote>`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '⏳ Заполнить исходы', callback_data: 'open_pending' },
        { text: '📋 Текст для ИИ', callback_data: 'ai:export' }
      ]
    ]
  };

  await sendMessage(chatId, msg, keyboard);
}

// Send AI Export
async function sendAiExport(chatId) {
  const userRecords = history.filter(r => String(r.chatId) === String(chatId));
  if (userRecords.length === 0) {
    await sendMessage(chatId, `У тебя пока нет записей для отчёта. Сначала брось кубик и запиши решение!`);
    return;
  }

  const total = userRecords.length;
  const yesCount = userRecords.filter(r => r.isEven).length;
  const noCount = total - yesCount;
  const followedCount = userRecords.filter(r => r.followed === 'followed').length;
  const defiedCount = userRecords.filter(r => r.followed === 'defied').length;
  const pendingCount = userRecords.filter(r => r.followed === 'pending' || !r.followed).length;

  const pleasedCount = userRecords.filter(r => r.outcome === 'pleased').length;
  const neutralCount = userRecords.filter(r => r.outcome === 'neutral').length;
  const regretCount = userRecords.filter(r => r.outcome === 'regret').length;
  const unknownCount = userRecords.filter(r => !r.outcome || r.outcome === 'unknown').length;

  let prompt = `Привет! Вот моя история решений по кубику (Чётное = ДА, Нечётное = НЕТ):\n\n`;
  prompt += `### 1. ОБЩАЯ СВОДКА:\n`;
  prompt += `- Всего решений: ${total}\n`;
  prompt += `- Вердикты: ЧЁТНОЕ — ${yesCount} (${Math.round(yesCount/total*100)}%), НЕЧЁТНОЕ — ${noCount} (${Math.round(noCount/total*100)}%)\n`;
  prompt += `- Последовал совету: Послушался — ${followedCount}, Сделал наоборот — ${defiedCount}, В раздумьях — ${pendingCount}\n`;
  prompt += `- Оценка исходов: Доволен — ${pleasedCount}, Нормально — ${neutralCount}, Пожалел — ${regretCount}, Не ясно — ${unknownCount}\n\n`;
  prompt += `### 2. ЛЕТОПИСЬ РЕШЕНИЙ:\n`;

  userRecords.forEach((r, i) => {
    const d = new Date(r.createdAt).toLocaleDateString('ru-RU');
    const f = r.followed === 'followed' ? 'Послушался' : (r.followed === 'defied' ? 'Сделал наоборот' : 'В раздумьях');
    const oMap = { pleased: 'Доволен', neutral: 'Нормально', regret: 'Пожалел', unknown: 'Не ясно' };
    const o = oMap[r.outcome] || 'Не ясно';
    const diceVal = r.diceValue || r.diceNumber || '?';
    prompt += `${i + 1}. [${d}] "${r.question}" | Кубик: ${diceVal} | Действие: ${f} | Исход: ${o}\n`;
    if (r.notes) prompt += `   Последствия: "${r.notes}"\n`;
  });

  prompt += `\n### 3. ЗАПРОС НА ПСИХОЛОГИЧЕСКИЙ АНАЛИЗ:\n`;
  prompt += `Сделай глубокий психологический разбор:\n`;
  prompt += `1. В каких темах и ситуациях я чаще всего перекладываю выбор на случайность?\n`;
  prompt += `2. Насколько эффективно доверие жребию: какой результат приносит следование совету vs действия вопреки?\n`;
  prompt += `3. Какие скрытые страхи, блоки или паттерны прокрастинации проявляются в моих вопросах и заметках?\n`;
  prompt += `4. Дай персональные рекомендации по укреплению уверенности в принятии решений.\n`;

  await sendMessage(chatId, `📋 <b>Скопируй этот блок (нажми на него для копирования) и отправь нашему ИИ-агенту:</b>\n\n<pre><code>${escapeHtml(prompt)}</code></pre>`);
}

// Launch
console.log(`🤖 Telegram Bot @kubik555bot resilient runner started... (Port: ${PORT}, Cloud: ${isCloud})`);
pollUpdates();

const compassPublicUrl = 'https://kubik555-bot.onrender.com/compass';
if (senecaBot && senecaBot.initSenecaCloud) {
  try {
    senecaBot.initSenecaCloud(compassPublicUrl);
  } catch (err) {
    console.error('[SENECA CLOUD LAUNCH ERROR]:', err);
  }
}

if (isCloud) {
  console.log(`☁️ Running in Cloud Mode! Public URL: ${publicUrl}`);
  updateMenuButton(publicUrl);

  // Self-keepalive: prevent Render from spinning down on free tier (Render timeout is 15m)
  if (publicUrl && publicUrl.startsWith('https://')) {
    setInterval(() => {
      try {
        https.get(publicUrl, (res) => {}).on('error', () => {});
        https.get(compassPublicUrl, (res) => {}).on('error', () => {});
        console.log(`[KEEPALIVE] Sent keepalive ping to Render at ${new Date().toLocaleTimeString('ru-RU')}`);
      } catch (e) {}
    }, 9 * 60 * 1000); // Every 9 minutes
  }
} else {
  startTunnel();
}
