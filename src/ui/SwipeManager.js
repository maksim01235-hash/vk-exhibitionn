/**
 * SwipeManager — обработчик свайпов (touch и mouse жестов).
 * 
 * НАЗНАЧЕНИЕ:
 *   Отслеживает жесты на элементе, оповещает о свайпах через колбэки.
 *   Поддерживает следование контента за пальцем в реальном времени.
 * 
 * КАК ЭТО РАБОТАЕТ:
 *   1. touchstart/mousedown — запоминаются координаты
 *   2. touchmove/mousemove — вычисляется смещение и направление
 *   3. Направление определяется по преобладающей оси
 *   4. touchend/mouseup — если смещение > порога = свайп, иначе возврат
 *   5. Защита от зависания: таймаут GESTURE_TIMEOUT
 *   6. CSS touch-action: pan-y блокирует горизонтальный скролл браузера
 */

import { createLogger } from '../utils/Logger.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/** Включить логирование */
const DEBUG = false; // Частые события, лучше отключить

/** Порог свайпа по умолчанию (px) */
const DEFAULT_THRESHOLD = 90;

/** Минимальное смещение для определения направления (px) */
const DIRECTION_DETECT_OFFSET = 10;

/** Таймаут защиты от зависания жеста (мс) */
const GESTURE_TIMEOUT = 5000;

/** Направления свайпа */
const DIRECTION = {
  NONE: null,
  LEFT: 'left',
  RIGHT: 'right',
  UP: 'up',
  DOWN: 'down',
};

// ═══════════════════════════════════════
// ЛОГГЕР
// ═══════════════════════════════════════

const log = createLogger('Swipe', DEBUG);

class SwipeManager {
  /**
   * @param {HTMLElement} element — элемент для жестов
   * @param {Object} opts — колбэки
   * @param {Function} [opts.onMove] — (offsetX, offsetY, direction)
   * @param {Function} [opts.onSwipeLeft]
   * @param {Function} [opts.onSwipeRight]
   * @param {Function} [opts.onSwipeUp]
   * @param {Function} [opts.onSwipeDown]
   * @param {Function} [opts.onRelease] — (direction, deltaX, deltaY)
   * @param {number} [opts.threshold=80]
   */
  constructor(element, opts = {}) {
    if (!element) {
      console.warn('SwipeManager: элемент не найден');
      return;
    }

    this._element = element;
    this._opts = opts;
    this._threshold = opts.threshold || DEFAULT_THRESHOLD;

    this._startX = 0;
    this._startY = 0;
    this._offsetX = 0;
    this._offsetY = 0;
    this._active = false;
    this._direction = null;
    this._gestureTimeout = null;

    // Бинд
    this._handleTouchStart = this._handleTouchStart.bind(this);
    this._handleTouchMove = this._handleTouchMove.bind(this);
    this._handleTouchEnd = this._handleTouchEnd.bind(this);
    this._handleMouseDown = this._handleMouseDown.bind(this);
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleMouseUp = this._handleMouseUp.bind(this);

    element.addEventListener('touchstart', this._handleTouchStart, { passive: true });
    element.addEventListener('touchmove', this._handleTouchMove, { passive: true });
    element.addEventListener('touchend', this._handleTouchEnd);
    element.addEventListener('touchcancel', this._handleTouchEnd);
    element.addEventListener('mousedown', this._handleMouseDown);

    log(`создан, threshold=${this._threshold}`);
  }

  // ═══════════════════════════════════════
  // TOUCH
  // ═══════════════════════════════════════

  _handleTouchStart(e) {
    this._startGesture(e.touches[0].clientX, e.touches[0].clientY);
  }

  _handleTouchMove(e) {
    if (!this._active) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - this._startX;
    const deltaY = touch.clientY - this._startY;
    this._detectDirection(deltaX, deltaY);
    this._moveGesture(deltaX, deltaY);
  }

  _handleTouchEnd(e) {
    if (!this._active) return;
    this._active = false;
    const touch = e.changedTouches[0];
    const deltaX = touch ? touch.clientX - this._startX : 0;
    const deltaY = touch ? touch.clientY - this._startY : 0;
    this._finishGesture(deltaX, deltaY);
  }

  // ═══════════════════════════════════════
  // MOUSE
  // ═══════════════════════════════════════

  _handleMouseDown(e) {
    if (e.button !== 0) return;
    if (this._active) return;
    this._startGesture(e.clientX, e.clientY);
    document.addEventListener('mousemove', this._handleMouseMove);
    document.addEventListener('mouseup', this._handleMouseUp);
  }

  _handleMouseMove(e) {
    if (!this._active) return;
    const deltaX = e.clientX - this._startX;
    const deltaY = e.clientY - this._startY;
    this._detectDirection(deltaX, deltaY);
    this._moveGesture(deltaX, deltaY);
  }

