/**
 * ImagePreloader — предзагрузчик изображений с кешированием.
 * Загружает не более MAX_CONCURRENT изображений одновременно.
 */

const STORAGE_KEY = 'vk_exhibition_loaded_images';
const MAX_STORED_URLS = 200;
const MAX_CONCURRENT = 4; // Максимум одновременных загрузок
const BACKGROUND_DELAY = 500;

class ImagePreloader {
  constructor() {
    /** @type {Map<string, Promise>} Активные загрузки (ключ — URL) */
    this._pending = new Map();

    /** @type {Set<string>} Множество уже загруженных URL */
    this._loaded = new Set();
    this._storageKey = STORAGE_KEY;
    this._activeCount = 0;
    this._queue = [];
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
      const trimmed = urls.slice(-MAX_STORED_URLS);
      localStorage.setItem(this._storageKey, JSON.stringify(trimmed));
    } catch (e) {}
  }

  /**
   * Предзагрузить одно изображение.
   * Если URL уже загружен или в процессе — возвращает существующий промис.
   * 
   * @param {string} url — URL изображения
   * @returns {Promise<string|null>} url если загружено, null если ошибка
   */
  preload(url) {
    if (!url) return Promise.resolve(null);

    // Уже загружено
    if (this._loaded.has(url)) return Promise.resolve(url);

    // Уже в процессе загрузки — возвращаем существующий промис
    if (this._pending.has(url)) return this._pending.get(url);

    // Новая загрузка
    const promise = new Promise((resolve) => {
      const load = () => {
        this._activeCount++;
        const img = new Image();
        img.onload = img.onerror = () => {
          if (img.naturalWidth > 0) {
            this._loaded.add(url);
            this._saveToStorage(url);
            resolve(url);
          } else {
            resolve(null);
          }
          this._pending.delete(url);
          this._activeCount--;
          this._processQueue();
        };
        img.src = url;
      };

      if (this._activeCount < MAX_CONCURRENT) {
        load();
      } else {
        this._queue.push(load);
      }
    });

    this._pending.set(url, promise);
    return promise;
  }

  _processQueue() {
    while (this._activeCount < MAX_CONCURRENT && this._queue.length > 0) {
      const next = this._queue.shift();
      next();
    }
  }

  preloadAll(urls) {
    return Promise.all(
      urls.filter(Boolean).map(url => this.preload(url))
    );
  }

  /**
   * Предзагрузка с приоритетом.
   * Срочные загружаются немедленно, фоновые — с задержкой.
   * 
   * @param {string[]} urgentUrls — срочные URL
   * @param {string[]} [backgroundUrls=[]] — фоновые URL
   * @returns {Promise} разрешается когда срочные загружены
   */
  async preloadWithPriority(urgentUrls, backgroundUrls = []) {
    const urgentPromise = this.preloadAll(urgentUrls);

    if (backgroundUrls.length > 0) {
      setTimeout(() => this.preloadAll(backgroundUrls), BACKGROUND_DELAY);
    }

    return urgentPromise;
  }

  /**
   * Проверить, загружен ли URL.
   * @param {string} url
   * @returns {boolean}
   */
  isLoaded(url) {
    return this._loaded.has(url);
  }

  getLoadedCount() {
    return this._loaded.size;
  }

  getPendingCount() {
    return this._pending.size;
  }

  clearCache() {
    this._loaded.clear();
    this._pending.clear();
    this._queue = [];
    this._activeCount = 0;
    try {
      localStorage.removeItem(this._storageKey);
    } catch (e) {}
  }
}

export default new ImagePreloader();