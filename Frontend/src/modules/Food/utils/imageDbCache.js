const DB_NAME = 'image-cache-db';
const STORE_NAME = 'images';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });

  return dbPromise;
}

/**
 * Retrieves a cached image from IndexedDB and returns an Object URL.
 * Returns null if the image is not cached or if retrieval fails.
 * @param {string} src - The image URL
 * @returns {Promise<string|null>}
 */
export async function getCachedImage(src) {
  if (!src || typeof src !== 'string' || !src.startsWith('http')) {
    return null;
  }

  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(src);

      request.onsuccess = () => {
        const data = request.result;
        if (data && data.blob) {
          try {
            const objectUrl = URL.createObjectURL(data.blob);
            resolve(objectUrl);
          } catch (e) {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        resolve(null);
      };
    });
  } catch (err) {
    console.warn('Failed to retrieve image from cache:', err);
    return null;
  }
}

/**
 * Fetches and stores an image in IndexedDB as a Blob.
 * @param {string} src - The image URL
 * @returns {Promise<void>}
 */
export async function cacheImage(src) {
  if (!src || typeof src !== 'string' || !src.startsWith('http')) {
    return;
  }

  try {
    const db = await getDB();
    
    // Check if already cached to avoid duplicate network requests
    const alreadyCached = await new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(src);
      request.onsuccess = () => resolve(!!request.result);
      request.onerror = () => resolve(false);
    });

    if (alreadyCached) return;

    // Fetch the image
    const response = await fetch(src, { mode: 'cors' });
    if (!response.ok) return;

    const blob = await response.blob();
    
    // Store in IndexedDB
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ blob, timestamp: Date.now() }, src);

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    // Ignore cache errors (e.g. CORS, offline)
  }
}
