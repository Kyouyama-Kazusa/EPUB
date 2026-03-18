const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  
  getBooks: (filters) => ipcRenderer.invoke('books:getAll', filters),
  getBook: (id) => ipcRenderer.invoke('books:get', id),
  addBook: (bookData) => ipcRenderer.invoke('books:add', bookData),
  updateBook: (id, bookData) => ipcRenderer.invoke('books:update', id, bookData),
  deleteBook: (id) => ipcRenderer.invoke('books:delete', id),
  batchUpdateBooks: (ids, bookData) => ipcRenderer.invoke('books:batchUpdate', ids, bookData),
  batchDeleteBooks: (ids) => ipcRenderer.invoke('books:batchDelete', ids),
  
  importEpub: (filePath, fileMode) => ipcRenderer.invoke('epub:import', filePath, fileMode),
  batchImportEpubs: (filePaths, fileMode) => ipcRenderer.invoke('epub:batchImport', filePaths, fileMode),
  
  getFolders: () => ipcRenderer.invoke('folders:getAll'),
  addFolder: (name, parentId) => ipcRenderer.invoke('folders:add', name, parentId),
  updateFolder: (id, name) => ipcRenderer.invoke('folders:update', id, name),
  deleteFolder: (id) => ipcRenderer.invoke('folders:delete', id),
  moveBookToFolder: (bookId, folderId) => ipcRenderer.invoke('folders:moveBook', bookId, folderId),
  
  getTags: () => ipcRenderer.invoke('tags:getAll'),
  addTag: (name) => ipcRenderer.invoke('tags:add', name),
  deleteTag: (id) => ipcRenderer.invoke('tags:delete', id),
  addTagToBooks: (tagId, bookIds) => ipcRenderer.invoke('tags:addToBooks', tagId, bookIds),
  removeTagFromBooks: (tagId, bookIds) => ipcRenderer.invoke('tags:removeFromBooks', tagId, bookIds),
  
  searchBooks: (query) => ipcRenderer.invoke('books:search', query),
  updateBookCover: (bookId, coverPath) => ipcRenderer.invoke('books:updateCover', bookId, coverPath),
  
  exportBooks: (bookIds, format) => ipcRenderer.invoke('books:export', bookIds, format),
  
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  
  fetchOnlineMetadata: (title, author) => ipcRenderer.invoke('metadata:fetchOnline', title, author)
});
