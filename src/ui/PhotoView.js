/**
 * PhotoView — экран фотографии (слайдер с тремя слайдами).
 */

import Store from '../core/Store.js';
import InfoPanel from './InfoPanel.js';
import SwipeManager, { DIRECTION } from './SwipeManager.js';
import ImagePreloader from '../utils/ImagePreloader.js';
import FeedbackPrompt from '../utils/FeedbackPrompt.js';

const FULL_FADE_DURATION = 300;
const SWIPE_THRESHOLD = 80;
const SWIPE_FOLLOW_RATIO = 1.0;
const SWIPE_RETURN_DURATION = 300;
const SWIPE_EXIT_DURATION = 250;

const TRACK_LEFT = -200;
const TRACK_CENTER = -100;
const TRACK_RIGHT = 0;

const PRELOAD_INTERVAL = 100;
const CLOSE_NEIGHBORS = 2;
const FAR_NEIGHBORS_START = 3;
const FAR_NEIGHBORS_END = 5;

const LOADING_CLASS = 'loading-full';

class PhotoView {
  constructor() {
    this._prevSideIndex = -1;
    this._nextSideIndex = -1;
    this._track = document.querySelector('.slides-track');
    this._slideLeft = document.querySelector('.slide-left .slide-content');
    this._slideCenter = document.querySelector('.slide-center .slide-content');
    this._slideRight = document.querySelector('.slide-right .slide-content');

    this._centerWrapper = document.querySelector('.slide-center .photo-image-wrapper');
    this._centerImage = document.querySelector('.slide-center .photo-image-wrapper img');

    this._counterEl = document.getElementById('photo-counter');

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

    this._hideCenterText();

    if (direction) {
      this._loadPhotoFromSide(previewUrl, fullUrl, hasPreview);
    } else {
      this._loadPhotoFromGallery(previewUrl, fullUrl, hasPreview);
    }

    if (!this._infoPanel) this._infoPanel = new InfoPanel();
    this._infoPanel.render(photo);

    this._updateSideSlides();
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

    if (!this._swipeManager) {
      this._setupSwipeManager();
    }

    this._resetTrackToCenter();

    requestAnimationFrame(() => {
      this._revealCenterText();
    });
  }

  resetSwipe() {
    this._settling = false;
    this._resetTrackToCenter();
    if (this._swipeManager) {
      this._swipeManager.cancel();
    }
  }

  _hideCenterText() {
    const info = document.querySelector('.slide-center .photo-info');
    if (!info) return;
    info.style.transition = 'none';
    info.classList.remove('revealed');
    info.offsetHeight;
    info.style.transition = '';
  }

  _revealCenterText() {
    const info = document.querySelector('.slide-center .photo-info');
    if (!info) return;
    info.classList.add('revealed');
  }

  _loadPhotoFromGallery(previewUrl, fullUrl, hasPreview) {
    if (!this._centerImage || !this._centerWrapper) return;

    this._centerImage.style.opacity = '0';
    this._centerImage.src = previewUrl;
    this._centerWrapper.classList.add(LOADING_CLASS);

    const showPreview = () => {
      if (!this._centerImage) return;
      this._centerImage.style.opacity = '1';
    };

    if (this._centerImage.complete && this._centerImage.naturalWidth > 0) {
      showPreview();
    } else {
      this._centerImage.onload = showPreview;
      this._centerImage.onerror = showPreview;
    }

    if (!hasPreview) {
      this._centerWrapper.classList.remove(LOADING_CLASS);
      return;
    }

    const fullImg = new Image();
    fullImg.onload = () => this._applyFull(fullUrl);
    fullImg.onerror = () => this._centerWrapper?.classList.remove(LOADING_CLASS);
    fullImg.src = fullUrl;
  }

  _loadPhotoFromSide(previewUrl, fullUrl, hasPreview) {
    if (!this._centerImage || !this._centerWrapper) return;

    this._centerImage.style.opacity = '0';
    this._centerImage.src = previewUrl;
    this._centerWrapper.classList.remove(LOADING_CLASS);

    const showPreview = () => {
      if (!this._centerImage) return;
      this._centerImage.style.opacity = '1';
    };

    if (this._centerImage.complete && this._centerImage.naturalWidth > 0) {
      showPreview();
    } else {
      this._centerImage.onload = showPreview;
      this._centerImage.onerror = showPreview;
    }

    if (!hasPreview) return;

    this._centerWrapper.classList.add(LOADING_CLASS);

    const fullImg = new Image();
    fullImg.onload = () => this._applyFull(fullUrl);
    fullImg.onerror = () => this._centerWrapper?.classList.remove(LOADING_CLASS);
    fullImg.src = fullUrl;
  }

