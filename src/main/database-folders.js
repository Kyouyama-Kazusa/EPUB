const { getDb } = require('./database');

function getAllFolders() {
  const db = getDb();
  const folders = db.prepare('SELECT * FROM folders ORDER BY name').all();
  
  const folderMap = new Map();
  const rootFolders = [];
  
  folders.forEach(folder => {
    folder.children = [];
    folderMap.set(folder.id, folder);
  });
  
  folders.forEach(folder => {
    if (folder.parent_id === null) {
      rootFolders.push(folder);
    } else {
      const parent = folderMap.get(folder.parent_id);
      if (parent) {
        parent.children.push(folder);
      }
    }
  });
  
  return rootFolders;
}

function getFolderById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM folders WHERE id = ?').get(id);
}

function addFolder(name, parentId = null) {
  const db = getDb();
  const result = db.prepare('INSERT INTO folders (name, parent_id) VALUES (?, ?)').run(name, parentId);
  return { id: result.lastInsertRowid, name, parent_id: parentId };
}

function updateFolder(id, name) {
  const db = getDb();
  db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, id);
  return getFolderById(id);
}

function deleteFolder(id) {
  const db = getDb();
  db.prepare('DELETE FROM folders WHERE id = ?').run(id);
}

function moveBookToFolder(bookId, folderId) {
  const db = getDb();
  
  if (folderId === null) {
    db.prepare('DELETE FROM book_folders WHERE book_id = ?').run(bookId);
  } else {
    db.prepare(`
      INSERT OR REPLACE INTO book_folders (book_id, folder_id) VALUES (?, ?)
    `).run(bookId, folderId);
  }
}

function getBookCountByFolder(folderId) {
  const db = getDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM book_folders WHERE folder_id = ?').get(folderId);
  return result.count;
}

module.exports = {
  getAllFolders,
  getFolderById,
  addFolder,
  updateFolder,
  deleteFolder,
  moveBookToFolder,
  getBookCountByFolder
};
