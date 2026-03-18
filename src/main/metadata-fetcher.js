const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      });
    }).on('error', reject);
  });
}

async function searchOpenLibrary(title, author) {
  let query = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}`;
  if (author) {
    query += `&author=${encodeURIComponent(author)}`;
  }
  query += '&limit=1';
  
  try {
    const data = await fetchUrl(query);
    
    if (data.docs && data.docs.length > 0) {
      const doc = data.docs[0];
      return {
        title: doc.title,
        author: doc.author_name ? doc.author_name[0] : author,
        publisher: doc.publisher ? doc.publisher[0] : null,
        description: doc.first_sentence ? doc.first_sentence[0] : null,
        source: 'Open Library'
      };
    }
    return null;
  } catch (error) {
    console.error('OpenLibrary search failed:', error);
    return null;
  }
}

async function searchGoogleBooks(title, author) {
  let query = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(title)}`;
  if (author) {
    query += `+inauthor:${encodeURIComponent(author)}`;
  }
  query += '&maxResults=1';
  
  try {
    const data = await fetchUrl(query);
    
    if (data.items && data.items.length > 0) {
      const book = data.items[0].volumeInfo;
      return {
        title: book.title,
        author: book.authors ? book.authors[0] : author,
        publisher: book.publisher || null,
        description: book.description || null,
        source: 'Google Books'
      };
    }
    return null;
  } catch (error) {
    console.error('Google Books search failed:', error);
    return null;
  }
}

async function fetchMetadata(title, author) {
  let result = await searchOpenLibrary(title, author);
  
  if (!result) {
    result = await searchGoogleBooks(title, author);
  }
  
  return result;
}

module.exports = {
  fetchMetadata,
  searchOpenLibrary,
  searchGoogleBooks
};
