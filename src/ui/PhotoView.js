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
    this._loadId = 0; // Счётчик загрузок для отслеживания гонки
  }

  render(direction) {
    const photo = Store.getCurrentPhoto();
    if (!photo) return;
    
    // Если то же фото и уже загружается/загружено — не перерендериваем
    if (!direction && this._currentPhotoId === photo.id) return;
    
    this._currentPhotoId = photo.id;
    this._loadId++;

    const previewUrl = photo.imagePreviewUrl || photo.imageUrl;
    const fullUrl = photo.imageUrl || previewUrl;
    const hasPreview = previewUrl !== fullUrl;

    if (direction) {
      this._animateSwipe(direction, () => {
        this._showPhoto(previewUrl, fullUrl, hasPreview, this._loadId);
      });
    } else {
      this._showPhoto(previewUrl, fullUrl, hasPreview, this._loadId);
    }

    this._buildNeighborsQueue();
    this._processQueue();

    FeedbackPrompt.onPhotoOpened(photo.id);

    const idx = Store.getCurrentIndex() + 1;
    const total = Store.getCount();
    this._counterEl.textContent = `${idx} из ${total}`;

    const newHash = `#${photo.id}`;
    if (window.location.hash !== newHash) {
      history.replaceState(null, '', `/#${photo.id}`);
    }

    if (!this._infoPanel) this._infoPanel = new InfoPanel();
    this._infoPanel.render(photo);

    if (!this._swipeManager) {
      this._swipeManager = new SwipeManager(
        document.getElementById('photo-screen'),
        () => { Store.next(); this.render('left'); },
        () => { Store.prev(); this.render('right'); }
      );
    }
  }

  _showPhoto(previewUrl, fullUrl, hasPreview, loadId) {
    const fitWrapper = () => {
      const img = this._imageEl;
      if (!img.naturalWidth || !img.naturalHeight) return;
      const ratio = img.naturalHeight / img.naturalWidth;
      const maxHeight = window.innerHeight * 0.55;
      const h = Math.min(this._imageWrapper.clientWidth * ratio, maxHeight);
      this._imageWrapper.style.height = h + 'px';
    };

    this._imageWrapper.classList.add('loading-full');
    this._imageEl.style.opacity = '0';

    // Загружаем preview
    const tempImg = new Image();
    tempImg.onload = () => {
      if (loadId !== this._loadId) return; // Устарело
      this._imageEl.src = previewUrl;
      fitWrapper();
      this._imageEl.style.opacity = '1';

      if (!hasPreview) {
        this._imageWrapper.classList.remove('loading-full');
        return;
      }

      // Загружаем full
      const fullImg = new Image();
      fullImg.onload = () => {
        if (loadId !== this._loadId) return;
        this._imageEl.style.opacity = '0';
        setTimeout(() => {
          if (loadId !== this._loadId) return;
          this._imageEl.src = fullUrl;
          fitWrapper();
          this._imageEl.style.opacity = '1';
          this._imageWrapper.classList.remove('loading-full');
        }, 300);
      };
      fullImg.onerror = () => {
        if (loadId !== this._loadId) return;
        this._imageWrapper.classList.remove('loading-full');
      };
      fullImg.src = fullUrl;
    };
    tempImg.onerror = () => {
      if (loadId !== this._loadId) return;
      this._imageEl.style.opacity = '1';
      this._imageWrapper.classList.remove('loading-full');
    };
    tempImg.src = previewUrl;
  }

  _animateSwipe(direction, callback) {
    const wrapper = this._imageWrapper;
    const offset = direction === 'left' ? '-25px' : '25px';
    wrapper.style.transition = 'transform 0.2s ease, opacity 0.15s';
    wrapper.style.transform = `translateX(${offset})`;
    wrapper.style.opacity = '0';
    
    setTimeout(() => {
      callback();
      
      wrapper.style.transition = 'none';
      wrapper.style.transform = `translateX(${direction === 'left' ? '15px' : '-15px'})`;
      
      requestAnimationFrame(() => {
        wrapper.style.transition = 'transform 0.2s ease, opacity 0.2s';
        wrapper.style.transform = 'translateX(0)';
        wrapper.style.opacity = '1';
      });
    }, 180);
  }

  _buildNeighborsQueue() {
    const allPhotos = Store.getAllPhotos();
    const currentIdx = Store.getCurrentIndex();
    const total = allPhotos.length;

    this._clearPreloadQueue();

    const urgent = [];
    const deferred = [];

    const current = allPhotos[currentIdx];
    if (current?.imageUrl && current.imageUrl !== (current.imagePreviewUrl || current.imageUrl)) {
      urgent.push({ url: current.imageUrl });
    }

    const closeDistances = [1, -1, 2, -2];
    closeDistances.forEach(d => {
      const idx = (currentIdx + d + total) % total;
      const p = allPhotos[idx];
      if (!p) return;
      const pUrl = p.imagePreviewUrl || p.imageUrl;
      if (pUrl) urgent.push({ url: pUrl });
    });
    closeDistances.forEach(d => {
      const idx = (currentIdx + d + total) % total;
      const p = allPhotos[idx];
      if (!p) return;
      if (p.imageUrl && p.imageUrl !== (p.imagePreviewUrl || p.imageUrl)) {
        urgent.push({ url: p.imageUrl });
      }
    });

    for (let d = 3; d <= 5; d++) {
      [d, -d].forEach(dist => {
        const idx = (currentIdx + dist + total) % total;
        const p = allPhotos[idx];
        if (!p) return;
        const pUrl = p.imagePreviewUrl || p.imageUrl;
        if (pUrl) deferred.push({ url: pUrl });
        if (p.imageUrl && p.imageUrl !== (p.imagePreviewUrl || p.imageUrl)) {
          deferred.push({ url: p.imageUrl });
        }
      });
    }

    this._preloadQueue = [...urgent, ...deferred];
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