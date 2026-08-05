import Store from '../core/Store.js';
import InfoPanel from './InfoPanel.js';
import SwipeManager from './SwipeManager.js';
import ImagePreloader from '../utils/ImagePreloader.js';

class PhotoView {
  constructor() {
    this._imageEl = document.getElementById('photo-image');
    this._counterEl = document.getElementById('photo-counter');
    this._imageWrapper = document.getElementById('photo-image-wrapper');
    this._swipeManager = null;
    this._infoPanel = null;
  }

  render() {
    const photo = Store.getCurrentPhoto();
    if (!photo) return;

    // Изображение
    const url = photo.imageUrl || 'assets/placeholder.jpg';
    if (this._imageEl.src !== url) {
      this._imageEl.src = url;
    }

    // Счётчик
    const idx = Store.getCurrentIndex() + 1;
    const total = Store.getCount();
    this._counterEl.textContent = `${idx} из ${total}`;

    // Обновляем query-параметр в URL
    const newUrl = `?photo=${photo.id}`;
    if (window.location.search !== newUrl) {
      history.replaceState(null, '', newUrl);
    }

    // Панель информации
    if (!this._infoPanel) {
      this._infoPanel = new InfoPanel();
    }
    this._infoPanel.render(photo);

    // Предзагружаем соседние изображения
    this._preloadNeighbors();

    // Свайпы
    if (!this._swipeManager) {
      this._swipeManager = new SwipeManager(
        document.getElementById('photo-screen'),
        () => {
          Store.next();
          this.render();
        },
        () => {
          Store.prev();
          this.render();
        }
      );
    }
  }

  _preloadNeighbors() {
    const allPhotos = Store.getAllPhotos();
    const currentIdx = Store.getCurrentIndex();
    const urls = [];

    for (let i = 1; i <= 2; i++) {
      const nextIdx = (currentIdx + i) % allPhotos.length;
      const prevIdx = (currentIdx - i + allPhotos.length) % allPhotos.length;
      
      if (allPhotos[nextIdx] && allPhotos[nextIdx].imageUrl) {
        urls.push(allPhotos[nextIdx].imageUrl);
      }
      if (allPhotos[prevIdx] && allPhotos[prevIdx].imageUrl) {
        urls.push(allPhotos[prevIdx].imageUrl);
      }
    }

    ImagePreloader.preloadAll(urls);
  }
}

export default PhotoView;