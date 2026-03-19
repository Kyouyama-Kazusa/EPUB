const { getDb } = require('../database');

function createTask(bookId, config) {
  const db = getDb();
  
  const result = db.prepare(`
    INSERT INTO translation_tasks (book_id, provider, model, status)
    VALUES (?, ?, ?, 'pending')
  `).run(bookId, config.provider, config.model);
  
  return { id: result.lastInsertRowid, bookId, status: 'pending' };
}

function updateTaskProgress(taskId, translatedParagraphs, totalTokens) {
  const db = getDb();
  
  db.prepare(`
    UPDATE translation_tasks 
    SET translated_paragraphs = ?, total_tokens = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(translatedParagraphs, totalTokens, taskId);
}

function updateTaskStatus(taskId, status) {
  const db = getDb();
  
  db.prepare(`
    UPDATE translation_tasks 
    SET status = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, status === 'completed' ? 'CURRENT_TIMESTAMP' : null, taskId);
}

function updateTaskTotals(taskId, totalParagraphs) {
  const db = getDb();
  
  db.prepare(`
    UPDATE translation_tasks 
    SET total_paragraphs = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(totalParagraphs, taskId);
}

function getTask(taskId) {
  const db = getDb();
  return db.prepare('SELECT * FROM translation_tasks WHERE id = ?').get(taskId);
}

function getTaskByBookId(bookId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM translation_tasks 
    WHERE book_id = ? AND status IN ('pending', 'translating', 'paused')
    ORDER BY created_at DESC LIMIT 1
  `).get(bookId);
}

function getAllTasks() {
  const db = getDb();
  return db.prepare('SELECT * FROM translation_tasks ORDER BY created_at DESC').all();
}

function deleteTask(taskId) {
  const db = getDb();
  db.prepare('DELETE FROM translation_results WHERE task_id = ?').run(taskId);
  db.prepare('DELETE FROM translation_tasks WHERE id = ?').run(taskId);
}

function saveTranslationResult(taskId, paragraphIndex, originalText, translatedText, tokensUsed) {
  const db = getDb();
  
  db.prepare(`
    INSERT INTO translation_results (task_id, paragraph_index, original_text, translated_text, tokens_used)
    VALUES (?, ?, ?, ?, ?)
  `).run(taskId, paragraphIndex, originalText, translatedText, tokensUsed);
}

function getTranslationResults(taskId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM translation_results 
    WHERE task_id = ? 
    ORDER BY paragraph_index ASC
  `).all(taskId);
}

function getLastTranslatedIndex(taskId) {
  const db = getDb();
  const result = db.prepare(`
    SELECT MAX(paragraph_index) as last_index 
    FROM translation_results 
    WHERE task_id = ? AND translated_text IS NOT NULL AND translated_text != ''
  `).get(taskId);
  
  return result?.last_index ?? -1;
}

function calculateProgress(taskId) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM translation_tasks WHERE id = ?').get(taskId);
  const results = db.prepare(`
    SELECT COUNT(*) as count 
    FROM translation_results 
    WHERE task_id = ? AND translated_text IS NOT NULL AND translated_text != ''
  `).get(taskId);
  
  if (!task || task.total_paragraphs === 0) {
    return { progress: 0, translated: 0, total: 0 };
  }
  
  const translated = results?.count || 0;
  const progress = (translated / task.total_paragraphs) * 100;
  
  return {
    progress,
    translated,
    total: task.total_paragraphs,
    tokens: task.total_tokens
  };
}

function cleanupFailedTasks() {
  const db = getDb();
  const failedTasks = db.prepare(`
    SELECT id FROM translation_tasks 
    WHERE status = 'failed' 
    AND updated_at < datetime('now', '-1 day')
  `).all();
  
  for (const task of failedTasks) {
    deleteTask(task.id);
  }
  
  return failedTasks.length;
}

module.exports = {
  createTask,
  updateTaskProgress,
  updateTaskStatus,
  updateTaskTotals,
  getTask,
  getTaskByBookId,
  getAllTasks,
  deleteTask,
  saveTranslationResult,
  getTranslationResults,
  getLastTranslatedIndex,
  calculateProgress,
  cleanupFailedTasks
};
