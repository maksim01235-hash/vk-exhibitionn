/**
 * GalleryView — главный экран: сетка превью фотографий.
 * 
 * НАЗНАЧЕНИЕ:
 *   Отображает сетку карточек с превью, названиями и авторами.
 *   При клике — переход на экран фото.
 * 
 * КАК ЭТО РАБОТАЕТ:
 *   1. При первом render() строится DOM сетки (один раз за сессию)
 *   2. IntersectionObserver отслеживает попадание карточек в видимую область
 *   3. При попадании — URL добавляется в очередь пачковой загрузки
 *   4. Пачки грузятся с задержкой BATCH_DELAY
 *   5. При повторных render() DOM не пересоздаётся
 * 
 * РАСШИРЕНИЕ:
 *   — Группировка по категориям (фильтры/вкладки)
 *   — Виртуальный скролл для сотен фото
 *   — Режимы отображения: сетка / список
 */

import Store from '../core/Store.js';
import EventBus from '../core/EventBus.js';
import ImagePreloader from '../utils/ImagePreloader.js';
import { renderMarkdown } from '../utils/markdown.js';
import { createLogger } from '../utils/Logger.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/** Включить логирование */
const DEBUG = true;

/**
 * Размер пачки для фоновой загрузки.
 * Сколько URL грузить одновременно. Увеличить — быстрее, уменьшить — экономнее.
 */
const BATCH_SIZE = 10;

/**
 * Задержка между пачками загрузки (мс).
 * Чтобы не нагружать сеть одновременными запросами.
 */
const BATCH_DELAY = 50;

/**
 * Настройки IntersectionObserver.
 * rootMargin: '600px' — загружаем за 600px до попадания в экран.
 * threshold: 0.01 — достаточно 1% видимости.
 */
const OBSERVER_OPTIONS = {
  rootMargin: '600px',
  threshold: 0.01,
};

/** Заглушка если нет ни preview, ни full */
const PLACEHOLDER_URL = 'assets/placeholder.webp';

// ═══════════════════════════════════════
// ЛОГГЕР
// ═══════════════════════════════════════

const log = createLogger('Gallery', DEBUG);

class GalleryView {
  constructor() {
    this._grid = document.getElementById('gallery-grid');
    this._empty = document.getElementById('gallery-empty');
    this._rendered = false;
    this._observer = null;
    this._batchQueue = [];
    this._batchTimer = null;
    log('создан');
  }

  // ═══════════════════════════════════════
  // ПУБЛИЧНЫЙ API
  // ═══════════════════════════════════════

  render() {
    if (!this._grid || !this._empty) return;

    const photos = Store.getAllPhotos();

    if (photos.length === 0) {
      this._grid.innerHTML = '';
      this._grid.classList.add('hidden');
      this._empty.classList.remove('hidden');
      this._rendered = false;
      log('нет фото — заглушка');
      return;
    }

    this._empty.classList.add('hidden');
    this._grid.classList.remove('hidden');

    if (!this._rendered) {
      log(`построение DOM для ${photos.length} фото`);
      this._grid.innerHTML = photos.map(photo => this._renderCard(photo)).join('');

      this._grid.querySelectorAll('.gallery-card').forEach(card => {
        card.addEventListener('click', () => {
          EventBus.emit('router:openPhoto', card.dataset.photoId);
        });
      });

      this._setupObserver(photos);
      this._rendered = true;
    } else {
      log('DOM уже построен, только показываю');
    }
  }

  // ═══════════════════════════════════════
  // ЗАГРУЗКА ПРЕВЬЮ
  // ═══════════════════════════════════════

  _setupObserver(photos) {
    if (this._observer) {
      this._observer.disconnect();
    }

    let loadedCount = 0;

    this._observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const index = parseInt(entry.target.dataset.index);
          const photo = photos[index];
          if (photo) {
            const url = photo.imagePreviewUrl || photo.imageUrl;
            if (url) {
              this._addToBatch(url);
              loadedCount++;
            }
          }
          this._observer.unobserve(entry.target);
        }
      });
      if (loadedCount > 0 && loadedCount % 10 === 0) {
        log(`загружено превью: ${loadedCount}/${photos.length}`);
      }
    }, OBSERVER_OPTIONS);

    this._grid.querySelectorAll('.gallery-card').forEach((card, index) => {
      card.dataset.index = index;
      this._observer.observe(card);
    });

    log(`наблюдение за ${photos.length} карточками`);
  }

  _addToBatch(url) {
    this._batchQueue.push(url);
    if (!this._batchTimer) {
      this._batchTimer = setTimeout(() => this._processBatch(), BATCH_DELAY);
    }
  }

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

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

export default GalleryView;