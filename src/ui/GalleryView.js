import Store from '../core/Store.js';
import EventBus from '../core/EventBus.js';
import ImagePreloader from '../utils/ImagePreloader.js';

class GalleryView {
  constructor() {
    this._grid = document.getElementById('gallery-grid');
    this._empty = document.getElementById('gallery-empty');
  }

  render() {
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

    // Навешиваем обработчики
    this._grid.querySelectorAll('.gallery-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.photoId;
        EventBus.emit('router:openPhoto', id);
      });
    });

    // Предзагружаем первые 10 изображений в фоне
    const urls = photos.slice(0, 10).map(p => p.imageUrl).filter(Boolean);
    ImagePreloader.preloadAll(urls);
  }

  _renderCard(photo) {
    const imgSrc = photo.imageUrl || 'assets/placeholder.jpg';
    return `
      <div class="gallery-card" data-photo-id="${photo.id}">
        <div class="gallery-card-image">
          <img src="${imgSrc}" alt="${this._escape(photo.title || '')}" loading="lazy" />
        </div>
        <div class="gallery-card-info">
          <div class="gallery-card-title">${this._escape(photo.title || 'Без названия')}</div>
          ${photo.photographer ? `<div class="gallery-card-author">${this._escape(photo.photographer)}</div>` : ''}
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