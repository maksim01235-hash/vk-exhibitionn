/**
 * ImagePreloader — предзагрузчик изображений с кешированием.
 * 
 * НАЗНАЧЕНИЕ:
 *   Загружает изображения в фоне с ограничением одновременных запросов.
 *   Запоминает загруженные URL в памяти и localStorage.
 * 
 * КАК ЭТО РАБОТАЕТ:
 *   - Не более MAX_CONCURRENT одновременных загрузок
 *   - Очередь ожидающих загрузок
 *   - Загруженные URL сохраняются в localStorage (последние 200)
 *   - При повторном запросе — мгновенный резолв
 *   - preloadWithPriority: срочные сразу, фоновые с задержкой
 * 
 * РАСШИРЕНИЕ:
 *   — IndexedDB вместо localStorage для больших объёмов
 *   — Прогресс загрузки (onProgress)
 *   — Отмена pending-загрузок
 */

import { createLogger } from '../utils/Logger.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/** Включить логирование */
const DEBUG = true;

/** Ключ localStorage */
const STORAGE_KEY = 'vk_exhibition_loaded_images';

/** Максимум хранимых URL в localStorage */
const MAX_STORED_URLS = 200;

/**
 * Максимум одновременных загрузок.
 * Увеличить — быстрее, но больше нагрузка на сеть.
 * Уменьшить — экономнее, но медленнее.
 */
const MAX_CONCURRENT = 4;

/** Задержка перед фоновыми загрузками (мс) */
const BACKGROUND_DELAY = 500;

// ═══════════════════════════════════════
// ЛОГГЕР
// ═══════════════════════════════════════

const log = createLogger('Preloader', DEBUG);

class ImagePreloader {
  constructor() {
    this._pending = new Map();
    this._loaded = new Set();
    this._activeCount = 0;
    this._queue = [];
    this._totalLoaded = 0;
    this._totalErrors = 0;
    this._loadFromStorage();
    log(`создан, из кеша: ${this._loaded.size} URL`);
  }

  // ═══════════════════════════════════════
  // ПУБЛИЧНЫЙ API
  // ═══════════════════════════════════════

  preload(url) {
    if (!url) return Promise.resolve(null);

    // Уже загружено
    if (this._loaded.has(url)) {
      return Promise.resolve(url);
    }

    // Уже в процессе
    if (this._pending.has(url)) {
      return this._pending.get(url);
    }

    const shortUrl = url.split('/').pop().substring(0, 40);

    const promise = new Promise((resolve) => {
      const load = () => {
        this._activeCount++;
        log(`начало [${this._activeCount}/${MAX_CONCURRENT}] ${shortUrl}`);
        const img = new Image();
        const startTime = Date.now();
        img.onload = img.onerror = () => {
          const elapsed = Date.now() - startTime;
          if (img.naturalWidth > 0) {
            this._loaded.add(url);
            this._totalLoaded++;
            this._saveToStorage(url);
            log(`✓ ${shortUrl} (${elapsed}мс, всего: ${this._totalLoaded})`);
            resolve(url);
          } else {
            this._totalErrors++;
            log(`✗ ${shortUrl} — ошибка (${elapsed}мс)`, 'warn');
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
        log(`в очереди: ${shortUrl} (очередь: ${this._queue.length + 1})`);
        this._queue.push(load);
      }
    });

    this._pending.set(url, promise);
    return promise;
  }

  preloadAll(urls) {
    log(`пачка из ${urls.length} URL`);
    return Promise.all(urls.filter(Boolean).map(url => this.preload(url)));
  }

  async preloadWithPriority(urgentUrls, backgroundUrls = []) {
    log(`срочные: ${urgentUrls.length}, фоновые: ${backgroundUrls.length}`);
    const urgentPromise = this.preloadAll(urgentUrls);
    if (backgroundUrls.length > 0) {
      setTimeout(() => this.preloadAll(backgroundUrls), BACKGROUND_DELAY);
    }
    return urgentPromise;
  }

  isLoaded(url) {
    return this._loaded.has(url);
  }

  getLoadedCount() {
    return this._loaded.size;
  }

  getPendingCount() {
    return this._pending.size;
  }

  getStats() {
    return {
      loaded: this._totalLoaded,
      errors: this._totalErrors,
      pending: this._pending.size,
      cached: this._loaded.size,
      active: this._activeCount,
      queued: this._queue.length,
    };
  }

  clearCache() {
    this._loaded.clear();
    this._pending.clear();
    this._queue = [];
    this._activeCount = 0;
    this._totalLoaded = 0;
    this._totalErrors = 0;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    log('кеш очищен');
  }

  // ═══════════════════════════════════════
  // ХРАНИЛИЩЕ
  // ═══════════════════════════════════════

  _processQueue() {
    while (this._activeCount < MAX_CONCURRENT && this._queue.length > 0) {
      this._queue.shift()();
    }
  }

  _loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {}
  }
}

export default new ImagePreloader();