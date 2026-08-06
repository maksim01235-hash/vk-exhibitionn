import Store from '../core/Store.js';
import InfoPanel from './InfoPanel.js';
import SwipeManager from './SwipeManager.js';
import ImagePreloader from '../utils/ImagePreloader.js';
import FeedbackPrompt from '../utils/FeedbackPrompt.js';

class PhotoView {
  constructor() {
    this._imageEl = document.getElementById('photo-image');
    this._imageNextEl = document.getElementById('photo-image-next');
    this._counterEl = document.getElementById('photo-counter');
    this._imageWrapper = document.getElementById('photo-image-wrapper');
    this._swipeManager = null;
    this._infoPanel = null;
    this._currentPhotoId = null;
    this._preloadQueue = [];
    this._preloadTimer = null;
    this._activeLayer = 'image';
  }

  render(direction) {
    const photo = Store.getCurrentPhoto();
    if (!photo) return;
    
    const oldPhotoId = this._currentPhotoId;
    this._currentPhotoId = photo.id;

    const previewUrl = photo.imagePreviewUrl || photo.imageUrl;
    const fullUrl = photo.imageUrl || previewUrl;

    if (direction && oldPhotoId !== photo.id) {
      this._animateSwipe(direction, () => {
        this._showPhoto(previewUrl, fullUrl);
      });
    } else {
      this._showPhoto(previewUrl, fullUrl);
    }

    // Перестраиваем очередь под новое текущее фото
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

  _showPhoto(previewUrl, fullUrl) {
    const showLayer = this._activeLayer === 'image' ? this._imageNextEl : this._imageEl;
    const hideLayer = this._activeLayer === 'image' ? this._imageEl : this._imageNextEl;

    const fitWrapper = (img) => {
      if (!img.naturalWidth || !img.naturalHeight) {
        this._imageWrapper.style.height = 'auto';
        return;
      }
      const wrapperWidth = this._imageWrapper.clientWidth;
      const ratio = img.naturalHeight / img.naturalWidth;
      const naturalHeight = wrapperWidth * ratio;
      const maxHeight = window.innerHeight * 0.55;
      this._imageWrapper.style.height = Math.min(naturalHeight, maxHeight) + 'px';
    };

    showLayer.src = previewUrl;
    
    const showPreview = () => {
      fitWrapper(showLayer);
      showLayer.style.opacity = '1';
      hideLayer.style.opacity = '0';
      this._activeLayer = this._activeLayer === 'image' ? 'imageNext' : 'image';
    };

    if (showLayer.complete && showLayer.naturalWidth > 0) {
      showPreview();
    } else {
      showLayer.onload = showPreview;
      showLayer.onerror = showPreview;
    }

    if (fullUrl !== previewUrl) {
      ImagePreloader.preload(fullUrl).then(() => {
        if (Store.getCurrentPhoto()?.id !== this._currentPhotoId) return;
        
        hideLayer.src = fullUrl;
        
        const showFull = () => {
          fitWrapper(hideLayer);
          hideLayer.style.opacity = '1';
          showLayer.style.opacity = '0';
          this._activeLayer = this._activeLayer === 'image' ? 'imageNext' : 'image';
        };

        if (hideLayer.complete && hideLayer.naturalWidth > 0) {
          showFull();
        } else {
          hideLayer.onload = showFull;
          hideLayer.onerror = showFull;
        }
      });
    }
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

    // Очищаем старую очередь
    this._clearPreloadQueue();

    const urgent = [];
    const deferred = [];

    // Текущее фото: полный размер — СРОЧНО
    const current = allPhotos[currentIdx];
    if (current?.imageUrl && current.imageUrl !== (current.imagePreviewUrl || current.imageUrl)) {
      urgent.push({ url: current.imageUrl });
    }

    // Ближайшие соседи: 1 и 2 в обе стороны
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

    // Дальние соседи: 3-5
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
    console.log('Queue: urgent', urgent.length, 'deferred', deferred.length, 'total', this._preloadQueue.length);
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
    console.log('Preload:', item.url.substring(item.url.lastIndexOf('/') + 1).substring(0, 40));
    ImagePreloader.preload(item.url);
    this._preloadTimer = setTimeout(() => this._processQueue(), 100);
  }
}

export default PhotoView;