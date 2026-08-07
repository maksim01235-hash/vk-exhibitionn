import Store from '../core/Store.js';
import InfoPanel from './InfoPanel.js';
import SwipeManager, { DIRECTION } from './SwipeManager.js';
import ImagePreloader from '../utils/ImagePreloader.js';
import FeedbackPrompt from '../utils/FeedbackPrompt.js';
// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

// ── Изображение ───────────────────────

/** CSS-класс индикатора загрузки full-изображения (спинер) */
const LOADING_CLASS = 'loading-full';

/** Длительность фэйда preview → full (мс) */
const FADE_DURATION = 400;

// ── Свайп ─────────────────────────────

/**
 * Порог свайпа (px).
 * Минимальное расстояние, которое нужно пройти пальцем,
 * чтобы свайп был засчитан как смена слайда.
 * Увеличьте для более «тугого» переключения.
 */
const SWIPE_THRESHOLD = 120;

/**
 * Множитель следования трека за пальцем.
 * 1.0 — трек движется 1:1 с пальцем.
 * 0.5 — трек движется вдвое медленнее (сопротивление).
 * 1.5 — трек обгоняет палец (ускорение).
 */
const SWIPE_FOLLOW_RATIO = 1.0;

/**
 * Длительность возврата трека в центр, если свайп НЕ совершён (мс).
 * Трек плавно возвращается на центральный слайд.
 */
const SWIPE_RETURN_DURATION = 300;

/**
 * Длительность ухода трека при успешном свайпе (мс).
 * Трек уезжает к соседнему слайду.
 */
const SWIPE_EXIT_DURATION = 250;

// ── Позиции трека ─────────────────────

/**
 * Позиции трека в vw (viewport width).
 * Трек шириной 300vw, центральный слайд находится на -100vw.
 *   TRACK_LEFT   = -200vw (левый слайд)
 *   TRACK_CENTER = -100vw (центральный слайд)
 *   TRACK_RIGHT  = 0     (правый слайд)
 */
const TRACK_LEFT = -200;
const TRACK_CENTER = -100;
const TRACK_RIGHT = 0;

// ── Предзагрузка ──────────────────────

/**
 * Задержка между загрузками изображений в очереди (мс).
 * Чтобы не нагружать сеть одновременными запросами.
 */
const PRELOAD_INTERVAL = 100;

/** Сколько ближайших соседей грузить в первую очередь (в каждую сторону) */
const CLOSE_NEIGHBORS = 2;

/** Дальние соседи: начало диапазона (в каждую сторону) */
const FAR_NEIGHBORS_START = 3;

/** Дальние соседи: конец диапазона (в каждую сторону) */
const FAR_NEIGHBORS_END = 5;

class PhotoView {
  constructor() {

    this._trackLocked = false;
    this._trackStartPx = 0;

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

    this._fullReady = false;
    this._textReady = false;
    this._centerImage.style.transition = 'none';
    this._centerImage.style.opacity = '1';

    this._hideCenterText();

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
  // ЗАГРУЗКА
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

  /** Телепорт в центр */
  _resetTrackToCenter() {
    if (!this._track) return;
    this._track.style.transition = 'none';
    this._track.style.transform = `translateX(${TRACK_CENTER}vw)`;
  }

  /**
   * Получить РЕАЛЬНУЮ текущую позицию трека из computed styles (px).
   */
  _getTrackPosition() {
    // Не используется для onMove, только для отладки
    if (!this._track) return 0;
    const style = getComputedStyle(this._track);
    const matrix = new DOMMatrix(style.transform);
    return matrix.m41;
  }

  /**
   * Установить смещение трека относительно ЕГО ТЕКУЩЕЙ позиции.
   * Вызывается при движении пальца.
   */
  _setTrackOffset(px) {
    if (!this._track) return;
    this._track.style.transition = 'none';
    this._track.style.transform = `translateX(${this._trackStartPx + px}px)`;
  }
  /**
   * Анимировать трек к абсолютной позиции (vw).
   */
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
          // Запоминаем позицию трека один раз в начале жеста
          if (!this._trackStartPx) {
            this._track.style.transition = 'none';
            const style = getComputedStyle(this._track);
            const matrix = new DOMMatrix(style.transform);
            this._trackStartPx = matrix.m41;
          }
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
        this._trackStartPx = 0;
        this._trackLocked = false;
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