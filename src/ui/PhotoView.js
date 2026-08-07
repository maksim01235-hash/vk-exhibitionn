/**
 * PhotoView — экран фотографии (слайдер с тремя слайдами).
 * 
 * Два слоя изображений: preview (z:2) и full (z:1).
 * Preview показывается мгновенно. Full грузится в фоне.
 * Когда full загружен И анимация текста завершена — preview плавно затухает.
 */

import Store from '../core/Store.js';
import InfoPanel from './InfoPanel.js';
import SwipeManager, { DIRECTION } from './SwipeManager.js';
import ImagePreloader from '../utils/ImagePreloader.js';
import FeedbackPrompt from '../utils/FeedbackPrompt.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

const LOADING_CLASS = 'loading-full';

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

/** Длительность фэйда preview → full (мс) */
const FADE_DURATION = 400;

class PhotoView {
  constructor() {
    this._track = document.querySelector('.slides-track');
    this._slideLeft = document.querySelector('.slide-left .slide-content');
    this._slideCenter = document.querySelector('.slide-center .slide-content');
    this._slideRight = document.querySelector('.slide-right .slide-content');

    this._centerWrapper = document.querySelector('.slide-center .photo-image-wrapper');
    this._centerImage = document.querySelector('#photo-image');
    this._centerFullImage = document.querySelector('#photo-image-full');

    this._counterEl = document.getElementById('photo-counter');

    this._prevSideIndex = -1;
    this._nextSideIndex = -1;

    this._swipeManager = null;
    this._infoPanel = null;
    this._currentPhotoId = null;
    this._preloadQueue = [];
    this._preloadTimer = null;
    this._loadId = 0;
    this._settling = false;

    // Для фэйда
    this._fullReady = false;
    this._textReady = false;

    this._handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') this.resetSwipe();
    };
    document.addEventListener('visibilitychange', this._handleVisibilityChange);
  }

  // ═══════════════════════════════════════
  // ПУБЛИЧНЫЙ API
  // ═══════════════════════════════════════

  render(direction) {
    const photo = Store.getCurrentPhoto();
    if (!photo) return;
    if (!direction && this._currentPhotoId === photo.id) return;

    this._currentPhotoId = photo.id;
    this._loadId++;

    const previewUrl = photo.imagePreviewUrl || photo.imageUrl;
    const fullUrl = photo.imageUrl || previewUrl;
    const hasPreview = previewUrl !== fullUrl;

    // Сброс флагов
    this._fullReady = false;
    this._textReady = false;
    this._centerImage.style.transition = 'none';
    this._centerImage.style.opacity = '1';

    // Текст
    this._hideCenterText();

    // Фото
    if (hasPreview) {
      this._centerImage.src = previewUrl;
      this._centerFullImage.src = '';
      this._centerWrapper.classList.add(LOADING_CLASS);
      this._loadFull(fullUrl);
    } else {
      this._centerImage.src = fullUrl;
      this._centerFullImage.src = '';
      this._centerWrapper.classList.remove(LOADING_CLASS);
    }

    // Инфо
    if (!this._infoPanel) this._infoPanel = new InfoPanel();
    this._infoPanel.render(photo);

    // Боковые
    this._updateSideSlides();
    this._buildNeighborsQueue();
    this._processQueue();

    FeedbackPrompt.onPhotoOpened(photo.id);

    const idx = Store.getCurrentIndex() + 1;
    const total = Store.getCount();
    this._counterEl.textContent = `${idx} из ${total}`;

    const newHash = `#${photo.id}`;
    if (window.location.hash !== newHash) history.replaceState(null, '', `/#${photo.id}`);

    if (!this._swipeManager) this._setupSwipeManager();

    this._resetTrackToCenter();

    requestAnimationFrame(() => this._revealCenterText());
  }

  resetSwipe() {
    this._settling = false;
    this._resetTrackToCenter();
    if (this._swipeManager) this._swipeManager.cancel();
  }

  // ═══════════════════════════════════════
  // ТЕКСТ
  // ═══════════════════════════════════════

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
    const onEnd = () => {
      info.removeEventListener('transitionend', onEnd);
      this._textReady = true;
      this._tryFade();
    };
    info.addEventListener('transitionend', onEnd);
  }

  // ═══════════════════════════════════════
  // ЗАГРУЗКА FULL
  // ═══════════════════════════════════════

  _loadFull(url) {
    const img = new Image();
    img.onload = () => {
      if (!this._centerFullImage || !this._centerWrapper) return;
      this._centerFullImage.src = url;
      this._centerWrapper.classList.remove(LOADING_CLASS);
      this._fullReady = true;
      this._tryFade();
    };
    img.onerror = () => {
      if (this._centerWrapper) this._centerWrapper.classList.remove(LOADING_CLASS);
    };
    img.src = url;
  }

  _tryFade() {
    if (!this._fullReady || !this._textReady) return;
    if (!this._centerImage || !this._centerFullImage) return;
    this._centerImage.style.transition = `opacity ${FADE_DURATION}ms ease`;
    this._centerImage.style.opacity = '0';
  }

  // ═══════════════════════════════════════
  // БОКОВЫЕ СЛАЙДЫ
  // ═══════════════════════════════════════

  _updateSideSlides() {
    const allPhotos = Store.getAllPhotos();
    const currentIdx = Store.getCurrentIndex();
    const total = allPhotos.length;
    const prevIdx = (currentIdx - 1 + total) % total;
    const nextIdx = (currentIdx + 1) % total;

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

  // ═══════════════════════════════════════
  // ТРЕК
  // ═══════════════════════════════════════

  _resetTrackToCenter() {
    if (!this._track) return;
    this._track.style.transition = 'none';
    this._track.style.transform = `translateX(${TRACK_CENTER}vw)`;
  }

  _setTrackOffset(px) {
    if (!this._track) return;
    const vw = window.innerWidth / 100;
    this._track.style.transition = 'none';
    this._track.style.transform = `translateX(${Math.round(TRACK_CENTER * vw + px)}px)`;
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

  // ═══════════════════════════════════════
  // SWIPE MANAGER
  // ═══════════════════════════════════════

  _setupSwipeManager() {
    this._swipeManager = new SwipeManager(document.getElementById('photo-screen'), {
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

  // ═══════════════════════════════════════
  // ОЧЕРЕДЬ
  // ═══════════════════════════════════════

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
        if (p.imageUrl && p.imageUrl !== pUrl) urgent.push({ url: p.imageUrl });
      });
    }
    for (let d = FAR_NEIGHBORS_START; d <= FAR_NEIGHBORS_END; d++) {
      [d, -d].forEach(dist => {
        const p = allPhotos[(currentIdx + dist + total) % total];
        if (!p) return;
        const pUrl = p.imagePreviewUrl || p.imageUrl;
        if (pUrl) deferred.push({ url: pUrl });
        if (p.imageUrl && p.imageUrl !== pUrl) deferred.push({ url: p.imageUrl });
      });
    }
    this._preloadQueue = [...urgent, ...deferred];
  }

  _clearPreloadQueue() {
    this._preloadQueue = [];
    if (this._preloadTimer) clearTimeout(this._preloadTimer);
    this._preloadTimer = null;
  }

  _processQueue() {
    if (this._preloadQueue.length === 0) return;
    ImagePreloader.preload(this._preloadQueue.shift().url);
    this._preloadTimer = setTimeout(() => this._processQueue(), PRELOAD_INTERVAL);
  }
}

export default PhotoView;