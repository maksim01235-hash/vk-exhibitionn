// Предзагрузчик изображений с отметками о загрузке в localStorage

class ImagePreloader {
  constructor() {
    this._pending = new Map();
    this._loaded = new Set();
    this._storageKey = 'vk_exhibition_loaded_images';
    this._loadFromStorage();
  }

  _loadFromStorage() {
    try {
      const raw = localStorage.getItem(this._storageKey);
      if (raw) {
        const urls = JSON.parse(raw);
        urls.forEach(url => this._loaded.add(url));
      }
    } catch (e) {}
  }

  _saveToStorage(url) {
    try {
      const urls = Array.from(this._loaded);
      // Храним последние 200 URL
      const trimmed = urls.slice(-200);
      localStorage.setItem(this._storageKey, JSON.stringify(trimmed));
    } catch (e) {}
  }

  preload(url) {
    if (!url) return Promise.resolve(null);
    if (this._loaded.has(url)) return Promise.resolve(url);
    if (this._pending.has(url)) return this._pending.get(url);

    const promise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this._loaded.add(url);
        this._saveToStorage(url);
        this._pending.delete(url);
        resolve(url);
      };
      img.onerror = () => {
        this._pending.delete(url);
        resolve(null);
      };
      img.src = url;
    });

    this._pending.set(url, promise);
    return promise;
  }

  preloadAll(urls) {
    return Promise.all(urls.filter(Boolean).map(url => this.preload(url)));
  }

  async preloadWithPriority(urgentUrls, backgroundUrls = []) {
    const urgentPromise = this.preloadAll(urgentUrls);
    if (backgroundUrls.length > 0) {
      setTimeout(() => this.preloadAll(backgroundUrls), 500);
    }
    return urgentPromise;
  }

  isLoaded(url) {
    return this._loaded.has(url);
  }
}

export default new ImagePreloader();