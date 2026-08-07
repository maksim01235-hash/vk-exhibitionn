import Store from '../core/Store.js';
import EventBus from '../core/EventBus.js';
import ImagePreloader from '../utils/ImagePreloader.js';
import { renderMarkdown } from '../utils/markdown.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/** Количество видимых фото для немедленной загрузки */
const VISIBLE_COUNT = 6;

/** Количество фото для загрузки вблизи видимой области (в каждую сторону) */
const NEARBY_COUNT = 4;

/** Порог «близости» в пикселях (фото в этой зоне считаются nearby) */
const NEARBY_THRESHOLD = 600;

/** Задержка между пачками загрузки (мс) */
const BATCH_DELAY = 200;

class GalleryView {
  constructor() {
    this._grid = document.getElementById('gallery-grid');
    this._empty = document.getElementById('gallery-empty');
    this._initialized = false;
    this._loadedIndices = new Set();
    this._preloadQueue = [];
    this._preloadTimer = null;
  }

  render() {
    if (!this._grid || !this._empty) return;
    
    const photos = Store.getAllPhotos();
    
    if (photos.length === 0) {
      this._grid.innerHTML = '';
      this._grid.classList.add('hidden');
      this._empty.classList.remove('hidden');
      return;
    }

    this._empty.classList.add('hidden');
    this._grid.classList.remove('hidden');

    this._grid.innerHTML = photos.map(photo => this._renderCard(photo)).join('');

    this._grid.querySelectorAll('.gallery-card').forEach(card => {
      card.addEventListener('click', () => {
        EventBus.emit('router:openPhoto', card.dataset.photoId);
      });
    });

    if (!this._initialized) {
      this._grid.addEventListener('scroll', () => this._prioritizeLoad(photos), { passive: true });
      this._initialized = true;
    }

    // Первый приоритетный загруз
    this._prioritizeLoad(photos);
  }

  /**
   * Приоритетная загрузка: видимые → близкие → дальние.
   */
  _prioritizeLoad(photos) {
    const gridRect = this._grid.getBoundingClientRect();
    const cards = this._grid.querySelectorAll('.gallery-card');
    const total = photos.length;

    const visible = [];
    const nearby = [];
    const far = [];

    cards.forEach((card, index) => {
      if (this._loadedIndices.has(index)) return;

      const rect = card.getBoundingClientRect();
      const cardCenter = rect.top + rect.height / 2;
      const gridCenter = gridRect.top + gridRect.height / 2;
      const distance = Math.abs(cardCenter - gridCenter);

      if (distance < gridRect.height / 2 + 50) {
        // Видимо или почти видимо
        visible.push(index);
      } else if (distance < gridRect.height / 2 + NEARBY_THRESHOLD) {
        // Близко к видимой области
        nearby.push(index);
      } else {
        // Далеко
        far.push(index);
      }
    });

    // Строим очередь: видимые → близкие → дальние
    const queue = [
      ...visible.slice(0, VISIBLE_COUNT),
      ...nearby.slice(0, NEARBY_COUNT * 2),
      ...far,
    ];

    // Ограничиваем общее количество за раз
    const toLoad = queue.slice(0, VISIBLE_COUNT + NEARBY_COUNT * 2 + 10);

    toLoad.forEach(index => this._loadedIndices.add(index));

    const urls = toLoad
      .map(i => photos[i])
      .filter(Boolean)
      .map(p => p.imagePreviewUrl || p.imageUrl)
      .filter(Boolean);

    if (urls.length > 0) {
      this._preloadInBatches(urls);
    }
  }

  /**
   * Загрузить URL пачками.
   */
  _preloadInBatches(urls) {
    if (urls.length === 0) return;

    let i = 0;
    const batchSize = 2;

    const loadBatch = () => {
      const batch = urls.slice(i, i + batchSize);
      if (batch.length === 0) return;
      ImagePreloader.preloadAll(batch);
      i += batchSize;
      setTimeout(loadBatch, BATCH_DELAY);
    };

    loadBatch();
  }

  _renderCard(photo) {
    const imgSrc = photo.imagePreviewUrl || photo.imageUrl || 'assets/placeholder.jpg';
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