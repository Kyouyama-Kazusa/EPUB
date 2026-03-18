const { getDb } = require('./database');

const DEFAULT_SETTINGS = {
  theme: 'light',
  defaultImportMode: 'copy',
  viewMode: 'grid'
};

function getSettings() {
  const db = getDb();
  let settings = {};
  
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    rows.forEach(row => {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    });
  } catch (error) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
  }
  
  return { ...DEFAULT_SETTINGS, ...settings };
}

function setSettings(settings) {
  const db = getDb();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  
  const upsertStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  
  const transaction = db.transaction((settings) => {
    Object.entries(settings).forEach(([key, value]) => {
      upsertStmt.run(key, JSON.stringify(value));
    });
  });
  
  transaction(settings);
}

module.exports = {
  getSettings,
  setSettings,
  DEFAULT_SETTINGS
};
