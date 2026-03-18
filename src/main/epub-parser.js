const JSZip = require('jszip');
const xml2js = require('xml2js');
const path = require('path');
const fs = require('fs');

async function parseEpub(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(data);
    
    const opfFile = await findOpfFile(zip);
    if (!opfFile) {
      throw new Error('无法找到 OPF 文件');
    }
    
    const opfContent = await zip.file(opfFile.name).async('string');
    const metadata = await parseOpfContent(opfContent, opfFile.name);
    
    const coverData = await extractCover(zip, opfContent, opfFile.name);
    
    return {
      title: metadata.title || path.basename(filePath, '.epub'),
      author: metadata.creator || null,
      publisher: metadata.publisher || null,
      description: metadata.description || null,
      coverData: coverData,
      filePath: filePath
    };
  } catch (error) {
    throw new Error(`解析 epub 失败: ${error.message}`);
  }
}

async function findOpfFile(zip) {
  const containerXml = zip.file('META-INF/container.xml');
  if (!containerXml) {
    const opfFiles = Object.keys(zip.files).filter(name => name.endsWith('.opf'));
    if (opfFiles.length > 0) {
      return { name: opfFiles[0], isRootFile: false };
    }
    return null;
  }
  
  const containerContent = await containerXml.async('string');
  const parsed = await xml2js.parseStringPromise(containerContent);
  
  const rootfiles = parsed.container.rootfiles;
  if (rootfiles && rootfiles.rootfile) {
    const rootfile = rootfiles.rootfile[0];
    const fullPath = rootfile.$['full-path'];
    return { name: fullPath, isRootFile: true };
  }
  
  return null;
}

async function parseOpfContent(opfContent, opfPath) {
  const parsed = await xml2js.parseStringPromise(opfContent);
  const package = parsed.package;
  
  if (!package || !package.metadata) {
    return {};
  }
  
  const metadata = package.metadata[0];
  
  const getTextValue = (arr) => {
    if (!arr) return null;
    if (typeof arr === 'string') return arr;
    if (arr[0] && typeof arr[0] === 'object' && arr[0]['_']) {
      return arr[0]['_'];
    }
    if (arr[0] && typeof arr[0] === 'string') {
      return arr[0];
    }
    return null;
  };
  
  const title = getTextValue(metadata['dc:title']) || getTextValue(metadata.title);
  const creator = getTextValue(metadata['dc:creator']) || getTextValue(metadata.creator);
  const publisher = getTextValue(metadata['dc:publisher']) || getTextValue(metadata.publisher);
  const description = getTextValue(metadata['dc:description']) || getTextValue(metadata.description);
  
  return { title, creator, publisher, description };
}

async function extractCover(zip, opfContent, opfPath) {
  const opfDir = path.dirname(opfPath);
  
  try {
    const parsed = await xml2js.parseStringPromise(opfContent);
    const package = parsed.package;
    
    if (!package || !package.metadata) {
      return null;
    }
    
    const metadata = package.metadata[0];
    
    const metaCover = metadata.meta && metadata.meta.find(m => m.$ && m.$.name === 'cover');
    let coverId = metaCover ? metaCover.$.content : null;
    
    if (!coverId) {
      const coverMeta = metadata['meta'] && metadata.meta.find(m => m.$ && m.$.name === 'cover');
      coverId = coverMeta ? coverMeta.$.content : null;
    }
    
    if (!coverId) {
      const coverItem = metadata['meta'] && metadata.meta.find(m => m.$ && m.$.name === 'cover-image');
      coverId = coverItem ? coverItem.$.content : null;
    }
    
    let manifest = null;
    if (package.manifest && package.manifest[0]) {
      manifest = package.manifest[0].item;
    }
    
    let coverItem = null;
    
    if (coverId && manifest) {
      coverItem = manifest.find(item => item.$ && item.$.id === coverId);
    }
    
    if (!coverItem && manifest) {
      coverItem = manifest.find(item => {
        const id = item.$ && (item.$.id || '').toLowerCase();
        const href = item.$ && (item.$.href || '').toLowerCase();
        return id === 'cover' || id === 'coverimage' || href.includes('cover');
      });
    }
    
    if (!coverItem && manifest) {
      coverItem = manifest.find(item => {
        const properties = item.$ && item.$.properties;
        return properties && properties.includes('cover-image');
      });
    }
    
    if (coverItem && coverItem.$) {
      const coverHref = coverItem.$.href;
      const coverPath = path.join(opfDir, coverHref).replace(/\\/g, '/');
      const coverFile = zip.file(coverPath);
      
      if (coverFile) {
        return await coverFile.async('base64');
      }
      
      const directCoverFile = zip.file(coverHref);
      if (directCoverFile) {
        return await directCoverFile.async('base64');
      }
    }
    
    const imageFiles = Object.keys(zip.files).filter(name => {
      const ext = path.extname(name).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) &&
             (name.toLowerCase().includes('cover') || name.includes('Cover'));
    });
    
    if (imageFiles.length > 0) {
      const coverFile = zip.file(imageFiles[0]);
      return await coverFile.async('base64');
    }
    
    return null;
  } catch (error) {
    console.error('提取封面失败:', error);
    return null;
  }
}

async function validateEpub(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(data);
    
    const hasContainer = !!zip.file('META-INF/container.xml');
    const hasOpf = await findOpfFile(zip);
    
    return hasContainer && hasOpf;
  } catch {
    return false;
  }
}

module.exports = {
  parseEpub,
  validateEpub,
  extractCover
};
