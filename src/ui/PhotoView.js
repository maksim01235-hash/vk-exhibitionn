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
    this._currentPhotoId = null;
  }

  render() {
    const photo = Store.getCurrentPhoto();
    if (!photo) return;

    this._currentPhotoId = photo.id;

    // Сначала показываем preview (быстро), потом подгружаем full
    const previewUrl = photo.imagePreviewUrl || photo.imageUrl;
    const fullUrl = photo.imageUrl || previewUrl;
    
    if (this._imageEl.src !== previewUrl) {
      this._imageEl.src = previewUrl;
      
      // Если preview и full отличаются — подгружаем full в фоне
      if (previewUrl !== fullUrl) {
        ImagePreloader.preload(fullUrl).then(() => {
          // Проверяем, что мы всё ещё на этом же фото
          if (Store.getCurrentPhoto()?.id === this._currentPhotoId) {
            this._imageEl.src = fullUrl;
          }
        });
      }
    }

    // Счётчик
    const idx = Store.getCurrentIndex() + 1;
    const total = Store.getCount();
    this._counterEl.textContent = `${idx} из ${total}`;

    // Обновляем хеш в URL
    const newHash = `#${photo.id}`;
    if (window.location.hash !== newHash) {
      history.replaceState(null, '', `/#${photo.id}`);
    }

    // Панель информации
    if (!this._infoPanel) {
      this._infoPanel = new InfoPanel();
    }
    this._infoPanel.render(photo);

    // Предзагружаем соседей: сначала preview, потом full
    this._preloadNeighbors();

    // Свайпы
    if (!this._swipeManager) {
      this._swipeManager = new SwipeManager(
        document.getElementById('photo-screen'),
        () => { Store.next(); this.render(); },
        () => { Store.prev(); this.render(); }
      );
    }
  }

  _preloadNeighbors() {
    const allPhotos = Store.getAllPhotos();
    const currentIdx = Store.getCurrentIndex();
    
    const neighborPreviewUrls = [];
    const neighborFullUrls = [];

    for (let i = 1; i <= 2; i++) {
      const nextIdx = (currentIdx + i) % allPhotos.length;
      const prevIdx = (currentIdx - i + allPhotos.length) % allPhotos.length;
      
      [allPhotos[nextIdx], allPhotos[prevIdx]].forEach(p => {
        if (!p) return;
        // Превью
        const previewUrl = p.imagePreviewUrl || p.imageUrl;
        if (previewUrl) neighborPreviewUrls.push(previewUrl);
        // Полный размер (если отличается от превью)
        if (p.imageUrl && p.imageUrl !== previewUrl) {
          neighborFullUrls.push(p.imageUrl);
        }
      });
    }

    // Приоритет: превью соседей сейчас, полные версии — в фоне
    ImagePreloader.preloadWithPriority(neighborPreviewUrls, neighborFullUrls);
  }
}

export default PhotoView;