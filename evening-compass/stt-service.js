const https = require('https');
const http = require('http');

/**
 * Downloads a file buffer from Telegram or any HTTPS URL
 */
function downloadFileBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download audio file: HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Transcribes audio buffer via Deepgram Nova-2 (Russian)
 */
function transcribeDeepgram(audioBuffer, apiKey) {
  return new Promise((resolve, reject) => {
    const url = 'https://api.deepgram.com/v1/listen?model=nova-2&language=ru&smart_format=true&punctuate=true';
    const parsed = new URL(url);

    const req = https.request({
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'audio/ogg',
        'Content-Length': audioBuffer.length
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.results && json.results.channels && json.results.channels[0]) {
            const transcript = json.results.channels[0].alternatives[0]?.transcript || '';
            resolve(transcript);
          } else {
            reject(new Error(json.error || 'Deepgram empty transcript'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(audioBuffer);
    req.end();
  });
}

/**
 * Transcribes audio buffer via Groq Whisper large-v3
 */
function transcribeGroq(audioBuffer, apiKey) {
  return new Promise((resolve, reject) => {
    const boundary = '----WhisperFormBoundary' + Math.random().toString(36).substring(2);
    let postData = [];

    // Model field
    postData.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3\r\n`));
    // Language field
    postData.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nru\r\n`));
    // File field
    postData.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="voice.ogg"\r\nContent-Type: audio/ogg\r\n\r\n`));
    postData.push(audioBuffer);
    postData.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const totalPayload = Buffer.concat(postData);

    const req = https.request({
      hostname: 'api.groq.com',
      port: 443,
      path: '/openai/v1/audio/transcriptions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalPayload.length
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.text) {
            resolve(json.text);
          } else {
            reject(new Error(json.error?.message || 'Whisper empty transcript'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(totalPayload);
    req.end();
  });
}

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Local transcription via uv faster-whisper (Runs completely offline on CPU)
 */
function transcribeLocal(audioBuffer) {
  return new Promise((resolve, reject) => {
    const tempPath = path.join(__dirname, `voice_${Date.now()}.oga`);
    fs.writeFileSync(tempPath, audioBuffer);

    console.log('[STT] Running local faster-whisper on CPU via uv...');
    const pythonScript = path.join(__dirname, 'transcribe_local.py');

    const env = { ...process.env, NO_PROXY: 'localhost,127.0.0.1' };
    const proc = spawn('uv', ['run', '--with', 'faster-whisper', '--with', 'httpx[socks]', 'python', pythonScript, tempPath], {
      cwd: __dirname,
      env
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', chunk => stdout += chunk.toString());
    proc.stderr.on('data', chunk => stderr += chunk.toString());

    proc.on('close', (code) => {
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e) {}

      if (code === 0 && stdout.trim()) {
        try {
          const json = JSON.parse(stdout.trim());
          if (json.text) {
            console.log(`[STT] Local transcription successful (${json.text.length} chars).`);
            return resolve(json.text);
          }
        } catch (e) {
          console.warn('[STT] JSON parse failed, returning raw stdout:', stdout.trim());
          return resolve(stdout.trim());
        }
      }
      console.error('[STT] Local whisper process error:', stderr);
      reject(new Error(`Local STT failed with code ${code}: ${stderr}`));
    });

    proc.on('error', (err) => {
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e) {}
      reject(err);
    });
  });
}

/**
 * Main audio transcription runner
 */
async function transcribeAudio(audioUrl, config = {}) {
  const deepgramKey = config.deepgramApiKey || process.env.DEEPGRAM_API_KEY;
  const groqKey = config.groqApiKey || process.env.GROQ_API_KEY;
  const openaiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;

  console.log(`[STT] Downloading voice from ${audioUrl}...`);
  const audioBuffer = await downloadFileBuffer(audioUrl);
  console.log(`[STT] Audio buffer downloaded (${audioBuffer.length} bytes).`);

  if (deepgramKey) {
    console.log('[STT] Transcribing via Deepgram Nova-2 (RU)...');
    return await transcribeDeepgram(audioBuffer, deepgramKey);
  }

  if (groqKey) {
    console.log('[STT] Transcribing via Groq Whisper-large-v3...');
    return await transcribeGroq(audioBuffer, groqKey);
  }

  if (openaiKey) {
    console.log('[STT] Transcribing via OpenAI Whisper...');
    return await transcribeGroq(audioBuffer, openaiKey);
  }

  // Automatic Offline Fallback: runs faster-whisper locally on CPU
  console.log('[STT] No cloud STT keys configured. Using built-in local faster-whisper...');
  try {
    return await transcribeLocal(audioBuffer);
  } catch (err) {
    console.error('[STT] Local transcription failed:', err.message);
    return null;
  }
}

module.exports = {
  downloadFileBuffer,
  transcribeAudio
};
