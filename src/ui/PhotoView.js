/**
 * PhotoView — экран фотографии (слайдер с тремя слайдами).
 * 
 * При свайпе двигается вся лента из трёх слайдов.
 * После завершения — центральный обновляется, крайние перестраиваются.
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
const SWIPE_FOLLOW_RATIO = 1.0;

const PRELOAD_INTERVAL = 100;
const CLOSE_NEIGHBORS = 2;
const FAR_NEIGHBORS_START = 3;
const FAR_NEIGHBORS_END = 5;

const LOADING_CLASS = 'loading-full';

class PhotoView {
  constructor() {
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

    // 1. Сразу ставим preview в центральный слайд (синхронно)
    if (this._centerImage) {
      this._centerImage.style.opacity = '0';
      this._centerImage.src = previewUrl;
    }
    if (this._centerWrapper) {
      this._centerWrapper.classList.add(LOADING_CLASS);
    }

    // 2. Обновляем инфо
    if (!this._infoPanel) this._infoPanel = new InfoPanel();
    this._infoPanel.render(photo);

    // 3. Загружаем full в фоне
    this._showPhotoInContainer(this._centerWrapper, this._centerImage, previewUrl, fullUrl, hasPreview, this._loadId);

    // 4. Боковые слайды
    this._updateSideSlides();

    // 5. Очередь загрузки
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

    // 6. Телепорт трека в центр
    if (this._track) {
      this._track.style.transition = 'none';
      this._track.style.transform = 'translateX(-100vw)';
    }

    // 7. Корректировка высоты
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._fitWrapper(this._centerWrapper, this._centerImage);
      });
    });
  }

  resetSwipe() {
    this._settling = false;
    if (this._track) {
      this._track.style.transition = 'none';
      this._track.style.transform = 'translateX(-100vw)';
    }
    if (this._swipeManager) {
      this._swipeManager.cancel();
    }
  }

  // ═══════════════════════════════════════
  // СЛАЙДЫ
  // ═══════════════════════════════════════

  _updateSideSlides() {
    const allPhotos = Store.getAllPhotos();
    const currentIdx = Store.getCurrentIndex();
    const total = allPhotos.length;

    const prevIdx = (currentIdx - 1 + total) % total;
    const nextIdx = (currentIdx + 1) % total;

    if (this._slideLeft) {
      this._slideLeft.innerHTML = '';
      this._renderSlideContent(this._slideLeft, allPhotos[prevIdx]);
    }
    if (this._slideRight) {
      this._slideRight.innerHTML = '';
      this._renderSlideContent(this._slideRight, allPhotos[nextIdx]);
    }
  }

  _renderSlideContent(container, photo) {
    if (!photo) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'photo-image-wrapper';

    const img = document.createElement('img');
    img.alt = '';

    img.onload = () => this._fitWrapper(wrapper, img);
    img.src = photo.imagePreviewUrl || photo.imageUrl;
    if (img.complete) this._fitWrapper(wrapper, img);

    wrapper.appendChild(img);

    const info = document.createElement('div');
    info.className = 'photo-info';

    container.appendChild(wrapper);
    container.appendChild(info);

    if (!this._infoPanel) this._infoPanel = new InfoPanel();
    this._infoPanel.renderInto(info, photo);
  }

  /**
   * Установить высоту враппера по размерам изображения.
   * Использует window.innerWidth для расчёта — не зависит от ширины контейнера.
   */
  _fitWrapper(wrapper, img) {
    if (!wrapper || !img) return;
    if (!img.naturalWidth || !img.naturalHeight) return;

    const viewportWidth = window.innerWidth;
    const ratio = img.naturalHeight / img.naturalWidth;
    const naturalHeight = viewportWidth * ratio;
    const maxHeight = window.innerHeight * MAX_IMAGE_HEIGHT_RATIO;
    const h = Math.min(naturalHeight, maxHeight);

    wrapper.style.height = h + 'px';
  }

  // ═══════════════════════════════════════
  // SWIPE MANAGER
  // ═══════════════════════════════════════

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
        this._animateTrackTo(-200, SWIPE_EXIT_DURATION, () => {
          Store.next();
          this.render('left');
          this._settling = false;
        });
      },

      onSwipeRight: () => {
        if (this._settling) return;
        this._settling = true;
        this._animateTrackTo(0, SWIPE_EXIT_DURATION, () => {
          Store.prev();
          this.render('right');
          this._settling = false;
        });
      },

      onRelease: (direction) => {
        if (this._settling) return;
        if (!direction) {
          this._settling = true;
          this._animateTrackTo(-100, SWIPE_RETURN_DURATION, () => {
            this._settling = false;
          });
        }
      },
    });
  }

  _setTrackOffset(px) {
    if (!this._track) return;
    const vw = window.innerWidth / 100;
    const baseOffset = -100 * vw;
    this._track.style.transition = 'none';
    this._track.style.transform = `translateX(${baseOffset + px}px)`;
  }

  _animateTrackTo(targetVw, duration, callback) {
    if (!this._track) return;
    const targetPx = targetVw * window.innerWidth / 100;
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
  // ЗАГРУЗКА ИЗОБРАЖЕНИЯ
  // ═══════════════════════════════════════

  _showPhotoInContainer(wrapper, img, previewUrl, fullUrl, hasPreview, loadId) {
    if (!wrapper || !img) return;

    // Ждём загрузки preview чтобы показать
    const tempImg = new Image();
    tempImg.onload = () => {
      if (loadId !== this._loadId) return;
      // preview уже установлен в img.src — просто показываем
      img.style.opacity = '1';

      if (!hasPreview) {
        wrapper.classList.remove(LOADING_CLASS);
        return;
      }

      // Грузим full
      const fullImg = new Image();
      fullImg.onload = () => {
        if (loadId !== this._loadId) return;
        img.style.opacity = '0';
        setTimeout(() => {
          if (loadId !== this._loadId) return;
          img.src = fullUrl;
          img.style.opacity = '1';
          wrapper.classList.remove(LOADING_CLASS);
        }, FULL_FADE_DURATION);
      };
      fullImg.onerror = () => {
        if (loadId !== this._loadId) return;
        wrapper.classList.remove(LOADING_CLASS);
      };
      fullImg.src = fullUrl;
    };
    tempImg.onerror = () => {
      if (loadId !== this._loadId) return;
      img.style.opacity = '1';
      wrapper.classList.remove(LOADING_CLASS);
    };
    tempImg.src = previewUrl;
  }

  // ═══════════════════════════════════════
  // ОЧЕРЕДЬ ФОНОВОЙ ЗАГРУЗКИ
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