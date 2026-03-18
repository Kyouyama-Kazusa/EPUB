const { getDb } = require('./database');

function getAllTags() {
  const db = getDb();
  const tags = db.prepare('SELECT * FROM tags ORDER BY name').all();
  
  const tagsWithCount = tags.map(tag => {
    const result = db.prepare('SELECT COUNT(*) as count FROM book_tags WHERE tag_id = ?').get(tag.id);
    return { ...tag, count: result.count };
  });
  
  return tagsWithCount;
}

function getTagById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
}

function addTag(name) {
  const db = getDb();
  const result = db.prepare('INSERT INTO tags (name) VALUES (?)').run(name);
  return { id: result.lastInsertRowid, name };
}

function deleteTag(id) {
  const db = getDb();
  db.prepare('DELETE FROM tags WHERE id = ?').run(id);
}

function addTagToBooks(tagId, bookIds) {
  const db = getDb();
  const insertStmt = db.prepare('INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)');
  
  const transaction = db.transaction((bookIds) => {
    for (const bookId of bookIds) {
      insertStmt.run(bookId, tagId);
    }
  });
  
  transaction(bookIds);
}

function removeTagFromBooks(tagId, bookIds) {
  const db = getDb();
  const deleteStmt = db.prepare('DELETE FROM book_tags WHERE tag_id = ? AND book_id = ?');
  
  const transaction = db.transaction((bookIds) => {
    for (const bookId of bookIds) {
      deleteStmt.run(tagId, bookId);
    }
  });
  
  transaction(bookIds);
}

function getTagsByBookId(bookId) {
  const db = getDb();
  return db.prepare(`
    SELECT t.* FROM tags t
    JOIN book_tags bt ON t.id = bt.tag_id
    WHERE bt.book_id = ?
  `).all(bookId);
}

module.exports = {
  getAllTags,
  getTagById,
  addTag,
  deleteTag,
  addTagToBooks,
  removeTagFromBooks,
  getTagsByBookId
};
