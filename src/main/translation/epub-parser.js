const JSZip = require('jszip');
const xml2js = require('xml2js');
const path = require('path');
const fs = require('fs');

class EpubParser {
  constructor(filePath) {
    this.filePath = filePath;
    this.zip = null;
    this.opfContent = null;
    this.opfPath = null;
    this.manifest = {};
    this.spine = [];
    this.images = [];
    this.styles = [];
  }

  async parse() {
    const data = fs.readFileSync(this.filePath);
    this.zip = await JSZip.loadAsync(data);
    
    await this.findOpf();
    await this.parseOpf();
    this.extractResources();
    
    return {
      metadata: this.metadata,
      chapters: await this.extractChapters(),
      images: this.images,
      styles: this.styles,
      coverImage: this.findCoverImage()
    };
  }

  async findOpf() {
    const containerXml = this.zip.file('META-INF/container.xml');
    
    if (containerXml) {
      const content = await containerXml.async('string');
      const parsed = await xml2js.parseStringPromise(content);
      const rootfile = parsed.container.rootfiles.rootfile[0];
      this.opfPath = rootfile.$['full-path'];
    } else {
      const opfFiles = Object.keys(this.zip.files).filter(name => name.endsWith('.opf'));
      if (opfFiles.length > 0) {
        this.opfPath = opfFiles[0];
      }
    }
    
    if (this.opfPath) {
      this.opfContent = await this.zip.file(this.opfPath).async('string');
    }
  }

  async parseOpf() {
    if (!this.opfContent) return;
    
    const parsed = await xml2js.parseStringPromise(this.opfContent);
    const package = parsed.package;
    
    this.opfDir = path.dirname(this.opfPath);
    
    if (package.metadata) {
      const metadata = package.metadata[0];
      this.metadata = {
        title: this.getTextValue(metadata['dc:title']) || this.getTextValue(metadata.title),
        author: this.getTextValue(metadata['dc:creator']) || this.getTextValue(metadata.creator),
        publisher: this.getTextValue(metadata['dc:publisher']) || this.getTextValue(metadata.publisher),
        language: this.getTextValue(metadata['dc:language']) || this.getTextValue(metadata.language),
        description: this.getTextValue(metadata['dc:description']) || this.getTextValue(metadata.description),
        identifier: this.getTextValue(metadata['dc:identifier']) || this.getTextValue(metadata.identifier)
      };
    }
    
    if (package.manifest) {
      const items = package.manifest[0].item;
      if (items) {
        for (const item of items) {
          const id = item.$.id;
          const href = item.$.href;
          const mediaType = item.$.['media-type'];
          
          this.manifest[id] = {
            id,
            href,
            mediaType,
            path: path.join(this.opfDir, href).replace(/\\/g, '/')
          };
          
          if (mediaType && mediaType.startsWith('image/')) {
            this.images.push({
              id,
              href,
              path: path.join(this.opfDir, href).replace(/\\/g, '/'),
              mediaType
            });
          }
          
          if (mediaType === 'text/css' || href.endsWith('.css')) {
            this.styles.push({
              id,
              href,
              path: path.join(this.opfDir, href).replace(/\\/g, '/')
            });
          }
        }
      }
    }
    
    if (package.spine) {
      const spineItems = package.spine[0].itemref;
      if (spineItems) {
        this.spine = spineItems.map(item => item.$.idref);
      }
    }
  }

  getTextValue(arr) {
    if (!arr) return null;
    if (typeof arr === 'string') return arr;
    if (arr[0] && typeof arr[0] === 'object' && arr[0]['_']) {
      return arr[0]['_'];
    }
    if (arr[0] && typeof arr[0] === 'string') {
      return arr[0];
    }
    return null;
  }

  extractResources() {
  }

  findCoverImage() {
    const coverMeta = Object.values(this.manifest).find(item => {
      const id = item.id?.toLowerCase() || '';
      const href = item.href?.toLowerCase() || '';
      return id === 'cover' || id === 'coverimage' || href.includes('cover');
    });
    
    if (coverMeta) {
      return {
        id: coverMeta.id,
        href: coverMeta.href,
        path: coverMeta.path
      };
    }
    
    return null;
  }

  async extractChapters() {
    const chapters = [];
    
    for (let i = 0; i < this.spine.length; i++) {
      const idref = this.spine[i];
      const manifestItem = this.manifest[idref];
      
      if (!manifestItem) continue;
      
      const file = this.zip.file(manifestItem.path);
      if (!file) continue;
      
      const content = await file.async('string');
      const paragraphs = this.extractParagraphs(content);
      
      if (paragraphs.length > 0) {
        chapters.push({
          index: i,
          id: idref,
          href: manifestItem.href,
          path: manifestItem.path,
          title: this.extractChapterTitle(content) || `Chapter ${i + 1}`,
          paragraphs
        });
      }
    }
    
    return chapters;
  }

  extractParagraphs(html) {
    const paragraphs = [];
    
    const blockTags = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre'];
    
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (!bodyMatch) {
      return [{ tag: 'p', text: html.replace(/<[^>]+>/g, '').trim() }];
    }
    
    let body = bodyMatch[1];
    
    for (const tag of blockTags) {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
      let match;
      
      while ((match = regex.exec(body)) !== null) {
        const content = match[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (content.length > 0) {
          paragraphs.push({
            tag,
            text: content,
            original: match[0]
          });
        }
      }
    }
    
    if (paragraphs.length === 0) {
      const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length > 0) {
        paragraphs.push({ tag: 'p', text, original: text });
      }
    }
    
    return paragraphs;
  }

  extractChapterTitle(html) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) return titleMatch[1].trim();
    
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) return h1Match[1].trim();
    
    const h2Match = html.match(/<h2[^>]*>([^<]+)<\/h2>/i);
    if (h2Match) return h2Match[1].trim();
    
    return null;
  }

  async getImageData(imagePath) {
    const file = this.zip.file(imagePath);
    if (file) {
      return await file.async('base64');
    }
    return null;
  }

  async getStyles() {
    const styles = [];
    
    for (const style of this.styles) {
      const file = this.zip.file(style.path);
      if (file) {
        const content = await file.async('string');
        styles.push({
          id: style.id,
          href: style.href,
          content
        });
      }
    }
    
    return styles;
  }
}

module.exports = EpubParser;
