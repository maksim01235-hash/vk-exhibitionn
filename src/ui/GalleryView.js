/**
 * GalleryView — главный экран: сетка превью фотографий.
 * 
 * НАЗНАЧЕНИЕ:
 *   Отображает сетку карточек с превью, названиями и авторами.
 *   При клике на карточку — переход на экран фото.
 * 
 * КАК ЭТО РАБОТАЕТ:
 *   1. При первом render() строится DOM сетки (один раз за сессию)
 *   2. IntersectionObserver отслеживает попадание карточек в видимую область
 *   3. При попадании — URL добавляется в очередь пачковой загрузки
 *   4. Пачки грузятся по 2 с задержкой BATCH_DELAY
 *   5. При повторных render() DOM не пересоздаётся — только показывается экран
 * 
 * РАСШИРЕНИЕ:
 *   — Добавить группировку по категориям (фильтры/вкладки)
 *   — Виртуальный скролл для сотен фото
 *   — Режимы отображения: сетка / список
 */

import Store from '../core/Store.js';
import EventBus from '../core/EventBus.js';
import ImagePreloader from '../utils/ImagePreloader.js';
import { renderMarkdown } from '../utils/markdown.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/**
 * Размер пачки для фоновой загрузки.
 * Сколько URL грузить одновременно. Увеличь для быстрой загрузки,
 * уменьшь для экономии трафика.
 */
const BATCH_SIZE = 10;

/**
 * Задержка между пачками загрузки (мс).
 * Чтобы не нагружать сеть одновременными запросами.
 */
const BATCH_DELAY = 50;

/**
 * Настройки IntersectionObserver.
 * rootMargin: '600px' — начинаем загрузку за 600px до попадания в экран.
 * threshold: 0.01 — достаточно 1% видимости чтобы начать загрузку.
 */
const OBSERVER_OPTIONS = {
  rootMargin: '600px',
  threshold: 0.01,
};

/** Плейсхолдер если нет ни preview, ни full */
const PLACEHOLDER_URL = 'assets/placeholder.jpg';

class GalleryView {
  constructor() {
    /** @type {HTMLElement} Сетка карточек */
    this._grid = document.getElementById('gallery-grid');

    /** @type {HTMLElement} Заглушка «Нет фото» */
    this._empty = document.getElementById('gallery-empty');

    /** @type {boolean} Построен ли DOM сетки */
    this._rendered = false;

    /** @type {IntersectionObserver|null} Наблюдатель видимости карточек */
    this._observer = null;

    /** @type {string[]} Очередь URL на загрузку */
    this._batchQueue = [];

    /** @type {number|null} Таймер пачковой загрузки */
    this._batchTimer = null;
  }

  // ═══════════════════════════════════════
  // ПУБЛИЧНЫЙ API
  // ═══════════════════════════════════════

  /**
   * Отрисовать сетку.
   * При первом вызове строит DOM, при последующих — только показывает экран.
   */
  render() {
    if (!this._grid || !this._empty) return;

    const photos = Store.getAllPhotos();

    // Нет фото — заглушка
    if (photos.length === 0) {
      this._grid.innerHTML = '';
      this._grid.classList.add('hidden');
      this._empty.classList.remove('hidden');
      this._rendered = false;
      return;
    }

    // Показываем сетку, скрываем заглушку
    this._empty.classList.add('hidden');
    this._grid.classList.remove('hidden');

    // Строим DOM только один раз за сессию
    if (!this._rendered) {
      this._grid.innerHTML = photos.map(photo => this._renderCard(photo)).join('');

      // Навешиваем обработчики клика
      this._grid.querySelectorAll('.gallery-card').forEach(card => {
        card.addEventListener('click', () => {
          EventBus.emit('router:openPhoto', card.dataset.photoId);
        });
      });

      // Настраиваем асинхронную загрузку превью
      this._setupObserver(photos);
      this._rendered = true;
    }
  }

  // ═══════════════════════════════════════
  // ЗАГРУЗКА ПРЕВЬЮ
  // ═══════════════════════════════════════

  /**
   * Настроить IntersectionObserver для приоритетной загрузки.
   * Карточки загружаются когда попадают в rootMargin (600px от экрана).
   * 
   * @param {Object[]} photos — массив фото из Store
   */
  _setupObserver(photos) {
    if (this._observer) {
      this._observer.disconnect();
    }

    this._observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const index = parseInt(entry.target.dataset.index);
          const photo = photos[index];
          if (photo) {
            const url = photo.imagePreviewUrl || photo.imageUrl;
            if (url) {
              this._addToBatch(url);
            }
          }
          // Перестаём наблюдать — URL уже в очереди
          this._observer.unobserve(entry.target);
        }
      });
    }, OBSERVER_OPTIONS);

    // Начинаем наблюдать за всеми карточками
    this._grid.querySelectorAll('.gallery-card').forEach((card, index) => {
      card.dataset.index = index;
      this._observer.observe(card);
    });
  }

  /**
   * Добавить URL в очередь. Запускает таймер пачковой загрузки.
   * @param {string} url
   */
  _addToBatch(url) {
    this._batchQueue.push(url);

    if (!this._batchTimer) {
      this._batchTimer = setTimeout(() => this._processBatch(), BATCH_DELAY);
    }
  }

  /**
   * Отправить накопленные URL на загрузку (пачка размером BATCH_SIZE).
   * Если остались ещё — планирует следующую пачку.
   */
  _processBatch() {
    if (this._batchQueue.length === 0) return;

    const batch = this._batchQueue.splice(0, BATCH_SIZE);
    ImagePreloader.preloadAll(batch);

    if (this._batchQueue.length > 0) {
      this._batchTimer = setTimeout(() => this._processBatch(), BATCH_DELAY);
    } else {
      this._batchTimer = null;
    }
  }

  // ═══════════════════════════════════════
  // РЕНДЕР КАРТОЧКИ
  // ═══════════════════════════════════════

  /**
   * HTML одной карточки.
   * Использует imagePreviewUrl, затем imageUrl, затем плейсхолдер.
   * Название и автор — Markdown.
   * 
   * @param {Object} photo
   * @returns {string}
   */
  _renderCard(photo) {
    const imgSrc = photo.imagePreviewUrl || photo.imageUrl || PLACEHOLDER_URL;
    return `
      <div class="gallery-card loaded" data-photo-id="${photo.id}">
        <div class="gallery-card-image">
          <img src="${imgSrc}" alt="${this._escape(photo.title || '')}" loading="lazy" />
        </div>
        <div class="gallery-card-info">
          <div class="gallery-card-title">${renderMarkdown(photo.title || 'Без названия')}</div>
          ${photo.photographer ? `<div class="gallery-card-author">${renderMarkdown(photo.photographer)}</div>` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Экранировать HTML-сущности.
   * @param {string} str
   * @returns {string}
   */
  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

export default GalleryView;