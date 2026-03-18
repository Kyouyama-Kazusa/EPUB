const app = Vue.createApp({
  data() {
    return {
      books: [],
      folders: [],
      tags: [],
      selectedBook: null,
      selectedBooks: [],
      currentView: 'grid',
      searchQuery: '',
      statusFilters: [],
      folderFilter: null,
      tagFilters: [],
      editingBook: null,
      isEditModalOpen: false,
      isImportModalOpen: false,
      importMode: 'copy',
      theme: 'light'
    };
  },
  computed: {
    filteredBooks() {
      let result = this.books;
      
      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        result = result.filter(book => 
          book.title.toLowerCase().includes(query) ||
          (book.author && book.author.toLowerCase().includes(query)) ||
          (book.publisher && book.publisher.toLowerCase().includes(query))
        );
      }
      
      if (this.statusFilters.length > 0) {
        result = result.filter(book => this.statusFilters.includes(book.read_status));
      }
      
      if (this.tagFilters.length > 0) {
        result = result.filter(book => 
          book.tags && book.tags.some(tag => this.tagFilters.includes(tag.id))
        );
      }
      
      return result;
    }
  },
  watch: {
    filteredBooks() {
      this.$nextTick(() => this.renderBookList());
    },
    books() {
      this.$nextTick(() => this.renderBookList());
    },
    folders() {
      this.$nextTick(() => this.renderFolderTree());
    },
    tags() {
      this.$nextTick(() => this.renderTagList());
    }
  },
  async mounted() {
    const settings = await window.electronAPI.getSettings();
    if (settings.theme === 'dark') {
      this.theme = 'dark';
      document.body.classList.add('dark-theme');
      document.querySelector('.btn-theme').textContent = '☀️';
    }
    await this.loadFolders();
    await this.loadTags();
    await this.loadBooks();
    this.updateStatusCounts();
  },
  methods: {
    async loadBooks() {
      try {
        const filters = {};
        if (this.folderFilter) filters.folderId = this.folderFilter;
        this.books = await window.electronAPI.getBooks(filters);
      } catch (error) {
        console.error('Failed to load books:', error);
        this.showToast('加载书籍失败', 'error');
      }
    },
    async loadFolders() {
      try {
        this.folders = await window.electronAPI.getFolders();
      } catch (error) {
        console.error('Failed to load folders:', error);
      }
    },
    async loadTags() {
      try {
        this.tags = await window.electronAPI.getTags();
      } catch (error) {
        console.error('Failed to load tags:', error);
      }
    },
    updateStatusCounts() {
      const counts = { unread: 0, reading: 0, read: 0 };
      this.books.forEach(book => {
        if (counts[book.read_status] !== undefined) {
          counts[book.read_status]++;
        }
      });
      document.getElementById('count-unread').textContent = counts.unread;
      document.getElementById('count-reading').textContent = counts.reading;
      document.getElementById('count-read').textContent = counts.read;
    },
    selectBook(book, event) {
      if (event && event.ctrlKey) {
        const index = this.selectedBooks.indexOf(book.id);
        if (index > -1) {
          this.selectedBooks.splice(index, 1);
        } else {
          this.selectedBooks.push(book.id);
        }
      } else if (event && event.shiftKey && this.selectedBooks.length > 0) {
        const lastSelected = this.selectedBooks[this.selectedBooks.length - 1];
        const lastIndex = this.books.findIndex(b => b.id === lastSelected);
        const currentIndex = this.books.findIndex(b => b.id === book.id);
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        for (let i = start; i <= end; i++) {
          if (!this.selectedBooks.includes(this.books[i].id)) {
            this.selectedBooks.push(this.books[i].id);
          }
        }
      } else {
        this.selectedBooks = [book.id];
      }
      
      this.selectedBook = book;
      this.openDetailPanel();
      this.updateBatchButtons();
    },
    openDetailPanel() {
      document.getElementById('detail-panel').classList.add('open');
      this.updateDetailPanel();
    },
    closeDetail() {
      document.getElementById('detail-panel').classList.remove('open');
      this.selectedBook = null;
    },
    updateDetailPanel() {
      if (!this.selectedBook) return;
      
      const book = this.selectedBook;
      document.getElementById('detail-cover-img').src = book.cover_path || '';
      document.getElementById('detail-title').textContent = book.title;
      document.getElementById('detail-author').textContent = book.author || '未知';
      document.getElementById('detail-publisher').textContent = book.publisher || '未知';
      document.getElementById('detail-description').textContent = book.description || '暂无描述';
      document.getElementById('detail-status').value = book.read_status;
      
      const tagsContainer = document.getElementById('detail-tags');
      tagsContainer.innerHTML = '';
      if (book.tags) {
        book.tags.forEach(tag => {
          const tagEl = document.createElement('span');
          tagEl.className = 'tag';
          tagEl.textContent = tag.name;
          tagsContainer.appendChild(tagEl);
        });
      }
    },
    async updateBookStatus() {
      if (!this.selectedBook) return;
      const status = document.getElementById('detail-status').value;
      try {
        await window.electronAPI.updateBook(this.selectedBook.id, { read_status: status });
        this.selectedBook.read_status = status;
        this.updateStatusCounts();
        this.showToast('状态已更新');
      } catch (error) {
        console.error('Failed to update status:', error);
        this.showToast('更新失败', 'error');
      }
    },
    editBook() {
      this.editingBook = { ...this.selectedBook };
      this.openEditModal();
    },
    async saveBook() {
      if (!this.editingBook) return;
      
      try {
        const bookData = {
          title: document.getElementById('edit-title').value,
          author: document.getElementById('edit-author').value,
          publisher: document.getElementById('edit-publisher').value,
          description: document.getElementById('edit-description').value
        };
        
        const selectedTags = Array.from(document.querySelectorAll('#edit-tags input:checked'))
          .map(input => parseInt(input.value));
        
        await window.electronAPI.updateBook(this.editingBook.id, bookData);
        
        if (selectedTags.length > 0) {
          await window.electronAPI.tags.addToBooks(selectedTags[0], [this.editingBook.id]);
        }
        
        await this.loadBooks();
        this.closeEditModal();
        this.showToast('保存成功');
      } catch (error) {
        console.error('Failed to save book:', error);
        this.showToast('保存失败', 'error');
      }
    },
    async deleteBook() {
      if (!this.selectedBook) return;
      if (!confirm('确定要删除这本书吗？')) return;
      
      try {
        await window.electronAPI.deleteBook(this.selectedBook.id);
        await this.loadBooks();
        this.closeDetail();
        this.showToast('删除成功');
      } catch (error) {
        console.error('Failed to delete book:', error);
        this.showToast('删除失败', 'error');
      }
    },
    async openBookFile() {
      if (!this.selectedBook) return;
      const { shell } = require('electron');
      shell.openPath(this.selectedBook.file_path);
    },
    updateBatchButtons() {
      const hasSelection = this.selectedBooks.length > 0;
      document.getElementById('btn-batch-edit').disabled = !hasSelection;
      document.getElementById('btn-batch-delete').disabled = !hasSelection;
    },
    async batchEdit() {
      if (this.selectedBooks.length === 0) return;
      this.editingBook = { id: 'batch', ids: [...this.selectedBooks] };
      this.openEditModal();
    },
    async batchDelete() {
      if (this.selectedBooks.length === 0) return;
      if (!confirm(`确定要删除选中的 ${this.selectedBooks.length} 本书吗？`)) return;
      
      try {
        await window.electronAPI.batchDeleteBooks(this.selectedBooks);
        this.selectedBooks = [];
        this.updateBatchButtons();
        await this.loadBooks();
        this.closeDetail();
        this.showToast('删除成功');
      } catch (error) {
        console.error('Failed to batch delete:', error);
        this.showToast('删除失败', 'error');
      }
    },
    openEditModal() {
      document.getElementById('edit-modal').classList.add('open');
      document.getElementById('edit-modal-title').textContent = 
        this.editingBook.id === 'batch' ? '批量编辑' : '编辑书籍';
      
      if (this.editingBook.id !== 'batch') {
        document.getElementById('edit-title').value = this.editingBook.title || '';
        document.getElementById('edit-author').value = this.editingBook.author || '';
        document.getElementById('edit-publisher').value = this.editingBook.publisher || '';
        document.getElementById('edit-description').value = this.editingBook.description || '';
      } else {
        document.getElementById('edit-title').value = '';
        document.getElementById('edit-author').value = '';
        document.getElementById('edit-publisher').value = '';
        document.getElementById('edit-description').value = '';
      }
      
      this.renderTagSelector();
    },
    closeEditModal() {
      document.getElementById('edit-modal').classList.remove('open');
      this.editingBook = null;
    },
    renderTagSelector() {
      const container = document.getElementById('edit-tags');
      container.innerHTML = '';
      this.tags.forEach(tag => {
        const label = document.createElement('label');
        const checked = this.editingBook && this.editingBook.tags && 
          this.editingBook.tags.some(t => t.id === tag.id);
        label.innerHTML = `<input type="checkbox" value="${tag.id}" ${checked ? 'checked' : ''}> <span>${tag.name}</span>`;
        container.appendChild(label);
      });
    },
    async importBooks() {
      this.importMode = 'copy';
      document.getElementById('import-modal').classList.add('open');
      document.getElementById('import-result').style.display = 'none';
    },
    closeImportModal() {
      document.getElementById('import-modal').classList.remove('open');
    },
    async selectFilesToImport() {
      try {
        const filePaths = await window.electronAPI.openFileDialog();
        if (!filePaths || filePaths.length === 0) return;
        
        const mode = document.querySelector('input[name="import-mode"]:checked').value;
        const result = await window.electronAPI.batchImportEpubs(filePaths, mode);
        
        document.getElementById('import-result').style.display = 'block';
        document.getElementById('import-count').textContent = 
          `成功导入 ${result.success} 本书，失败 ${result.failed} 本`;
        
        if (result.failed > 0) {
          const list = document.getElementById('import-list');
          list.innerHTML = result.errors.map(e => `<p style="color:red;">${e.message}</p>`).join('');
        }
        
        await this.loadBooks();
        this.updateStatusCounts();
      } catch (error) {
        console.error('Failed to import:', error);
        this.showToast('导入失败', 'error');
      }
    },
    searchBooks() {
      this.searchQuery = document.getElementById('search-input').value;
    },
    filterByStatus() {
      const checkboxes = document.querySelectorAll('#status-content input[type="checkbox"]:checked');
      this.statusFilters = Array.from(checkboxes).map(cb => cb.value);
      this.loadBooks();
    },
    toggleView() {
      const view = document.getElementById('view-select').value;
      const list = document.getElementById('book-list');
      list.className = 'book-list ' + view + '-view';
      this.currentView = view;
    },
    async addFolder() {
      const name = prompt('请输入文件夹名称：');
      if (!name) return;
      
      try {
        await window.electronAPI.addFolder(name, this.folderFilter);
        await this.loadFolders();
        this.showToast('文件夹已创建');
      } catch (error) {
        console.error('Failed to add folder:', error);
        this.showToast('创建失败', 'error');
      }
    },
    async addTag() {
      const name = prompt('请输入标签名称：');
      if (!name) return;
      
      try {
        await window.electronAPI.addTag(name);
        await this.loadTags();
        this.showToast('标签已创建');
      } catch (error) {
        console.error('Failed to add tag:', error);
        this.showToast('创建失败', 'error');
      }
    },
    async updateBookCover() {
      if (!this.selectedBook) return;
      
      try {
        const filePath = await window.electronAPI.openFileDialog();
        if (!filePath || filePath.length === 0) return;
        
        await window.electronAPI.updateBookCover(this.selectedBook.id, filePath[0]);
        await this.loadBooks();
        this.selectedBook = this.books.find(b => b.id === this.selectedBook.id);
        this.updateDetailPanel();
        this.showToast('封面已更新');
      } catch (error) {
        console.error('Failed to update cover:', error);
        this.showToast('更新失败', 'error');
      }
    },
    showToast(message, type = 'info') {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast show ' + type;
      setTimeout(() => {
        toast.className = 'toast';
      }, 3000);
    },
    toggleTheme() {
      this.theme = this.theme === 'light' ? 'dark' : 'light';
      if (this.theme === 'dark') {
        document.body.classList.add('dark-theme');
        document.querySelector('.btn-theme').textContent = '☀️';
      } else {
        document.body.classList.remove('dark-theme');
        document.querySelector('.btn-theme').textContent = '🌙';
      }
      window.electronAPI.setSettings({ theme: this.theme });
    },
    showExportMenu() {
      const format = prompt('请输入导出格式 (json/csv)：', 'json');
      if (!format || !['json', 'csv'].includes(format.toLowerCase())) {
        if (format) this.showToast('无效的导出格式', 'error');
        return;
      }
      this.exportBooks(format.toLowerCase());
    },
    async exportBooks(format) {
      try {
        const bookIds = this.selectedBooks.length > 0 ? this.selectedBooks : null;
        const result = await window.electronAPI.exportBooks(bookIds, format);
        if (result.success) {
          this.showToast(`导出成功: ${result.filePath}`, 'success');
        } else {
          this.showToast(result.message || '导出失败', 'error');
        }
      } catch (error) {
        console.error('Export failed:', error);
        this.showToast('导出失败', 'error');
      }
    },
    toggleSection(section) {
      const content = document.getElementById(section + '-content');
      const toggle = document.getElementById(section + '-toggle');
      if (content.style.display === 'none') {
        content.style.display = 'block';
        toggle.textContent = '▼';
      } else {
        content.style.display = 'none';
        toggle.textContent = '▶';
      }
    },
    renderFolderTree() {
      const container = document.getElementById('folder-tree');
      if (!container) return;
      
      const renderNode = (folder, level = 0) => {
        const paddingLeft = level * 12 + 8;
        let html = `
          <div class="folder-item ${this.folderFilter === folder.id ? 'active' : ''}" 
               style="padding-left:${paddingLeft}px"
               onclick="vue.filterByFolder(${folder.id})">
            <span>${folder.name}</span>
          </div>
        `;
        
        if (folder.children && folder.children.length > 0) {
          folder.children.forEach(child => {
            html += renderNode(child, level + 1);
          });
        }
        
        return html;
      };
      
      container.innerHTML = this.folders.map(f => renderNode(f)).join('');
    },
    renderTagList() {
      const container = document.getElementById('tag-list');
      if (!container) return;
      
      container.innerHTML = this.tags.map(tag => `
        <div class="tag-item ${this.tagFilters.includes(tag.id) ? 'active' : ''}" 
             onclick="vue.toggleTagFilter(${tag.id})">
          <span>${tag.name}</span>
          <span class="count">${tag.count || 0}</span>
        </div>
      `).join('');
    },
    filterByFolder(folderId) {
      this.folderFilter = this.folderFilter === folderId ? null : folderId;
      this.loadBooks();
      this.renderFolderTree();
    },
    toggleTagFilter(tagId) {
      const index = this.tagFilters.indexOf(tagId);
      if (index > -1) {
        this.tagFilters.splice(index, 1);
      } else {
        this.tagFilters.push(tagId);
      }
      this.loadBooks();
      this.renderTagList();
    },
    renderBookList() {
      const list = document.getElementById('book-list');
      const emptyState = document.getElementById('empty-state');
      
      if (this.filteredBooks.length === 0) {
        list.innerHTML = '';
        emptyState.style.display = 'block';
        return;
      }
      
      emptyState.style.display = 'none';
      list.innerHTML = this.filteredBooks.map(book => `
        <div class="book-item ${this.selectedBooks.includes(book.id) ? 'selected' : ''}" 
             onclick="vue.selectBook(vue.books.find(b => b.id === ${book.id}), event)"
             oncontextmenu="vue.showContextMenu(event, ${book.id})">
          <div class="book-cover">
            ${book.cover_path ? 
              `<img src="${book.cover_path}" alt="${book.title}">` : 
              '<span class="placeholder">无封面</span>'}
          </div>
          <div class="book-info">
            <div class="book-title">${book.title}</div>
            <div class="book-author">${book.author || '未知作者'}</div>
          </div>
        </div>
      `).join('');
    },
    async showTranslationConfig() {
      if (!this.selectedBook) {
        this.showToast('请先选择一本书', 'error');
        return;
      }
      
      const config = await window.electronAPI.translation.getConfig();
      
      document.getElementById('translation-provider').value = config.provider || 'openai';
      document.getElementById('translation-api-key').value = config.apiKey || '';
      document.getElementById('translation-temperature').value = config.temperature || 0.3;
      document.getElementById('translation-max-tokens').value = config.maxTokens || 4096;
      document.getElementById('translation-base-url').value = config.baseUrl || '';
      
      await this.updateModelOptions(config.provider || 'openai');
      document.getElementById('translation-model').value = config.model || 'gpt-4';
      
      this.updateBaseUrlVisibility();
      
      document.getElementById('translation-config-modal').classList.add('open');
    },
    async onProviderChange() {
      const provider = document.getElementById('translation-provider').value;
      await this.updateModelOptions(provider);
      this.updateBaseUrlVisibility();
    },
    updateBaseUrlVisibility() {
      const provider = document.getElementById('translation-provider').value;
      const baseUrlGroup = document.getElementById('base-url-group');
      if (provider === 'local') {
        baseUrlGroup.style.display = 'block';
      } else {
        baseUrlGroup.style.display = 'none';
      }
    },
    async updateModelOptions(provider) {
      const models = await window.electronAPI.translation.getAvailableModels(provider);
      const select = document.getElementById('translation-model');
      select.innerHTML = models.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
    },
    closeTranslationConfig() {
      document.getElementById('translation-config-modal').classList.remove('open');
    },
    async startTranslation() {
      if (!this.selectedBook) {
        this.showToast('请先选择一本书', 'error');
        return;
      }
      
      const config = {
        provider: document.getElementById('translation-provider').value,
        model: document.getElementById('translation-model').value,
        apiKey: document.getElementById('translation-api-key').value,
        baseUrl: document.getElementById('translation-base-url').value,
        temperature: parseFloat(document.getElementById('translation-temperature').value),
        maxTokens: parseInt(document.getElementById('translation-max-tokens').value)
      };
      
      if (!config.apiKey) {
        this.showToast('请输入 API Key', 'error');
        return;
      }
      
      try {
        await window.electronAPI.translation.setConfig(config);
      } catch (error) {
        this.showToast('配置保存失败: ' + error.message, 'error');
        return;
      }
      
      this.closeTranslationConfig();
      
      document.getElementById('translation-progress-modal').classList.add('open');
      document.getElementById('translation-progress-bar').style.width = '0%';
      document.getElementById('translation-progress-bar').textContent = '0%';
      document.getElementById('progress-translated').textContent = '0';
      document.getElementById('progress-total').textContent = '0';
      document.getElementById('progress-tokens').textContent = '0';
      document.getElementById('progress-cost').textContent = '$0.00';
      document.getElementById('progress-status').textContent = '准备中...';
      
      window.electronAPI.translation.onProgress((progress) => {
        this.updateTranslationProgress(progress);
      });
      
      try {
        const result = await window.electronAPI.translation.start(this.selectedBook.id);
        
        if (result.status === 'completed') {
          this.showToast('翻译完成！文件已保存到: ' + result.outputPath, 'success');
          document.getElementById('translation-progress-modal').classList.remove('open');
        } else if (result.status === 'paused') {
          this.showToast('翻译已暂停', 'info');
        }
      } catch (error) {
        console.error('Translation failed:', error);
        this.showToast('翻译失败: ' + error.message, 'error');
        document.getElementById('translation-progress-modal').classList.remove('open');
      }
    },
    updateTranslationProgress(progress) {
      const bar = document.getElementById('translation-progress-bar');
      bar.style.width = progress.progress + '%';
      bar.textContent = Math.round(progress.progress) + '%';
      
      if (progress.translated !== undefined) {
        document.getElementById('progress-translated').textContent = progress.translated;
      }
      if (progress.total !== undefined) {
        document.getElementById('progress-total').textContent = progress.total;
      }
      if (progress.tokens !== undefined) {
        document.getElementById('progress-tokens').textContent = progress.tokens.toLocaleString();
      }
      if (progress.estimatedCost !== undefined) {
        document.getElementById('progress-cost').textContent = '$' + progress.estimatedCost.toFixed(4);
      }
      if (progress.message !== undefined) {
        document.getElementById('progress-status').textContent = progress.message;
      }
    },
    async cancelTranslation() {
      try {
        await window.electronAPI.translation.cancel();
        document.getElementById('translation-progress-modal').classList.remove('open');
        this.showToast('翻译已取消', 'info');
      } catch (error) {
        console.error('Cancel failed:', error);
      }
    }
  }
});

const vue = app.mount('#app');

vue.renderBookList();
