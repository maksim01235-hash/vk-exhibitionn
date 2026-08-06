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
    this._fullLoaded = false;
  }

  render(direction) {
    const photo = Store.getCurrentPhoto();
    if (!photo) return;
    
    const oldPhotoId = this._currentPhotoId;
    this._currentPhotoId = photo.id;

    const previewUrl = photo.imagePreviewUrl || photo.imageUrl;
    const fullUrl = photo.imageUrl || previewUrl;
    const hasPreview = previewUrl !== fullUrl;

    if (direction && oldPhotoId !== photo.id) {
      this._animateSwipe(direction, () => {
        this._showPhoto(previewUrl, fullUrl, hasPreview);
      });
    } else {
      this._showPhoto(previewUrl, fullUrl, hasPreview);
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

  _showPhoto(previewUrl, fullUrl, hasPreview) {
    this._fullLoaded = false;

    const fitWrapper = (naturalWidth, naturalHeight) => {
      if (!naturalWidth || !naturalHeight) return;
      const wrapperWidth = this._imageWrapper.clientWidth;
      const ratio = naturalHeight / naturalWidth;
      const maxHeight = window.innerHeight * 0.55;
      const h = Math.min(wrapperWidth * ratio, maxHeight);
      this._imageWrapper.style.height = h + 'px';
    };

    // Всегда показываем индикатор при загрузке
    if (!this._fullLoaded) {
      this._imageWrapper.classList.add('loading-full');
    }

    this._imageEl.style.opacity = '0';
    this._imageEl.src = previewUrl;

    const onPreviewLoaded = () => {
      if (!hasPreview) {
        if (this._imageEl.complete) {
          fitWrapper(this._imageEl.naturalWidth, this._imageEl.naturalHeight);
          this._imageEl.style.opacity = '1';
          this._imageWrapper.classList.remove('loading-full');
          this._fullLoaded = true;
        } else {
          this._imageEl.onload = () => {
            fitWrapper(this._imageEl.naturalWidth, this._imageEl.naturalHeight);
            this._imageEl.style.opacity = '1';
            this._imageWrapper.classList.remove('loading-full');
            this._fullLoaded = true;
          };
        }
        return;
      }

      ImagePreloader.preload(fullUrl).then((fullImgUrl) => {
        if (Store.getCurrentPhoto()?.id !== this._currentPhotoId) return;

        const tmp = new Image();
        tmp.onload = () => {
          if (Store.getCurrentPhoto()?.id !== this._currentPhotoId) return;
          fitWrapper(tmp.naturalWidth, tmp.naturalHeight);
          
          this._imageEl.style.opacity = '0';
          setTimeout(() => {
            if (Store.getCurrentPhoto()?.id !== this._currentPhotoId) return;
            this._imageEl.src = fullUrl;
            this._fullLoaded = true;
            this._imageWrapper.classList.remove('loading-full');
            
            if (this._imageEl.complete) {
              this._imageEl.style.opacity = '1';
            } else {
              this._imageEl.onload = () => { this._imageEl.style.opacity = '1'; };
            }
          }, 400);
        };
        tmp.onerror = () => {
          fitWrapper(this._imageEl.naturalWidth, this._imageEl.naturalHeight);
          this._imageEl.style.opacity = '1';
          this._imageWrapper.classList.remove('loading-full');
          this._fullLoaded = true;
        };
        tmp.src = fullUrl;
      });
    };

    if (this._imageEl.complete && this._imageEl.naturalWidth > 0) {
      onPreviewLoaded();
    } else {
      this._imageEl.onload = onPreviewLoaded;
      this._imageEl.onerror = onPreviewLoaded;
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
    console.log('Queue: urgent', urgent.length, 'deferred', deferred.length, 'total', this._preloadQueue.length);
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