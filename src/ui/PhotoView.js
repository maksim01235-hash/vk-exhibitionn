/**
 * PhotoView — экран фотографии.
 */

import Store from '../core/Store.js';
import InfoPanel from './InfoPanel.js';
import SwipeManager, { DIRECTION } from './SwipeManager.js';
import ImagePreloader from '../utils/ImagePreloader.js';
import FeedbackPrompt from '../utils/FeedbackPrompt.js';

const MAX_IMAGE_HEIGHT_RATIO = 0.55;
const FULL_FADE_DURATION = 300;

const SWIPE_THRESHOLD = 80;
const SWIPE_RETURN_DURATION = 300;
const SWIPE_EXIT_DURATION = 250;
const SWIPE_ENTER_DURATION = 300;
const SWIPE_FOLLOW_RATIO = 1.0;

const PRELOAD_INTERVAL = 100;
const CLOSE_NEIGHBORS = 2;
const FAR_NEIGHBORS_START = 3;
const FAR_NEIGHBORS_END = 5;

const LOADING_CLASS = 'loading-full';

class PhotoView {
  constructor() {
    this._imageEl = document.getElementById('photo-image');
    this._counterEl = document.getElementById('photo-counter');
    this._imageWrapper = document.getElementById('photo-image-wrapper');
    this._photoContainer = document.querySelector('.photo-container');
    this._swipeManager = null;
    this._infoPanel = null;
    this._currentPhotoId = null;
    this._preloadQueue = [];
    this._preloadTimer = null;
    this._loadId = 0;
    this._settling = false;

    this._handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        this.resetSwipe();
      }
    };
    document.addEventListener('visibilitychange', this._handleVisibilityChange);
  }

  render(direction) {
    const photo = Store.getCurrentPhoto();
    if (!photo) return;

    if (!direction && this._currentPhotoId === photo.id) return;

    this._currentPhotoId = photo.id;
    this._loadId++;

    const previewUrl = photo.imagePreviewUrl || photo.imageUrl;
    const fullUrl = photo.imageUrl || previewUrl;
    const hasPreview = previewUrl !== fullUrl;

    this._showPhoto(previewUrl, fullUrl, hasPreview, this._loadId);
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
      this._setupSwipeManager();
    }
  }

  resetSwipe() {
    this._settling = false;
    if (this._photoContainer) {
      this._photoContainer.style.transition = 'none';
      this._photoContainer.style.transform = '';
    }
    if (this._swipeManager) {
      this._swipeManager.cancel();
    }
  }

  _setupSwipeManager() {
    const screen = document.getElementById('photo-screen');

    this._swipeManager = new SwipeManager(screen, {
      threshold: SWIPE_THRESHOLD,

      onMove: (offsetX, offsetY, direction) => {
        if (this._settling) return;
        if (direction === DIRECTION.LEFT || direction === DIRECTION.RIGHT) {
          this._setContentOffset(offsetX * SWIPE_FOLLOW_RATIO, 0);
        }
      },

      onSwipeLeft: () => {
        if (this._settling) return;
        this._settling = true;
        this._animateExitAndEnter('left', () => {
          Store.next();
          this.render('left');
        });
      },

      onSwipeRight: () => {
        if (this._settling) return;
        this._settling = true;
        this._animateExitAndEnter('right', () => {
          Store.prev();
          this.render('right');
        });
      },

      onRelease: (direction) => {
        if (this._settling) return;
        if (!direction) {
          this._settling = true;
          this._animateContentTo(0, 0, SWIPE_RETURN_DURATION, () => {
            this._settling = false;
          });
        }
      },
    });
  }

  _setContentOffset(x, y) {
    if (!this._photoContainer) return;
    this._photoContainer.style.transition = 'none';
    this._photoContainer.style.transform = `translateX(${x}px) translateY(${y}px)`;
  }

  _animateContentTo(x, y, duration, callback) {
    if (!this._photoContainer) return;
    this._photoContainer.style.transition = `transform ${duration}ms ease`;
    this._photoContainer.style.transform = `translateX(${x}px) translateY(${y}px)`;

    if (callback) {
      let fired = false;
      const onEnd = () => {
        if (fired) return;
        fired = true;
        this._photoContainer.removeEventListener('transitionend', onEnd);
        clearTimeout(fallbackTimer);
        callback();
      };
      const fallbackTimer = setTimeout(onEnd, duration + 100);
      this._photoContainer.addEventListener('transitionend', onEnd);
    }
  }

  _animateExitAndEnter(direction, updateFn) {
    if (!this._photoContainer) return;

    const screenWidth = window.innerWidth;
    const exitX = direction === 'left' ? -screenWidth : screenWidth;

    const safetyTimer = setTimeout(() => {
      console.warn('PhotoView: анимация свайпа зависла, сброс');
      this.resetSwipe();
    }, 2000);

    this._animateContentTo(exitX, 0, SWIPE_EXIT_DURATION, () => {
      this._photoContainer.style.transition = 'none';
      this._photoContainer.style.transform = `translateX(${-exitX}px)`;

      updateFn();

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this._animateContentTo(0, 0, SWIPE_ENTER_DURATION, () => {
            clearTimeout(safetyTimer);
            this._settling = false;
          });
        });
      });
    });
  }

  _showPhoto(previewUrl, fullUrl, hasPreview, loadId) {
    const fitWrapper = () => {
      const img = this._imageEl;
      if (!img.naturalWidth || !img.naturalHeight) return;
      const ratio = img.naturalHeight / img.naturalWidth;
      const maxHeight = window.innerHeight * MAX_IMAGE_HEIGHT_RATIO;
      const h = Math.min(this._imageWrapper.clientWidth * ratio, maxHeight);
      this._imageWrapper.style.height = h + 'px';
    };

    this._imageWrapper.classList.add(LOADING_CLASS);
    this._imageEl.style.opacity = '0';

    const tempImg = new Image();
    tempImg.onload = () => {
      if (loadId !== this._loadId) return;
      this._imageEl.src = previewUrl;
      fitWrapper();
      this._imageEl.style.opacity = '1';

      if (!hasPreview) {
        this._imageWrapper.classList.remove(LOADING_CLASS);
        return;
      }

      const fullImg = new Image();
      fullImg.onload = () => {
        if (loadId !== this._loadId) return;
        this._imageEl.style.opacity = '0';
        setTimeout(() => {
          if (loadId !== this._loadId) return;
          this._imageEl.src = fullUrl;
          fitWrapper();
          this._imageEl.style.opacity = '1';
          this._imageWrapper.classList.remove(LOADING_CLASS);
        }, FULL_FADE_DURATION);
      };
      fullImg.onerror = () => {
        if (loadId !== this._loadId) return;
        this._imageWrapper.classList.remove(LOADING_CLASS);
      };
      fullImg.src = fullUrl;
    };
    tempImg.onerror = () => {
      if (loadId !== this._loadId) return;
      this._imageEl.style.opacity = '1';
      this._imageWrapper.classList.remove(LOADING_CLASS);
    };
    tempImg.src = previewUrl;
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

    for (let d = 1; d <= CLOSE_NEIGHBORS; d++) {
      [d, -d].forEach(dist => {
        const idx = (currentIdx + dist + total) % total;
        const p = allPhotos[idx];
        if (!p) return;
        const pUrl = p.imagePreviewUrl || p.imageUrl;
        if (pUrl) urgent.push({ url: pUrl });
        if (p.imageUrl && p.imageUrl !== (p.imagePreviewUrl || p.imageUrl)) {
          urgent.push({ url: p.imageUrl });
        }
      });
    }

    for (let d = FAR_NEIGHBORS_START; d <= FAR_NEIGHBORS_END; d++) {
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
    this._preloadTimer = setTimeout(() => this._processQueue(), PRELOAD_INTERVAL);
  }
}

export default PhotoView;