const { getDb } = require('../database');

const DEFAULT_CONFIG = {
  provider: 'openai',
  model: 'gpt-4',
  apiKey: '',
  baseUrl: '',
  temperature: 0.3,
  maxTokens: 4096
};

function getTranslationConfig() {
  const db = getDb();
  
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('translation_config');
    if (row) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(row.value) };
    }
  } catch (error) {
    console.error('Failed to get translation config:', error);
  }
  
  return DEFAULT_CONFIG;
}

function setTranslationConfig(config) {
  const db = getDb();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    'translation_config',
    JSON.stringify(config)
  );
}

function getAvailableModels(provider) {
  const models = {
    openai: [
      { id: 'gpt-4', name: 'GPT-4' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
    ],
    claude: [
      { id: 'claude-3-opus', name: 'Claude 3 Opus' },
      { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet' },
      { id: 'claude-3-haiku', name: 'Claude 3 Haiku' }
    ],
    local: [
      { id: 'llama2', name: 'LLaMA 2' },
      { id: 'mistral', name: 'Mistral' },
      { id: 'mixtral', name: 'Mixtral' },
      { id: 'codellama', name: 'Code LLaMA' }
    ]
  };
  
  return models[provider] || models.openai;
}

function validateConfig(config) {
  const errors = [];
  
  if (!config.apiKey || config.apiKey.trim().length === 0) {
    errors.push('API Key is required');
  }
  
  if (!config.model) {
    errors.push('Model is required');
  }
  
  if (config.temperature < 0 || config.temperature > 2) {
    errors.push('Temperature must be between 0 and 2');
  }
  
  if (config.maxTokens < 1 || config.maxTokens > 100000) {
    errors.push('Max Tokens must be between 1 and 100000');
  }
  
  if (config.provider === 'local' && !config.baseUrl) {
    errors.push('Base URL is required for local models');
  }
  
  return errors;
}

module.exports = {
  getTranslationConfig,
  setTranslationConfig,
  getAvailableModels,
  validateConfig,
  DEFAULT_CONFIG
};
