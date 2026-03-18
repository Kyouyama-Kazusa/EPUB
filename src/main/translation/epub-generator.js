const JSZip = require('jszip');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const crypto = require('crypto');

class BilingualEpubGenerator {
  constructor(originalEpub, translatedResults, options = {}) {
    this.originalEpub = originalEpub;
    this.translatedResults = translatedResults;
    this.options = {
      preserveOriginal: true,
      originalColor: '#333333',
      translatedColor: '#4a90d9',
      separatorColor: '#e0e0e0',
      ...options
    };
    this.zip = new JSZip();
  }

  async generate(outputPath) {
    await this.copyOriginalStructure();
    this.injectBilingualStyles();
    this.modifyChaptersForBilingual();
    await this.addNavigationDocument();
    await this.updateOpfManifest();
    await this.writeEpub(outputPath);
    
    return outputPath;
  }

  async copyOriginalStructure() {
    const originalData = fs.readFileSync(this.originalEpub.filePath);
    const originalZip = await JSZip.loadAsync(originalData);
    
    for (const [filename, file] of Object.entries(originalZip.files)) {
      if (!file.dir) {
        const content = await file.async('base64');
        this.zip.file(filename, content, { base64: true });
      } else {
        this.zip.folder(filename);
      }
    }
  }

  injectBilingualStyles() {
    const bilingualCSS = `
/* Bilingual Book Styles */
.bilingual-block {
  margin: 1em 0;
  padding: 0;
}

.original-text {
  color: ${this.options.originalColor};
  margin: 0;
  padding: 0.5em 0;
}

.bilingual-separator {
  border: none;
  border-top: 1px solid ${this.options.separatorColor};
  margin: 0.5em 0;
}

.translated-text {
  color: ${this.options.translatedColor};
  margin: 0;
  padding: 0.5em 0;
}

.chapter-title {
  font-weight: bold;
  font-size: 1.2em;
  margin: 1em 0;
}
`;

    const existingStyles = this.originalEpub.styles || [];
    
    if (existingStyles.length > 0) {
      const firstStyle = existingStyles[0];
      const newFilename = 'OEBPS/styles/bilingual.css';
      
      this.zip.file(newFilename, bilingualCSS);
    } else {
      const stylePath = 'OEBPS/styles/main.css';
      this.zip.file(stylePath, bilingualCSS);
      
      const containerPath = 'META-INF/container.xml';
      const containerContent = this.zip.file(containerPath)?.async('string') || '';
    }
  }

  modifyChaptersForBilingual() {
    const chapters = this.originalEpub.chapters;
    const results = this.translatedResults;
    
    for (const chapter of chapters) {
      const chapterPath = chapter.path;
      const chapterContent = this.zip.file(chapterPath)?.async('string');
      
      if (chapterContent) {
        const modifiedContent = this.createBilingualChapter(chapter, results);
        this.zip.file(chapterPath, modifiedContent);
      }
    }
  }

  createBilingualChapter(chapter, results) {
    const paragraphs = chapter.paragraphs;
    let bilingualHTML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${this.originalEpub.metadata.language || 'en'}">
<head>
  <title>${chapter.title} - Bilingual</title>
  <link rel="stylesheet" type="text/css" href="styles/bilingual.css" />
</head>
<body>
<h1 class="chapter-title">${chapter.title}</h1>
`;

    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i];
      const result = results.find(r => r.paragraphIndex === i);
      
      const originalText = para.text;
      const translatedText = result?.translatedText || '';
      
      bilingualHTML += `<div class="bilingual-block">\n`;
      bilingualHTML += `  <p class="original-text">${this.escapeHtml(originalText)}</p>\n`;
      
      if (translatedText) {
        bilingualHTML += `  <hr class="bilingual-separator" />\n`;
        bilingualHTML += `  <p class="translated-text">${this.escapeHtml(translatedText)}</p>\n`;
      }
      
      bilingualHTML += `</div>\n`;
    }

    bilingualHTML += `</body>\n</html>`;
    
    return bilingualHTML;
  }

  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async addNavigationDocument() {
    const navDoc = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${this.originalEpub.metadata.identifier || 'bilingual-book'}" />
    <meta name="dtb:depth" content="1" />
    <meta name="dtb:totalPageCount" content="0" />
    <meta name="dtb:maxPageNumber" content="0" />
  </head>
  <docTitle>
    <text>${this.originalEpub.metadata.title || 'Bilingual Book'} - 双语版</text>
  </docTitle>
  <navMap>
`;

    for (let i = 0; i < this.originalEpub.chapters.length; i++) {
      const chapter = this.originalEpub.chapters[i];
      const playOrder = i + 1;
      
      navDoc += `    <navPoint id="navpoint-${playOrder}" playOrder="${playOrder}">
      <navLabel><text>${chapter.title}</text></navLabel>
      <content src="${chapter.href}" />
    </navPoint>\n`;
    }

    navDoc += `  </navMap>
</ncx>`;

    this.zip.file('OEBPS/nav.ncx', navDoc);
  }

  async updateOpfManifest() {
    let opfContent = await this.zip.file(this.originalEpub.opfPath)?.async('string');
    
    if (!opfContent) return;

    const bilingualStyleEntry = `<item id="bilingual-style" href="styles/bilingual.css" media-type="text/css"/>`;
    const navEntry = `<item id="nav" href="nav.ncx" media-type="application/x-dtbncx+xml"/>`;
    
    if (!opfContent.includes('bilingual-style')) {
      opfContent = opfContent.replace('</manifest>', `${bilingualStyleEntry}\n  </manifest>`);
    }
    
    if (!opfContent.includes('id="nav"')) {
      opfContent = opfContent.replace('</manifest>', `${navEntry}\n  </manifest>`);
    }
    
    const ncxItemref = `<itemref idref="nav" linear="no"/>`;
    if (!opfContent.includes('idref="nav"')) {
      opfContent = opfContent.replace('</spine>', `${ncxItemref}\n  </spine>`);
    }

    this.zip.file(this.originalEpub.opfPath, opfContent);
  }

  async writeEpub(outputPath) {
    const data = await this.zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });
    
    fs.writeFileSync(outputPath, data);
  }
}

module.exports = BilingualEpubGenerator;
