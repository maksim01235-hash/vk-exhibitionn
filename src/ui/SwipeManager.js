/**
 * SwipeManager — обработчик свайпов (touch и mouse жестов) с анимацией следования.
 * 
 * Поддерживает:
 *   - Горизонтальные свайпы (влево/вправо)
 *   - Вертикальные свайпы (вверх/вниз) — задел на будущее
 *   - Синхронное перемещение контента за пальцем/курсором
 *   - Защиту от зависания жестов (таймаут 5с)
 * 
 * Использование:
 *   const sm = new SwipeManager(element, {
 *     onMove: (offsetX, offsetY, direction) => { ... },
 *     onSwipeLeft: () => { ... },
 *     onSwipeRight: () => { ... },
 *     onSwipeUp: () => { ... },
 *     onSwipeDown: () => { ... },
 *     onRelease: (direction, deltaX, deltaY) => { ... },
 *     threshold: 80,
 *   });
 */

const DEFAULT_THRESHOLD = 80;
const DIRECTION_DETECT_OFFSET = 10;
const GESTURE_TIMEOUT = 5000; // Таймаут защиты от зависания жеста (мс)

const DIRECTION = {
  NONE: null,
  LEFT: 'left',
  RIGHT: 'right',
  UP: 'up',
  DOWN: 'down',
};

class SwipeManager {
  /**
   * @param {HTMLElement} element
   * @param {Object} opts
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
  }

  // ═══════════════════════════════════════
  // TOUCH
  // ═══════════════════════════════════════

  _handleTouchStart(e) {
    this._startGesture(e.touches[0].clientX, e.touches[0].clientY);
  }

  _handleTouchMove(e) {
    if (!this._active) return;
    this._moveGesture(e.touches[0].clientX, e.touches[0].clientY);
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
    this._moveGesture(e.clientX, e.clientY);
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

  _startGesture(x, y) {
    // Принудительно завершаем предыдущий зависший жест
    if (this._active) {
      this._finishGesture(this._offsetX, this._offsetY);
    }

    this._startX = x;
    this._startY = y;
    this._offsetX = 0;
    this._offsetY = 0;
    this._active = true;
    this._direction = DIRECTION.NONE;

    // Защита от зависания
    if (this._gestureTimeout) clearTimeout(this._gestureTimeout);
    this._gestureTimeout = setTimeout(() => {
      if (this._active) {
        console.warn('SwipeManager: жест завис, принудительный сброс');
        this._finishGesture(0, 0);
      }
    }, GESTURE_TIMEOUT);
  }

  _moveGesture(x, y) {
    this._offsetX = x - this._startX;
    this._offsetY = y - this._startY;

    if (!this._direction && (Math.abs(this._offsetX) > DIRECTION_DETECT_OFFSET || Math.abs(this._offsetY) > DIRECTION_DETECT_OFFSET)) {
      if (Math.abs(this._offsetX) >= Math.abs(this._offsetY)) {
        this._direction = this._offsetX < 0 ? DIRECTION.LEFT : DIRECTION.RIGHT;
      } else {
        this._direction = this._offsetY < 0 ? DIRECTION.UP : DIRECTION.DOWN;
      }
    }

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

    if (this._opts.onMove) {
      this._opts.onMove(0, 0, null);
    }
    if (this._opts.onRelease) {
      this._opts.onRelease(null, 0, 0);
    }

    this._offsetX = 0;
    this._offsetY = 0;
    this._direction = DIRECTION.NONE;
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
  }
}

export { SwipeManager, DIRECTION };
export default SwipeManager;