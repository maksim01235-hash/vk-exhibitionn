import Store from '../core/Store.js';
import InfoPanel from './InfoPanel.js';
import SwipeManager from './SwipeManager.js';
import ImagePreloader from '../utils/ImagePreloader.js';
import FeedbackPrompt from '../utils/FeedbackPrompt.js';

class PhotoView {
  constructor() {
    this._imageEl = document.getElementById('photo-image');
    this._counterEl = document.getElementById('photo-counter');
    this._imageWrapper = document.getElementById('photo-image-wrapper');
    this._swipeManager = null;
    this._infoPanel = null;
    this._currentPhotoId = null;
    this._preloadQueue = [];
    this._preloadTimer = null;
  }

  render() {
    const photo = Store.getCurrentPhoto();
    if (!photo) return;

    this._clearPreloadQueue();
    this._currentPhotoId = photo.id;
        // Подсказка обратной связи
    FeedbackPrompt.onPhotoOpened(photo.id);

    const previewUrl = photo.imagePreviewUrl || photo.imageUrl;
    const fullUrl = photo.imageUrl || previewUrl;

    // 1. Сразу preview
    this._imageEl.src = previewUrl;

    // 2. Сразу начинаем грузить full, по готовности заменяем
    if (previewUrl !== fullUrl) {
      ImagePreloader.preload(fullUrl).then(() => {
        if (Store.getCurrentPhoto()?.id === this._currentPhotoId) {
          this._imageEl.src = fullUrl;
        }
      });
    }

    // 3. Строим очередь соседей
    this._buildNeighborsQueue();
    this._processQueue();

    // Счётчик
    const idx = Store.getCurrentIndex() + 1;
    const total = Store.getCount();
    this._counterEl.textContent = `${idx} из ${total}`;

    // Хеш
    const newHash = `#${photo.id}`;
    if (window.location.hash !== newHash) {
      history.replaceState(null, '', `/#${photo.id}`);
    }

    // Инфопанель
    if (!this._infoPanel) {
      this._infoPanel = new InfoPanel();
    }
    this._infoPanel.render(photo);

    // Свайпы
    if (!this._swipeManager) {
      this._swipeManager = new SwipeManager(
        document.getElementById('photo-screen'),
        () => { Store.next(); this.render(); },
        () => { Store.prev(); this.render(); }
      );
    }
  }

  _buildNeighborsQueue() {
    const allPhotos = Store.getAllPhotos();
    const currentIdx = Store.getCurrentIndex();
    const total = allPhotos.length;
    this._preloadQueue = [];

    for (let distance = 1; distance <= total / 2; distance++) {
      const nextIdx = (currentIdx + distance) % total;
      const prevIdx = (currentIdx - distance + total) % total;

      [prevIdx, nextIdx].forEach(idx => {
        const p = allPhotos[idx];
        if (!p) return;
        const pUrl = p.imagePreviewUrl || p.imageUrl;
        if (pUrl) {
          this._preloadQueue.push({ url: pUrl });
        }
      });

      [prevIdx, nextIdx].forEach(idx => {
        const p = allPhotos[idx];
        if (!p) return;
        const pUrl = p.imagePreviewUrl || p.imageUrl;
        const fUrl = p.imageUrl;
        if (fUrl && fUrl !== pUrl) {
          this._preloadQueue.push({ url: fUrl });
        }
      });
    }
  }

  _clearPreloadQueue() {
    this._preloadQueue = [];
    if (this._preloadTimer) {
      clearTimeout(this._preloadTimer);
      this._preloadTimer = null;
    }
  }

  _processQueue() {
    if (this._preloadQueue.length === 0) return;

    const item = this._preloadQueue.shift();
    
    ImagePreloader.preload(item.url);

    this._preloadTimer = setTimeout(() => this._processQueue(), 100);
  }
}

export default PhotoView;