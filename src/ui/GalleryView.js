/**
 * GalleryView — главный экран: сетка превью фотографий.
 * 
 * Отвечает за:
 *   - Рендер сетки карточек с превью, названиями и авторами
 *   - Фоновую предзагрузку всех превью (один раз за сессию)
 *   - Клик по карточке → переход на экран фото
 * 
 * При расширении можно добавить:
 *   - Виртуальный скролл для сотен фото
 *   - Группировку по категориям (вкладки/секции)
 *   - Режимы отображения: сетка / список / лента
 */

import Store from '../core/Store.js';
import EventBus from '../core/EventBus.js';
import ImagePreloader from '../utils/ImagePreloader.js';
import { renderMarkdown } from '../utils/markdown.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/** Количество превью, загружаемых одновременно (пачка) */
const PRELOAD_BATCH_SIZE = 2;

/** Задержка между пачками предзагрузки (мс) */
const PRELOAD_BATCH_DELAY = 200;

/** Заглушка, если у фото нет ни preview, ни full */
const PLACEHOLDER_URL = 'assets/placeholder.jpg';

class GalleryView {
  constructor() {
    /** @type {HTMLElement} Контейнер сетки */
    this._grid = document.getElementById('gallery-grid');

    /** @type {HTMLElement} Заглушка «Фотографии не найдены» */
    this._empty = document.getElementById('gallery-empty');

    /** Флаг: предзагрузка всех превью уже запущена */
    this._allPreviewsLoaded = false;
  }

  // ═══════════════════════════════════════
  // ПУБЛИЧНЫЙ API
  // ═══════════════════════════════════════

  /**
   * Отрисовать сетку карточек.
   * При первом вызове запускает фоновую предзагрузку всех превью.
   */
  render() {
    if (!this._grid || !this._empty) return;

    const photos = Store.getAllPhotos();

    // Нет фото — показываем заглушку
    if (photos.length === 0) {
      this._grid.innerHTML = '';
      this._grid.classList.add('hidden');
      this._empty.classList.remove('hidden');
      return;
    }

    this._empty.classList.add('hidden');
    this._grid.classList.remove('hidden');

    // Рендер карточек
    this._grid.innerHTML = photos.map(photo => this._renderCard(photo)).join('');

    // Навешиваем обработчики клика
    this._grid.querySelectorAll('.gallery-card').forEach(card => {
      card.addEventListener('click', () => {
        EventBus.emit('router:openPhoto', card.dataset.photoId);
      });
    });

    // Фоновая предзагрузка всех превью (только один раз)
    if (!this._allPreviewsLoaded) {
      this._allPreviewsLoaded = true;
      const previewUrls = photos
        .map(p => p.imagePreviewUrl || p.imageUrl)
        .filter(Boolean);
      this._preloadInBatches(previewUrls, PRELOAD_BATCH_SIZE, PRELOAD_BATCH_DELAY);
    }
  }

  // ═══════════════════════════════════════
  // ПРЕДЗАГРУЗКА
  // ═══════════════════════════════════════

  /**
   * Загрузить массив URL пачками с задержкой.
   * Не нагружает сеть — грузит по 2 изображения каждые 200 мс.
   * 
   * @param {string[]} urls
   * @param {number} batchSize — размер пачки
   * @param {number} delayMs — задержка между пачками (мс)
   */
  _preloadInBatches(urls, batchSize, delayMs) {
    let i = 0;
    const loadBatch = () => {
      const batch = urls.slice(i, i + batchSize);
      if (batch.length === 0) return;
      ImagePreloader.preloadAll(batch);
      i += batchSize;
      setTimeout(loadBatch, delayMs);
    };
    loadBatch();
  }

  // ═══════════════════════════════════════
  // РЕНДЕР КАРТОЧКИ
  // ═══════════════════════════════════════

  /**
   * HTML одной карточки.
   * Использует imagePreviewUrl, если есть, иначе imageUrl, иначе плейсхолдер.
   * Название и автор проходят через Markdown-рендер (можно использовать **жирный**).
   * 
   * @param {Object} photo
   * @returns {string} HTML-строка
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
   * Экранировать HTML-сущности в строке.
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