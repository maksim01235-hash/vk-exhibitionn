/**
 * PhotoView — экран фотографии (слайдер с тремя слайдами).
 * 
 * НАЗНАЧЕНИЕ:
 *   Отображает фото в центре, текст выезжает из-под фото.
 *   Поддерживает свайпы влево/вправо для перехода между фото.
 * 
 * КАК ЭТО РАБОТАЕТ:
 *   1. При открытии из галереи: фото загружается в центр, full подменяет preview
 *   2. При свайпе: трек (3 слайда) двигается за пальцем
 *   3. После завершения свайпа: центральный слайд получает фото из бокового,
 *      боковые перестраиваются, трек телепортируется в центр
 *   4. Текст скрыт за фото (translateY -100%), выезжает после телепорта трека
 *   5. Высота враппера — auto, фото само определяет размер через CSS
 * 
 * РАСШИРЕНИЕ:
 *   — Pinch-to-zoom
 *   — Кнопка «Поделиться»
 *   — Полноэкранный режим (скрытие тулбара и текста)
 */

import Store from '../core/Store.js';
import InfoPanel from './InfoPanel.js';
import SwipeManager, { DIRECTION } from './SwipeManager.js';
import ImagePreloader from '../utils/ImagePreloader.js';
import FeedbackPrompt from '../utils/FeedbackPrompt.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ — изображение
// ═══════════════════════════════════════

/** Длительность фэйда preview → full (мс) */
const FULL_FADE_DURATION = 300;

// ═══════════════════════════════════════
// КОНСТАНТЫ — свайп
// ═══════════════════════════════════════

/** Порог свайпа (px). При каком смещении считать свайп совершённым */
const SWIPE_THRESHOLD = 80;

/** Множитель следования трека за пальцем (1.0 = 1:1, 0.5 = с сопротивлением) */
const SWIPE_FOLLOW_RATIO = 1.0;

/** Длительность возврата трека если свайп не завершён (мс) */
const SWIPE_RETURN_DURATION = 300;

/** Длительность ухода трека при успешном свайпе (мс) */
const SWIPE_EXIT_DURATION = 250;

// ═══════════════════════════════════════
// КОНСТАНТЫ — позиции трека (vw)
// ═══════════════════════════════════════

const TRACK_LEFT = -200;
const TRACK_CENTER = -100;
const TRACK_RIGHT = 0;

// ═══════════════════════════════════════
// КОНСТАНТЫ — предзагрузка
// ═══════════════════════════════════════

/** Задержка между загрузками в очереди (мс) */
const PRELOAD_INTERVAL = 100;

/** Сколько ближайших соседей грузить срочно (в каждую сторону) */
const CLOSE_NEIGHBORS = 2;

/** Дальние соседи: от (в каждую сторону) */
const FAR_NEIGHBORS_START = 3;

/** Дальние соседи: до (в каждую сторону) */
const FAR_NEIGHBORS_END = 5;

/** CSS-класс индикатора загрузки full */
const LOADING_CLASS = 'loading-full';

