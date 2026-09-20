const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const REFLECTIONS_FILE = path.join(DATA_DIR, 'reflections.json');
const HABIT_STATS_FILE = path.join(DATA_DIR, 'habit_stats.json');

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let reflections = [];
let habitStats = {};

// Load reflections
try {
  if (fs.existsSync(REFLECTIONS_FILE)) {
    reflections = JSON.parse(fs.readFileSync(REFLECTIONS_FILE, 'utf8'));
  }
} catch (e) {
  console.error('[DB] Error loading reflections:', e.message);
  reflections = [];
}

// Load habit stats
try {
  if (fs.existsSync(HABIT_STATS_FILE)) {
    habitStats = JSON.parse(fs.readFileSync(HABIT_STATS_FILE, 'utf8'));
  }
} catch (e) {
  console.error('[DB] Error loading habit stats:', e.message);
  habitStats = {};
}

function saveReflections() {
  try {
    fs.writeFileSync(REFLECTIONS_FILE, JSON.stringify(reflections, null, 2), 'utf8');
  } catch (e) {
    console.error('[DB] Error saving reflections:', e.message);
  }
}

function saveHabitStats() {
  try {
    fs.writeFileSync(HABIT_STATS_FILE, JSON.stringify(habitStats, null, 2), 'utf8');
  } catch (e) {
    console.error('[DB] Error saving habit stats:', e.message);
  }
}

function addReflection(entry) {
  if (!entry.id) {
    entry.id = 'refl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  }
  if (!entry.createdAt) {
    entry.createdAt = new Date().toISOString();
  }
  
  // Remove existing entry for the same day if re-submitting today
  const entryDate = entry.createdAt.slice(0, 10);
  const existingIdx = reflections.findIndex(r => 
    String(r.userId) === String(entry.userId) && 
    (r.createdAt || '').slice(0, 10) === entryDate
  );

  if (existingIdx >= 0) {
    reflections[existingIdx] = { ...reflections[existingIdx], ...entry };
  } else {
    reflections.unshift(entry);
  }
  
  saveReflections();
  updateHabitStats(entry.userId, entry.patterns || entry.tags || [], entry.fairness);
  return entry;
}

function getReflections(userId) {
  if (!userId) return reflections;
  return reflections.filter(r => String(r.userId) === String(userId));
}

function getReflectionById(id) {
  return reflections.find(r => r.id === id);
}

function updateReflection(id, updates) {
  const idx = reflections.findIndex(r => r.id === id);
  if (idx >= 0) {
    reflections[idx] = { ...reflections[idx], ...updates };
    saveReflections();
    return reflections[idx];
  }
  return null;
}

function getUserStats(userId) {
  const uid = String(userId);
  if (!habitStats[uid]) {
    habitStats[uid] = {
      totalDays: 0,
      currentStreak: 0,
      bestStreak: 0,
      tags: {},
      fairnessScores: {
        clean: 0,
        mixed: 0,
        slack: 0
      }
    };
  }
  return habitStats[uid];
}

function updateHabitStats(userId, patterns = [], fairness = 'clean') {
  const stats = getUserStats(userId);
  
  // Calculate Streak
  const userEntries = getReflections(userId);
  stats.totalDays = userEntries.length;
  
  const dates = [...new Set(userEntries.map(e => (e.createdAt || '').slice(0, 10)))].sort();
  let streak = 0;
  
  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  
  const hasRecent = dates.includes(todayStr) || dates.includes(yesterday);
  if (hasRecent) {
    let curr = new Date(dates[dates.length - 1]);
    streak = 1;
    for (let i = dates.length - 2; i >= 0; i--) {
      const prev = new Date(dates[i]);
      const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        streak++;
        curr = prev;
      } else {
        break;
      }
    }
  } else {
    streak = 0;
  }
  
  stats.currentStreak = streak;
  if (streak > stats.bestStreak) stats.bestStreak = streak;

  // Track dynamic patterns with metadata
  patterns.forEach(item => {
    const tagId = typeof item === 'string' ? item : item.id;
    const tagName = typeof item === 'object' && item.name ? item.name : tagId;
    const tagIcon = typeof item === 'object' && item.icon ? item.icon : '⚡';
    const tagCategory = typeof item === 'object' && item.category ? item.category : 'Привычки';

    if (!stats.tags[tagId]) {
      stats.tags[tagId] = {
        id: tagId,
        name: tagName,
        icon: tagIcon,
        category: tagCategory,
        count: 0,
        firstSeen: todayStr,
        lastSeen: todayStr
      };
    }

    stats.tags[tagId].count = (stats.tags[tagId].count || 0) + 1;
    stats.tags[tagId].lastSeen = todayStr;
    if (typeof item === 'object' && item.name) {
      stats.tags[tagId].name = item.name;
    }
    if (typeof item === 'object' && item.icon) {
      stats.tags[tagId].icon = item.icon;
    }
  });

  // Track fairness
  if (fairness === 'clean' || fairness === 'fair') {
    stats.fairnessScores.clean = (stats.fairnessScores.clean || 0) + 1;
  } else if (fairness === 'mixed' || fairness === 'tense') {
    stats.fairnessScores.mixed = (stats.fairnessScores.mixed || 0) + 1;
  } else if (fairness === 'slack' || fairness === 'unfair') {
    stats.fairnessScores.slack = (stats.fairnessScores.slack || 0) + 1;
  }

  saveHabitStats();
  return stats;
}

module.exports = {
  addReflection,
  getReflections,
  getReflectionById,
  updateReflection,
  getUserStats,
  updateHabitStats
};
