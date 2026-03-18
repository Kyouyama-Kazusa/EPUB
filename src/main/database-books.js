const { getDb } = require('./database');

function getAllBooks(filters = {}) {
  const db = getDb();
  let sql = `
    SELECT b.*, GROUP_CONCAT(DISTINCT t.id || ':' || t.name) as tags,
           GROUP_CONCAT(DISTINCT f.id || ':' || f.name) as folders
    FROM books b
    LEFT JOIN book_tags bt ON b.id = bt.book_id
    LEFT JOIN tags t ON bt.tag_id = t.id
    LEFT JOIN book_folders bf ON b.id = bf.book_id
    LEFT JOIN folders f ON bf.folder_id = f.id
  `;
  
  const conditions = [];
  const params = [];
  
  if (filters.folderId) {
    conditions.push('b.id IN (SELECT book_id FROM book_folders WHERE folder_id = ?)');
    params.push(filters.folderId);
  }
  
  if (filters.tagId) {
    conditions.push('b.id IN (SELECT book_id FROM book_tags WHERE tag_id = ?)');
    params.push(filters.tagId);
  }
  
  if (filters.readStatus) {
    conditions.push('b.read_status = ?');
    params.push(filters.readStatus);
  }
  
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  
  sql += ' GROUP BY b.id ORDER BY b.updated_at DESC';
  
  const books = db.prepare(sql).all(...params);
  
  return books.map(book => ({
    ...book,
    tags: book.tags ? book.tags.split(',').map(t => {
      const [id, name] = t.split(':');
      return { id: parseInt(id), name };
    }) : [],
    folders: book.folders ? book.folders.split(',').map(f => {
      const [id, name] = f.split(':');
      return { id: parseInt(id), name };
    }) : []
  }));
}

function getBookById(id) {
  const db = getDb();
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
  
  if (!book) return null;
  
  const tags = db.prepare(`
    SELECT t.* FROM tags t
    JOIN book_tags bt ON t.id = bt.tag_id
    WHERE bt.book_id = ?
  `).all(id);
  
  const folders = db.prepare(`
    SELECT f.* FROM folders f
    JOIN book_folders bf ON f.id = bf.folder_id
    WHERE bf.book_id = ?
  `).all(id);
  
  return {
    ...book,
    tags,
    folders
  };
}

function addBook(bookData) {
  const db = getDb();
  const { title, author, publisher, description, cover_path, file_path, file_mode, read_status } = bookData;
  
  const result = db.prepare(`
    INSERT INTO books (title, author, publisher, description, cover_path, file_path, file_mode, read_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, author, publisher, description, cover_path, file_path, file_mode || 'reference', read_status || 'unread');
  
  return { id: result.lastInsertRowid, ...bookData };
}

function updateBook(id, bookData) {
  const db = getDb();
  const fields = [];
  const values = [];
  
  if (bookData.title !== undefined) {
    fields.push('title = ?');
    values.push(bookData.title);
  }
  if (bookData.author !== undefined) {
    fields.push('author = ?');
    values.push(bookData.author);
  }
  if (bookData.publisher !== undefined) {
    fields.push('publisher = ?');
    values.push(bookData.publisher);
  }
  if (bookData.description !== undefined) {
    fields.push('description = ?');
    values.push(bookData.description);
  }
  if (bookData.cover_path !== undefined) {
    fields.push('cover_path = ?');
    values.push(bookData.cover_path);
  }
  if (bookData.file_path !== undefined) {
    fields.push('file_path = ?');
    values.push(bookData.file_path);
  }
  if (bookData.file_mode !== undefined) {
    fields.push('file_mode = ?');
    values.push(bookData.file_mode);
  }
  if (bookData.read_status !== undefined) {
    fields.push('read_status = ?');
    values.push(bookData.read_status);
  }
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  db.prepare(`UPDATE books SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  
  return getBookById(id);
}

function deleteBook(id) {
  const db = getDb();
  db.prepare('DELETE FROM books WHERE id = ?').run(id);
}

function batchUpdateBooks(ids, bookData) {
  const db = getDb();
  const updateBookStmt = db.prepare(`
    UPDATE books SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `);
  
  const transaction = db.transaction((ids) => {
    for (const id of ids) {
      updateBook(id, bookData);
    }
  });
  
  transaction(ids);
}

function batchDeleteBooks(ids) {
  const db = getDb();
  const deleteBookStmt = db.prepare('DELETE FROM books WHERE id = ?');
  
  const transaction = db.transaction((ids) => {
    for (const id of ids) {
      deleteBookStmt.run(id);
    }
  });
  
  transaction(ids);
}

function searchBooks(query) {
  const db = getDb();
  const searchTerm = `%${query}%`;
  
  const books = db.prepare(`
    SELECT b.*, GROUP_CONCAT(DISTINCT t.id || ':' || t.name) as tags
    FROM books b
    LEFT JOIN book_tags bt ON b.id = bt.book_id
    LEFT JOIN tags t ON bt.tag_id = t.id
    WHERE b.title LIKE ? OR b.author LIKE ? OR b.publisher LIKE ?
    GROUP BY b.id
    ORDER BY b.updated_at DESC
  `).all(searchTerm, searchTerm, searchTerm);
  
  return books.map(book => ({
    ...book,
    tags: book.tags ? book.tags.split(',').map(t => {
      const [id, name] = t.split(':');
      return { id: parseInt(id), name };
    }) : []
  }));
}

function updateBookCover(bookId, coverPath) {
  const db = getDb();
  db.prepare(`
    UPDATE books SET cover_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(coverPath, bookId);
}

function exportBooks(bookIds, format) {
  const db = getDb();
  let books;
  
  if (bookIds && bookIds.length > 0) {
    const placeholders = bookIds.map(() => '?').join(',');
    books = db.prepare(`SELECT * FROM books WHERE id IN (${placeholders})`).all(...bookIds);
  } else {
    books = db.prepare('SELECT * FROM books').all();
  }
  
  if (format === 'json') {
    return JSON.stringify(books, null, 2);
  } else if (format === 'csv') {
    const headers = ['id', 'title', 'author', 'publisher', 'description', 'read_status', 'file_path'];
    const csvContent = [
      headers.join(','),
      ...books.map(b => headers.map(h => `"${(b[h] || '').toString().replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    return csvContent;
  }
  
  return books;
}

module.exports = {
  getAllBooks,
  getBookById,
  addBook,
  updateBook,
  deleteBook,
  batchUpdateBooks,
  batchDeleteBooks,
  searchBooks,
  updateBookCover,
  exportBooks
};