  _handleMouseUp(e) {
    if (!this._active) return;
    this._active = false;
    document.removeEventListener('mousemove', this._handleMouseMove);
    document.removeEventListener('mouseup', this._handleMouseUp);
    this._finishGesture(e.clientX - this._startX, e.clientY - this._startY);
  }

  // ═══════════════════════════════════════
  // ОБЩАЯ ЛОГИКА
  // ═══════════════════════════════════════

  _detectDirection(deltaX, deltaY) {
    if (!this._direction && (Math.abs(deltaX) > DIRECTION_DETECT_OFFSET || Math.abs(deltaY) > DIRECTION_DETECT_OFFSET)) {
      if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        this._direction = deltaX < 0 ? DIRECTION.LEFT : DIRECTION.RIGHT;
      } else {
        this._direction = deltaY < 0 ? DIRECTION.UP : DIRECTION.DOWN;
      }
      log(`направление: ${this._direction}`);
    }
  }

  _startGesture(x, y) {
    if (this._active) {
      this._finishGesture(this._offsetX, this._offsetY);
    }
    this._startX = x;
    this._startY = y;
    this._offsetX = 0;
    this._offsetY = 0;
    this._active = true;
    this._direction = DIRECTION.NONE;

    if (this._gestureTimeout) clearTimeout(this._gestureTimeout);
    this._gestureTimeout = setTimeout(() => {
      if (this._active) {
        log('жест завис, принудительный сброс', 'warn');
        this._finishGesture(0, 0);
      }
    }, GESTURE_TIMEOUT);
  }

  _moveGesture(deltaX, deltaY) {
    this._offsetX = deltaX;
    this._offsetY = deltaY;
    if (this._opts.onMove) {
      this._opts.onMove(this._offsetX, this._offsetY, this._direction);
    }
  }

  _finishGesture(deltaX, deltaY) {
    this._active = false;

    if (this._gestureTimeout) {
      clearTimeout(this._gestureTimeout);
      this._gestureTimeout = null;
    }

    let triggeredDirection = null;

    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      if (Math.abs(deltaX) > this._threshold) {
        triggeredDirection = deltaX < 0 ? DIRECTION.LEFT : DIRECTION.RIGHT;
      }
    } else {
      if (Math.abs(deltaY) > this._threshold) {
        triggeredDirection = deltaY < 0 ? DIRECTION.UP : DIRECTION.DOWN;
      }
    }

    log(`завершён, направление: ${triggeredDirection || 'нет'}, deltaX: ${Math.round(deltaX)}, deltaY: ${Math.round(deltaY)}`);

    if (triggeredDirection) {
      switch (triggeredDirection) {
        case DIRECTION.LEFT:  if (this._opts.onSwipeLeft)  this._opts.onSwipeLeft();  break;
        case DIRECTION.RIGHT: if (this._opts.onSwipeRight) this._opts.onSwipeRight(); break;
        case DIRECTION.UP:    if (this._opts.onSwipeUp)    this._opts.onSwipeUp();    break;
        case DIRECTION.DOWN:  if (this._opts.onSwipeDown)  this._opts.onSwipeDown();  break;
      }
    }

    if (this._opts.onRelease) {
      this._opts.onRelease(triggeredDirection, deltaX, deltaY);
    }

    this._offsetX = 0;
    this._offsetY = 0;
    this._direction = DIRECTION.NONE;
  }

  // ═══════════════════════════════════════
  // ПУБЛИЧНЫЙ API
  // ═══════════════════════════════════════

  getOffset() {
    return { x: this._offsetX, y: this._offsetY, direction: this._direction };
  }

  isActive() {
    return this._active;
  }

  setThreshold(px) {
    this._threshold = px;
  }

  cancel() {
    if (!this._active) return;
    this._active = false;
    document.removeEventListener('mousemove', this._handleMouseMove);
    document.removeEventListener('mouseup', this._handleMouseUp);
    if (this._gestureTimeout) {
      clearTimeout(this._gestureTimeout);
      this._gestureTimeout = null;
    }
    if (this._opts.onMove) this._opts.onMove(0, 0, null);
    if (this._opts.onRelease) this._opts.onRelease(null, 0, 0);
    this._offsetX = 0;
    this._offsetY = 0;
    this._direction = DIRECTION.NONE;
    log('принудительно отменён');
  }

  destroy() {
    if (!this._element) return;
    this.cancel();
    this._element.removeEventListener('touchstart', this._handleTouchStart);
    this._element.removeEventListener('touchmove', this._handleTouchMove);
    this._element.removeEventListener('touchend', this._handleTouchEnd);
    this._element.removeEventListener('touchcancel', this._handleTouchEnd);
    this._element.removeEventListener('mousedown', this._handleMouseDown);
    this._element = null;
    log('уничтожен');
  }
}

export { SwipeManager, DIRECTION };
export default SwipeManager;