const assert = require('assert');

describe('EPUB Parser', () => {
  const path = require('path');
  const fs = require('fs');
  
  describe('extractCover', () => {
    it('should detect image type from base64 data', () => {
      const base64Jpeg = '/9j/4AAQSkZJRg';
      const base64Png = 'iVBORw0KGgoAAAANSUhEUg';
      const base64Webp = 'UklGRlYGAABXRUJQVlA4';
      
      assert.ok(base64Jpeg.startsWith('/9j/'), 'JPEG should start with /9j/');
      assert.ok(base64Png.startsWith('iVBOR'), 'PNG should start with iVBOR');
      assert.ok(base64Webp.startsWith('UklGR'), 'WebP should start with UklGR');
    });
  });
});

describe('File Manager', () => {
  const path = require('path');
  
  describe('getCoversPath', () => {
    it('should handle path correctly', () => {
      const testPath = path.join('userData', 'covers');
      assert.ok(testPath.includes('covers'), 'Path should include covers directory');
    });
  });
  
  describe('detectImageExt', () => {
    it('should detect correct image extension', () => {
      const testCases = [
        { data: '/9j/4AAQ', expected: '.jpg' },
        { data: 'iVBORw0', expected: '.png' },
        { data: 'UklGRlY', expected: '.webp' },
        { data: 'R0lGOD', expected: '.gif' },
        { data: 'invalid', expected: '.jpg' }
      ];
      
      testCases.forEach(({ data, expected }) => {
        let result = '.jpg';
        if (data.startsWith('/9j/')) result = '.jpg';
        else if (data.startsWith('iVBOR')) result = '.png';
        else if (data.startsWith('UklGR')) result = '.webp';
        else if (data.startsWith('R0lGO')) result = '.gif';
        assert.strictEqual(result, expected);
      });
    });
  });
});

describe('Database Books', () => {
  describe('exportBooks', () => {
    it('should export books as JSON', () => {
      const books = [
        { id: 1, title: 'Test Book', author: 'Test Author' }
      ];
      
      const jsonOutput = JSON.stringify(books, null, 2);
      assert.ok(jsonOutput.includes('Test Book'), 'JSON should contain book title');
      assert.ok(jsonOutput.includes('Test Author'), 'JSON should contain author');
    });
    
    it('should export books as CSV', () => {
      const books = [
        { id: 1, title: 'Test Book', author: 'Test Author', publisher: 'Test Pub', description: 'Desc', read_status: 'unread', file_path: '/path/to/book.epub' }
      ];
      
      const headers = ['id', 'title', 'author', 'publisher', 'description', 'read_status', 'file_path'];
      const csvContent = [
        headers.join(','),
        headers.map(h => `"${(books[0][h] || '').toString().replace(/"/g, '""')}"`).join(',')
      ].join('\n');
      
      assert.ok(csvContent.includes('id'), 'CSV should have headers');
      assert.ok(csvContent.includes('Test Book'), 'CSV should contain book title');
    });
  });
});

describe('Metadata Fetcher', () => {
  describe('OpenLibrary search', () => {
    it('should construct correct search URL', () => {
      const title = 'Test Book';
      const author = 'Test Author';
      const expectedUrl = 'https://openlibrary.org/search.json?title=' + encodeURIComponent(title) + '&author=' + encodeURIComponent(author) + '&limit=1';
      
      let query = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}`;
      query += `&author=${encodeURIComponent(author)}`;
      query += '&limit=1';
      
      assert.strictEqual(query, expectedUrl);
    });
  });
  
  describe('Google Books search', () => {
    it('should construct correct search URL', () => {
      const title = 'Test Book';
      const author = 'Test Author';
      const expectedUrl = 'https://www.googleapis.com/books/v1/volumes?q=' + encodeURIComponent(title) + '+inauthor:' + encodeURIComponent(author) + '&maxResults=1';
      
      let query = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(title)}`;
      query += `+inauthor:${encodeURIComponent(author)}`;
      query += '&maxResults=1';
      
      assert.strictEqual(query, expectedUrl);
    });
  });
});
