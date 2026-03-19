const https = require('https');
const http = require('http');

class LLMClient {
  constructor(config) {
    this.provider = config.provider || 'openai';
    this.model = config.model || 'gpt-4';
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || this.getDefaultBaseUrl();
    this.temperature = config.temperature || 0.3;
    this.maxTokens = config.maxTokens || 4096;
  }

  getDefaultBaseUrl() {
    switch (this.provider) {
      case 'openai':
        return 'https://api.openai.com/v1';
      case 'claude':
        return 'https://api.anthropic.com/v1';
      case 'local':
        return 'http://localhost:11434/v1';
      default:
        return 'https://api.openai.com/v1';
    }
  }

  async translate(text, sourceLang = 'English', targetLang = 'Chinese') {
    const prompt = this.buildPrompt(text, sourceLang, targetLang);
    
    switch (this.provider) {
      case 'openai':
        return this.callOpenAI(prompt);
      case 'claude':
        return this.callClaude(prompt);
      case 'local':
        return this.callLocal(prompt);
      default:
        throw new Error(`Unknown provider: ${this.provider}`);
    }
  }

  buildPrompt(text, sourceLang, targetLang) {
    return `Translate the following ${sourceLang} text to ${targetLang}. 
Only output the translated text, nothing else. Do not include quotes or explanations.

Text to translate:
${text}

${targetLang} translation:`;
  }

  async callOpenAI(prompt) {
    const body = JSON.stringify({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: this.temperature,
      max_tokens: this.maxTokens
    });

    const response = await this.makeRequest({
      hostname: new URL(this.baseUrl).hostname,
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body
    });

    const data = JSON.parse(response);
    const tokens = data.usage?.total_tokens || 0;
    const translatedText = data.choices[0]?.message?.content?.trim() || '';
    
    return { text: translatedText, tokens };
  }

  async callClaude(prompt) {
    const body = JSON.stringify({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: this.temperature,
      max_tokens: this.maxTokens
    });

    const response = await this.makeRequest({
      hostname: new URL(this.baseUrl).hostname,
      path: '/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body
    });

    const data = JSON.parse(response);
    const tokens = data.usage?.input_tokens + data.usage?.output_tokens || 0;
    const translatedText = data.content[0]?.text?.trim() || '';
    
    return { text: translatedText, tokens };
  }

  async callLocal(prompt) {
    const body = JSON.stringify({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: this.temperature,
      max_tokens: this.maxTokens
    });

    const response = await this.makeRequest({
      hostname: new URL(this.baseUrl).hostname,
      port: new URL(this.baseUrl).port || 11434,
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body
    });

    const data = JSON.parse(response);
    const tokens = data.usage?.total_tokens || 0;
    const translatedText = data.choices[0]?.message?.content?.trim() || '';
    
    return { text: translatedText, tokens };
  }

  makeRequest(options) {
    return new Promise((resolve, reject) => {
      const url = new URL(options.path, options.hostname);
      const protocol = url.protocol === 'https:' ? https : http;
      
      const req = protocol.request({
        hostname: options.hostname,
        port: options.port,
        path: options.path,
        method: options.method,
        headers: options.headers
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(options.body);
      req.end();
    });
  }

  async batchTranslate(texts, sourceLang = 'English', targetLang = 'Chinese') {
    const results = [];
    let totalTokens = 0;

    for (const text of texts) {
      if (text.trim().length === 0) {
        results.push({ original: text, translated: '', tokens: 0 });
        continue;
      }

      try {
        const result = await this.translate(text, sourceLang, targetLang);
        results.push({
          original: text,
          translated: result.text,
          tokens: result.tokens
        });
        totalTokens += result.tokens;
      } catch (error) {
        results.push({
          original: text,
          translated: '',
          tokens: 0,
          error: error.message
        });
      }
    }

    return { results, totalTokens };
  }

  estimateCost(tokenCount) {
    const pricing = {
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
      'claude-3-opus': { input: 0.015, output: 0.075 },
      'claude-3-sonnet': { input: 0.003, output: 0.015 },
      'claude-3-haiku': { input: 0.00025, output: 0.00125 }
    };

    const modelPricing = pricing[this.model] || pricing['gpt-3.5-turbo'];
    const avgCost = (modelPricing.input + modelPricing.output) / 2;
    return tokenCount * avgCost / 1000;
  }
}

module.exports = LLMClient;
