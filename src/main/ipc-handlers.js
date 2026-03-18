const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const bookDb = require('./database-books');
const folderDb = require('./database-folders');
const tagDb = require('./database-tags');
const settingsDb = require('./database-settings');
const { parseEpub, validateEpub } = require('./epub-parser');
const fileManager = require('./file-manager');

function registerIpcHandlers() {
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'EPUB Files', extensions: ['epub'] }]
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('books:getAll', async (event, filters) => {
    return bookDb.getAllBooks(filters || {});
  });

  ipcMain.handle('books:get', async (event, id) => {
    return bookDb.getBookById(id);
  });

  ipcMain.handle('books:add', async (event, bookData) => {
    return bookDb.addBook(bookData);
  });

  ipcMain.handle('books:update', async (event, id, bookData) => {
    return bookDb.updateBook(id, bookData);
  });

  ipcMain.handle('books:delete', async (event, id) => {
    const book = bookDb.getBookById(id);
    if (book) {
      await fileManager.deleteBookFile(book.file_path, book.file_mode);
      await fileManager.deleteCover(book.cover_path);
    }
    bookDb.deleteBook(id);
    return true;
  });

  ipcMain.handle('books:batchUpdate', async (event, ids, bookData) => {
    bookDb.batchUpdateBooks(ids, bookData);
    return true;
  });

  ipcMain.handle('books:batchDelete', async (event, ids) => {
    for (const id of ids) {
      const book = bookDb.getBookById(id);
      if (book) {
        await fileManager.deleteBookFile(book.file_path, book.file_mode);
        await fileManager.deleteCover(book.cover_path);
      }
    }
    bookDb.batchDeleteBooks(ids);
    return true;
  });

  ipcMain.handle('books:search', async (event, query) => {
    return bookDb.searchBooks(query);
  });

  ipcMain.handle('books:updateCover', async (event, bookId, coverPath) => {
    const destPath = await fileManager.saveCoverFromFile(bookId, coverPath);
    bookDb.updateBookCover(bookId, destPath);
    return destPath;
  });

  ipcMain.handle('books:export', async (event, bookIds, format) => {
    return bookDb.exportBooks(bookIds, format);
  });

  ipcMain.handle('folders:getAll', async () => {
    return folderDb.getAllFolders();
  });

  ipcMain.handle('folders:add', async (event, name, parentId) => {
    return folderDb.addFolder(name, parentId);
  });

  ipcMain.handle('folders:update', async (event, id, name) => {
    return folderDb.updateFolder(id, name);
  });

  ipcMain.handle('folders:delete', async (event, id) => {
    folderDb.deleteFolder(id);
    return true;
  });

  ipcMain.handle('folders:moveBook', async (event, bookId, folderId) => {
    folderDb.moveBookToFolder(bookId, folderId);
    return true;
  });

  ipcMain.handle('tags:getAll', async () => {
    return tagDb.getAllTags();
  });

  ipcMain.handle('tags:add', async (event, name) => {
    return tagDb.addTag(name);
  });

  ipcMain.handle('tags:delete', async (event, id) => {
    tagDb.deleteTag(id);
    return true;
  });

  ipcMain.handle('tags:addToBooks', async (event, tagId, bookIds) => {
    tagDb.addTagToBooks(tagId, bookIds);
    return true;
  });

  ipcMain.handle('tags:removeFromBooks', async (event, tagId, bookIds) => {
    tagDb.removeTagFromBooks(tagId, bookIds);
    return true;
  });

  ipcMain.handle('epub:import', async (event, filePath, fileMode) => {
    try {
      const isValid = await validateEpub(filePath);
      if (!isValid) {
        throw new Error('无效的 epub 文件');
      }

      const metadata = await parseEpub(filePath);

      let storedFilePath = filePath;
      if (fileMode === 'copy') {
        storedFilePath = await fileManager.copyBookToDataDir(filePath);
      }

      let coverPath = null;
      if (metadata.coverData) {
        const bookData = bookDb.addBook({
          title: metadata.title,
          author: metadata.author,
          publisher: metadata.publisher,
          description: metadata.description,
          cover_path: null,
          file_path: storedFilePath,
          file_mode: fileMode
        });
        
        coverPath = await fileManager.saveCoverFromBase64(bookData.id, metadata.coverData);
        bookDb.updateBook(bookData.id, { cover_path: coverPath });
        
        return bookDb.getBookById(bookData.id);
      }

      return bookDb.addBook({
        title: metadata.title,
        author: metadata.author,
        publisher: metadata.publisher,
        description: metadata.description,
        cover_path: null,
        file_path: storedFilePath,
        file_mode: fileMode
      });
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('epub:batchImport', async (event, filePaths, fileMode) => {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const filePath of filePaths) {
      try {
        const isValid = await validateEpub(filePath);
        if (!isValid) {
          throw new Error('无效的 epub 文件');
        }

        const metadata = await parseEpub(filePath);

        let storedFilePath = filePath;
        if (fileMode === 'copy') {
          storedFilePath = await fileManager.copyBookToDataDir(filePath);
        }

        let book;
        if (metadata.coverData) {
          book = bookDb.addBook({
            title: metadata.title,
            author: metadata.author,
            publisher: metadata.publisher,
            description: metadata.description,
            cover_path: null,
            file_path: storedFilePath,
            file_mode: fileMode
          });
          
          const coverPath = await fileManager.saveCoverFromBase64(book.id, metadata.coverData);
          bookDb.updateBook(book.id, { cover_path: coverPath });
        } else {
          book = bookDb.addBook({
            title: metadata.title,
            author: metadata.author,
            publisher: metadata.publisher,
            description: metadata.description,
            cover_path: null,
            file_path: storedFilePath,
            file_mode: fileMode
          });
        }
        
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          file: path.basename(filePath),
          message: error.message
        });
      }
    }

    return results;
  });

  ipcMain.handle('settings:get', async () => {
    return settingsDb.getSettings();
  });

  ipcMain.handle('settings:set', async (event, settings) => {
    settingsDb.setSettings(settings);
    return true;
  });

  ipcMain.handle('metadata:fetchOnline', async (event, title, author) => {
    try {
      const response = await fetch(
        `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}${author ? `&author=${encodeURIComponent(author)}` : ''}&limit=1`
      );
      const data = await response.json();
      
      if (data.docs && data.docs.length > 0) {
        const doc = data.docs[0];
        return {
          title: doc.title,
          author: doc.author_name ? doc.author_name[0] : author,
          publisher: doc.publisher ? doc.publisher[0] : null,
          description: doc.first_sentence ? doc.first_sentence[0] : null
        };
      }
      
      return null;
    } catch (error) {
      console.error('Failed to fetch online metadata:', error);
      return null;
    }
  });
}

module.exports = {
  registerIpcHandlers
};