  _applyFull(fullUrl) {
    if (!this._centerImage || !this._centerWrapper) return;
    this._centerImage.style.opacity = '0';
    setTimeout(() => {
      if (!this._centerImage || !this._centerWrapper) return;
      this._centerImage.src = fullUrl;
      this._centerImage.style.opacity = '1';
      this._centerWrapper.classList.remove(LOADING_CLASS);
    }, FULL_FADE_DURATION);
  }

  _updateSideSlides() {
    const allPhotos = Store.getAllPhotos();
    const currentIdx = Store.getCurrentIndex();
    const total = allPhotos.length;

    const prevIdx = (currentIdx - 1 + total) % total;
    const nextIdx = (currentIdx + 1) % total;

    // Пересоздаём только если индексы изменились
    if (this._slideLeft && this._prevSideIndex !== prevIdx) {
      this._prevSideIndex = prevIdx;
      this._slideLeft.innerHTML = '';
      this._buildSlideDOM(this._slideLeft, allPhotos[prevIdx]);
    }
    if (this._slideRight && this._nextSideIndex !== nextIdx) {
      this._nextSideIndex = nextIdx;
      this._slideRight.innerHTML = '';
      this._buildSlideDOM(this._slideRight, allPhotos[nextIdx]);
    }
  }

  _buildSlideDOM(container, photo) {
    if (!photo) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'photo-image-wrapper';

    const img = document.createElement('img');
    img.alt = '';
    img.src = photo.imagePreviewUrl || photo.imageUrl;
    wrapper.appendChild(img);

    const info = document.createElement('div');
    info.className = 'photo-info';

    container.appendChild(wrapper);
    container.appendChild(info);

    if (!this._infoPanel) this._infoPanel = new InfoPanel();
    this._infoPanel.renderInto(info, photo);
  }

  _resetTrackToCenter() {
    if (!this._track) return;
    this._track.style.transition = 'none';
    this._track.style.transform = `translateX(${TRACK_CENTER}vw)`;
  }

   _setTrackOffset(px) {
    if (!this._track) return;
    const vw = window.innerWidth / 100;
    const offset = Math.round(TRACK_CENTER * vw + px);
    this._track.style.transition = 'none';
    this._track.style.transform = `translateX(${offset}px)`;
  }

  _animateTrackTo(targetVw, duration, callback) {
    if (!this._track) return;
    const targetPx = Math.round(targetVw * window.innerWidth / 100);
    this._track.style.transition = `transform ${duration}ms ease`;
    this._track.style.transform = `translateX(${targetPx}px)`;

    if (callback) {
      let fired = false;
      const onEnd = () => {
        if (fired) return;
        fired = true;
        this._track.removeEventListener('transitionend', onEnd);
        clearTimeout(fallbackTimer);
        callback();
      };
      const fallbackTimer = setTimeout(onEnd, duration + 100);
      this._track.addEventListener('transitionend', onEnd);
    }
  }

  _setupSwipeManager() {
    const screen = document.getElementById('photo-screen');

    this._swipeManager = new SwipeManager(screen, {
      threshold: SWIPE_THRESHOLD,

      onMove: (offsetX, offsetY, direction) => {
        if (this._settling) return;
        if (direction === DIRECTION.LEFT || direction === DIRECTION.RIGHT) {
          this._setTrackOffset(offsetX * SWIPE_FOLLOW_RATIO);
        }
      },

      onSwipeLeft: () => {
        if (this._settling) return;
        this._settling = true;
        this._animateTrackTo(TRACK_LEFT, SWIPE_EXIT_DURATION, () => {
          Store.next();
          this.render('left');
          this._settling = false;
        });
      },

      onSwipeRight: () => {
        if (this._settling) return;
        this._settling = true;
        this._animateTrackTo(TRACK_RIGHT, SWIPE_EXIT_DURATION, () => {
          Store.prev();
          this.render('right');
          this._settling = false;
        });
      },

      onRelease: (direction) => {
        if (this._settling) return;
        if (!direction) {
          this._settling = true;
          this._animateTrackTo(TRACK_CENTER, SWIPE_RETURN_DURATION, () => {
            this._settling = false;
          });
        }
      },
    });
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
        const p = allPhotos[(currentIdx + dist + total) % total];
        if (!p) return;
        const pUrl = p.imagePreviewUrl || p.imageUrl;
        if (pUrl) urgent.push({ url: pUrl });
        if (p.imageUrl && p.imageUrl !== pUrl) {
          urgent.push({ url: p.imageUrl });
        }
      });
    }

    for (let d = FAR_NEIGHBORS_START; d <= FAR_NEIGHBORS_END; d++) {
      [d, -d].forEach(dist => {
        const p = allPhotos[(currentIdx + dist + total) % total];
        if (!p) return;
        const pUrl = p.imagePreviewUrl || p.imageUrl;
        if (pUrl) deferred.push({ url: pUrl });
        if (p.imageUrl && p.imageUrl !== pUrl) {
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