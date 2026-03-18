const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const crypto = require('crypto');

function getDataPath() {
  return app.getPath('userData');
}

function getBooksPath() {
  const booksPath = path.join(getDataPath(), 'books');
  if (!fs.existsSync(booksPath)) {
    fs.mkdirSync(booksPath, { recursive: true });
  }
  return booksPath;
}

function getCoversPath() {
  const coversPath = path.join(getDataPath(), 'covers');
  if (!fs.existsSync(coversPath)) {
    fs.mkdirSync(coversPath, { recursive: true });
  }
  return coversPath;
}

async function copyBookToDataDir(originalPath) {
  const ext = path.extname(originalPath);
  const hash = crypto.createHash('md5').update(originalPath + Date.now()).digest('hex');
  const newFileName = `${hash}${ext}`;
  const destPath = path.join(getBooksPath(), newFileName);
  
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(originalPath);
    const writeStream = fs.createWriteStream(destPath);
    
    readStream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('finish', () => resolve(destPath));
    
    readStream.pipe(writeStream);
  });
}

async function saveCoverFromBase64(bookId, base64Data) {
  const ext = detectImageExt(base64Data);
  const coverFileName = `cover_${bookId}${ext}`;
  const coverPath = path.join(getCoversPath(), coverFileName);
  
  const buffer = Buffer.from(base64Data, 'base64');
  
  return new Promise((resolve, reject) => {
    fs.writeFile(coverPath, buffer, (err) => {
      if (err) reject(err);
      else resolve(coverPath);
    });
  });
}

async function saveCoverFromFile(bookId, sourcePath) {
  const ext = path.extname(sourcePath).toLowerCase() || '.jpg';
  const coverFileName = `cover_${bookId}${ext}`;
  const destPath = path.join(getCoversPath(), coverFileName);
  
  return new Promise((resolve, reject) => {
    fs.copyFile(sourcePath, destPath, (err) => {
      if (err) reject(err);
      else resolve(destPath);
    });
  });
}

function detectImageExt(base64Data) {
  if (base64Data.startsWith('/9j/')) return '.jpg';
  if (base64Data.startsWith('iVBOR')) return '.png';
  if (base64Data.startsWith('R0lGO')) return '.gif';
  if (base64Data.startsWith('UklGR')) return '.webp';
  return '.jpg';
}

async function deleteBookFile(filePath, fileMode) {
  if (fileMode === 'copy') {
    const booksPath = getBooksPath();
    if (filePath.startsWith(booksPath)) {
      return new Promise((resolve, reject) => {
        fs.unlink(filePath, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }
  return Promise.resolve();
}

async function deleteCover(coverPath) {
  if (!coverPath) return;
  
  const coversPath = getCoversPath();
  if (coverPath.startsWith(coversPath)) {
    return new Promise((resolve, reject) => {
      fs.unlink(coverPath, (err) => {
        if (err && err.code !== 'ENOENT') reject(err);
        else resolve();
      });
    });
  }
}

async function moveBookFile(oldPath, newPath) {
  return new Promise((resolve, reject) => {
    fs.rename(oldPath, newPath, (err) => {
      if (err) {
        fs.copyFile(oldPath, newPath, (copyErr) => {
          if (copyErr) reject(copyErr);
          else {
            fs.unlink(oldPath, (unlinkErr) => {
              if (unlinkErr) reject(unlinkErr);
              else resolve(newPath);
            });
          }
        });
      } else {
        resolve(newPath);
      }
    });
  });
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

async function getFileInfo(filePath) {
  return new Promise((resolve, reject) => {
    fs.stat(filePath, (err, stats) => {
      if (err) reject(err);
      else {
        resolve({
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        });
      }
    });
  });
}

module.exports = {
  getDataPath,
  getBooksPath,
  getCoversPath,
  copyBookToDataDir,
  saveCoverFromBase64,
  saveCoverFromFile,
  deleteBookFile,
  deleteCover,
  moveBookFile,
  fileExists,
  getFileInfo
};
