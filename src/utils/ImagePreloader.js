/**
 * ImagePreloader — предзагрузчик изображений с кешированием.
 * 
 * Загружает изображения в фоне, не блокируя интерфейс.
 * Запоминает уже загруженные URL (в памяти + localStorage),
 * чтобы не грузить повторно.
 * 
 * Использование:
 *   await ImagePreloader.preload(url);          // одно изображение
 *   await ImagePreloader.preloadAll([url1, ...]); // массив
 *   await ImagePreloader.preloadWithPriority(urgent, deferred); // с приоритетом
 * 
 * При расширении можно добавить:
 *   — Ограничение одновременных загрузок (сейчас безлимитно)
 *   — Прогресс загрузки (колбэк onProgress)
 *   — Отмена pending-загрузок
 *   — IndexedDB вместо localStorage для больших объёмов
 */

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/** Ключ для хранения списка загруженных URL в localStorage */
const STORAGE_KEY = 'vk_exhibition_loaded_images';

/**
 * Максимальное количество URL, хранимых в localStorage.
 * При превышении старые записи удаляются (FIFO).
 * Уменьши, если localStorage переполняется (лимит ~5-10MB).
 */
const MAX_STORED_URLS = 200;

/**
 * Задержка перед началом фоновой загрузки (мс).
 * Используется в preloadWithPriority чтобы срочные загрузки прошли первыми.
 */
const BACKGROUND_DELAY = 500;

class ImagePreloader {
  constructor() {
    /** @type {Map<string, Promise>} Активные загрузки (ключ — URL) */
    this._pending = new Map();

    /** @type {Set<string>} Множество уже загруженных URL */
    this._loaded = new Set();

    /** @type {string} Ключ localStorage */
    this._storageKey = STORAGE_KEY;

    // Восстанавливаем список загруженных URL из localStorage
    this._loadFromStorage();
  }

  // ═══════════════════════════════════════
  // ПУБЛИЧНЫЙ API
  // ═══════════════════════════════════════

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
      const img = new Image();
      img.onload = () => {
        this._loaded.add(url);
        this._saveToStorage(url);
        this._pending.delete(url);
        resolve(url);
      };
      img.onerror = () => {
        this._pending.delete(url);
        resolve(null); // Не reject — не ломаем Promise.all
      };
      img.src = url;
    });

    this._pending.set(url, promise);
    return promise;
  }

  /**
   * Предзагрузить массив изображений.
   * 
   * @param {string[]} urls
   * @returns {Promise<(string|null)[]>}
   */
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

  /**
   * Количество URL в кеше.
   * @returns {number}
   */
  getLoadedCount() {
    return this._loaded.size;
  }

  /**
   * Количество активных загрузок.
   * @returns {number}
   */
  getPendingCount() {
    return this._pending.size;
  }

  /**
   * Очистить кеш (память + localStorage).
   */
  clearCache() {
    this._loaded.clear();
    this._pending.clear();
    try {
      localStorage.removeItem(this._storageKey);
    } catch (e) {}
  }

  // ═══════════════════════════════════════
  // LOCALSTORAGE
  // ═══════════════════════════════════════

  /**
   * Восстановить список загруженных URL из localStorage.
   */
  _loadFromStorage() {
    try {
      const raw = localStorage.getItem(this._storageKey);
      if (raw) {
        const urls = JSON.parse(raw);
        urls.forEach(url => this._loaded.add(url));
      }
    } catch (e) {
      // Данные повреждены — игнорируем
    }
  }

  /**
   * Сохранить URL в localStorage.
   * Хранит последние MAX_STORED_URLS записей (FIFO).
   * 
   * @param {string} url
   */
  _saveToStorage(url) {
    try {
      const urls = Array.from(this._loaded);
      const trimmed = urls.slice(-MAX_STORED_URLS);
      localStorage.setItem(this._storageKey, JSON.stringify(trimmed));
    } catch (e) {
      // localStorage переполнен или недоступен — не критично
    }
  }
}

export default new ImagePreloader();