class PhotoView {
  constructor() {
    // Слайды
    /** @type {HTMLElement} Трек слайдов */
    this._track = document.querySelector('.slides-track');

    /** @type {HTMLElement} Левый слайд */
    this._slideLeft = document.querySelector('.slide-left .slide-content');

    /** @type {HTMLElement} Центральный слайд */
    this._slideCenter = document.querySelector('.slide-center .slide-content');

    /** @type {HTMLElement} Правый слайд */
    this._slideRight = document.querySelector('.slide-right .slide-content');

    /** @type {HTMLElement} Враппер фото в центре */
    this._centerWrapper = document.querySelector('.slide-center .photo-image-wrapper');

    /** @type {HTMLImageElement} Изображение в центре */
    this._centerImage = document.querySelector('.slide-center .photo-image-wrapper img');

    /** @type {HTMLElement} Счётчик «X из Y» */
    this._counterEl = document.getElementById('photo-counter');

    // Индексы боковых слайдов (для проверки изменений)
    this._prevSideIndex = -1;
    this._nextSideIndex = -1;

    // Компоненты
    /** @type {SwipeManager|null} */
    this._swipeManager = null;

    /** @type {InfoPanel|null} */
    this._infoPanel = null;

    // Состояние
    /** @type {string|null} ID текущего фото */
    this._currentPhotoId = null;

    /** @type {number} Счётчик загрузок (защита от гонки) */
    this._loadId = 0;

    /** @type {boolean} Идёт ли анимация свайпа */
    this._settling = false;

    // Очередь загрузки
    /** @type {Object[]} */
    this._preloadQueue = [];

    /** @type {number|null} */
    this._preloadTimer = null;

    // Сброс свайпа при возврате на вкладку
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

  /**
   * Отрисовать текущее фото.
   * @param {string} [direction] — 'left'|'right' при свайпе, undefined при открытии
   */
  render(direction) {
    const photo = Store.getCurrentPhoto();
    if (!photo) return;

    // Защита от повторного рендера того же фото
    if (!direction && this._currentPhotoId === photo.id) return;

    this._currentPhotoId = photo.id;
    this._loadId++;

    const previewUrl = photo.imagePreviewUrl || photo.imageUrl;
    const fullUrl = photo.imageUrl || previewUrl;
    const hasPreview = previewUrl !== fullUrl;

    // 1. Скрываем текст (уезжает за фото)
    this._hideCenterText();

    // 2. Загружаем фото в центр
    if (direction) {
      this._loadPhotoFromSide(previewUrl, fullUrl, hasPreview);
    } else {
      this._loadPhotoFromGallery(previewUrl, fullUrl, hasPreview);
    }

    // 3. Инфопанель
    if (!this._infoPanel) this._infoPanel = new InfoPanel();
    this._infoPanel.render(photo);

    // 4. Боковые слайды
    this._updateSideSlides();

    // 5. Очередь загрузки
    this._buildNeighborsQueue();
    this._processQueue();

    // 6. Пузырь обратной связи
    FeedbackPrompt.onPhotoOpened(photo.id);

    // 7. Счётчик
    const idx = Store.getCurrentIndex() + 1;
    const total = Store.getCount();
    this._counterEl.textContent = `${idx} из ${total}`;

    // 8. Хеш URL
    const newHash = `#${photo.id}`;
    if (window.location.hash !== newHash) {
      history.replaceState(null, '', `/#${photo.id}`);
    }

    // 9. SwipeManager (один раз)
    if (!this._swipeManager) {
      this._setupSwipeManager();
    }

    // 10. Телепорт трека в центр
    this._resetTrackToCenter();

    // 11. Текст выезжает из-под фото
    requestAnimationFrame(() => {
      this._revealCenterText();
    });
  }

  /**
   * Сбросить состояние свайпа (при уходе с экрана фото).
   */
  resetSwipe() {
    this._settling = false;
    this._resetTrackToCenter();
    if (this._swipeManager) {
      this._swipeManager.cancel();
    }
  }

  // ═══════════════════════════════════════
  // ТЕКСТ (выезд из-под фото)
  // ═══════════════════════════════════════

  /**
   * Мгновенно скрыть текст за фото (без анимации).
   */
  _hideCenterText() {
    const info = document.querySelector('.slide-center .photo-info');
    if (!info) return;
    info.style.transition = 'none';
    info.classList.remove('revealed');
    info.offsetHeight; // форсим reflow чтобы transition:none применился
    info.style.transition = '';
  }

  /**
   * Показать текст — выезд из-под фото с анимацией.
   */
  _revealCenterText() {
    const info = document.querySelector('.slide-center .photo-info');
    if (!info) return;
    info.classList.add('revealed');
  }

  // ═══════════════════════════════════════
  // ЗАГРУЗКА ФОТО
  // ═══════════════════════════════════════

  /**
   * Открытие из галереи: загружаем preview, затем full с фэйдом.
   */
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

  /**
   * Свайп: фото уже загружено в боковом слайде, копируем src.
   */
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

  /**
   * Заменить preview на full с фэйдом.
   */
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

  // ═══════════════════════════════════════
  // БОКОВЫЕ СЛАЙДЫ
  // ═══════════════════════════════════════

  /**
   * Обновить левый и правый слайды.
   * Пересоздаёт DOM только если индекс изменился.
   */
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

  /**
   * Построить DOM слайда: враппер + img + info.
   * @param {HTMLElement} container
   * @param {Object} photo
   */
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

  /** Телепортировать трек в центр (без анимации) */
  _resetTrackToCenter() {
    if (!this._track) return;
    this._track.style.transition = 'none';
    this._track.style.transform = `translateX(${TRACK_CENTER}vw)`;
  }

  /** Установить смещение трека (следование за пальцем) */
  _setTrackOffset(px) {
    if (!this._track) return;
    const vw = window.innerWidth / 100;
    const offset = Math.round(TRACK_CENTER * vw + px);
    this._track.style.transition = 'none';
    this._track.style.transform = `translateX(${offset}px)`;
  }

  /** Анимировать трек к позиции */
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

  // ═══════════════════════════════════════
  // ОЧЕРЕДЬ ЗАГРУЗКИ
  // ═══════════════════════════════════════

  /**
   * Построить очередь загрузки соседей.
   * Приоритет: full текущего → preview соседей → full соседей → дальние.
   */
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