import Store from '../core/Store.js';
import EventBus from '../core/EventBus.js';
import ImagePreloader from '../utils/ImagePreloader.js';
import { renderMarkdown } from '../utils/markdown.js';

const VISIBLE_COUNT = 6;
const NEARBY_COUNT = 4;
const NEARBY_THRESHOLD = 600;
const BATCH_DELAY = 200;

class GalleryView {
  constructor() {
    this._grid = document.getElementById('gallery-grid');
    this._empty = document.getElementById('gallery-empty');
    this._initialized = false;
    this._loadedIndices = new Set();
    this._preloadQueue = [];
    this._preloadTimer = null;
    this._scrollTimer = null;
    this._rendered = false;  // ← флаг что грид уже построен
  }

  render() {
    if (!this._grid || !this._empty) return;
    
    const photos = Store.getAllPhotos();
    
    if (photos.length === 0) {
      this._grid.innerHTML = '';
      this._grid.classList.add('hidden');
      this._empty.classList.remove('hidden');
      this._rendered = false;
      return;
    }

    this._empty.classList.add('hidden');
    this._grid.classList.remove('hidden');

    // Строим грид только один раз
    if (!this._rendered) {
      this._grid.innerHTML = photos.map(photo => this._renderCard(photo)).join('');

      this._grid.querySelectorAll('.gallery-card').forEach(card => {
        card.addEventListener('click', () => {
          EventBus.emit('router:openPhoto', card.dataset.photoId);
        });
      });

      this._grid.addEventListener('scroll', () => {
        if (this._scrollTimer) clearTimeout(this._scrollTimer);
        this._scrollTimer = setTimeout(() => this._prioritizeLoad(photos), 150);
      }, { passive: true });

      this._rendered = true;
    }

    // Приоритетная загрузка — без setTimeout, один раз при открытии
    if (this._loadedIndices.size === 0) {
      this._prioritizeLoad(photos);
    }
  }

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
        visible.push(index);
      } else if (distance < gridRect.height / 2 + NEARBY_THRESHOLD) {
        nearby.push(index);
      } else {
        far.push(index);
      }
    });

    const queue = [
      ...visible.slice(0, VISIBLE_COUNT),
      ...nearby.slice(0, NEARBY_COUNT * 2),
      ...far,
    ];

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