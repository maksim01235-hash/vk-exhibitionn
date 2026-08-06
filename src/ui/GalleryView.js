import Store from '../core/Store.js';
import EventBus from '../core/EventBus.js';
import ImagePreloader from '../utils/ImagePreloader.js';
import { renderMarkdown } from '../utils/markdown.js';

class GalleryView {
  constructor() {
    this._grid = document.getElementById('gallery-grid');
    this._empty = document.getElementById('gallery-empty');
    this._allPreviewsLoaded = false;
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
        const id = card.dataset.photoId;
        EventBus.emit('router:openPhoto', id);
      });
    });

    if (!this._allPreviewsLoaded) {
      this._allPreviewsLoaded = true;
      const previewUrls = photos.map(p => p.imagePreviewUrl || p.imageUrl).filter(Boolean);
      this._preloadInBatches(previewUrls, 2, 200);
    }
  }

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