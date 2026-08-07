/**
 * SwipeManager — обработчик свайпов (touch и mouse жестов).
 * 
 * НАЗНАЧЕНИЕ:
 *   Отслеживает жесты на элементе и оповещает о свайпах через колбэки.
 *   Поддерживает следование контента за пальцем в реальном времени.
 * 
 * КАК ЭТО РАБОТАЕТ:
 *   1. При касании (touchstart/mousedown) запоминаются начальные координаты
 *   2. При движении (touchmove/mousemove) вычисляется смещение и направление
 *   3. Направление определяется по преобладающей оси (горизонталь/вертикаль)
 *   4. При отпускании (touchend/mouseup): если смещение > порога — свайп,
 *      иначе — возврат
 *   5. Защита от зависания: если жест длится > GESTURE_TIMEOUT — принудительный сброс
 *   6. Touch-события с passive: true для вертикального скролла,
 *      CSS touch-action: pan-y блокирует горизонтальный
 * 
 * ИСПОЛЬЗОВАНИЕ:
 *   const sm = new SwipeManager(element, {
 *     onMove: (offsetX, offsetY, direction) => { ... },
 *     onSwipeLeft: () => { ... },
 *     onSwipeRight: () => { ... },
 *     onSwipeUp: () => { ... },
 *     onSwipeDown: () => { ... },
 *     onRelease: (direction, deltaX, deltaY) => { ... },
 *     threshold: 80,
 *   });
 * 
 * РАСШИРЕНИЕ:
 *   — Инерция после отпускания
 *   — Мультитач (pinch-to-zoom)
 *   — Настраиваемое сопротивление (сейчас через SWIPE_FOLLOW_RATIO в PhotoView)
 */

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/**
 * Порог свайпа по умолчанию (px).
 * Если смещение меньше — свайп не засчитывается, контент возвращается.
 */
const DEFAULT_THRESHOLD = 80;

/**
 * Минимальное смещение для определения направления жеста (px).
 * Пока палец не прошёл это расстояние — направление не определено.
 */
const DIRECTION_DETECT_OFFSET = 10;

/**
 * Таймаут защиты от зависания жеста (мс).
 * Если за это время жест не завершился — принудительно сбрасываем.
 */
const GESTURE_TIMEOUT = 5000;

/**
 * Возможные направления свайпа.
 * NONE — направление ещё не определено.
 */
const DIRECTION = {
  NONE: null,
  LEFT: 'left',
  RIGHT: 'right',
  UP: 'up',
  DOWN: 'down',
};

class SwipeManager {
  /**
   * @param {HTMLElement} element — элемент для отслеживания жестов
   * @param {Object} opts — колбэки и настройки
   * @param {Function} [opts.onMove] — (offsetX, offsetY, direction) — движение
   * @param {Function} [opts.onSwipeLeft] — свайп влево
   * @param {Function} [opts.onSwipeRight] — свайп вправо
   * @param {Function} [opts.onSwipeUp] — свайп вверх
   * @param {Function} [opts.onSwipeDown] — свайп вниз
   * @param {Function} [opts.onRelease] — (direction, deltaX, deltaY) — отпускание
   * @param {number} [opts.threshold=80] — порог срабатывания (px)
   */
  constructor(element, opts = {}) {
    if (!element) {
      console.warn('SwipeManager: элемент не найден');
      return;
    }

    /** @type {HTMLElement} */
    this._element = element;

    /** @type {Object} Колбэки */
    this._opts = opts;

    /** @type {number} Порог свайпа (px) */
    this._threshold = opts.threshold || DEFAULT_THRESHOLD;

    // Координаты
    /** @type {number} Начальная X жеста */
    this._startX = 0;

    /** @type {number} Начальная Y жеста */
    this._startY = 0;

    /** @type {number} Текущее смещение X */
    this._offsetX = 0;

    /** @type {number} Текущее смещение Y */
    this._offsetY = 0;

    // Состояние
    /** @type {boolean} Жест активен */
    this._active = false;

    /** @type {string|null} Преобладающее направление */
    this._direction = null;

    /** @type {number|null} Таймер защиты от зависания */
    this._gestureTimeout = null;

    // Бинд методов для сохранения контекста
    this._handleTouchStart = this._handleTouchStart.bind(this);
    this._handleTouchMove = this._handleTouchMove.bind(this);
    this._handleTouchEnd = this._handleTouchEnd.bind(this);
    this._handleMouseDown = this._handleMouseDown.bind(this);
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleMouseUp = this._handleMouseUp.bind(this);

    // Touch-события
    element.addEventListener('touchstart', this._handleTouchStart, { passive: true });
    element.addEventListener('touchmove', this._handleTouchMove, { passive: true });
    element.addEventListener('touchend', this._handleTouchEnd);
    element.addEventListener('touchcancel', this._handleTouchEnd);

    // Mouse-события (десктоп)
    element.addEventListener('mousedown', this._handleMouseDown);
  }

  // ═══════════════════════════════════════
  // TOUCH-ОБРАБОТЧИКИ
  // ═══════════════════════════════════════

  /** @param {TouchEvent} e */
  _handleTouchStart(e) {
    this._startGesture(e.touches[0].clientX, e.touches[0].clientY);
  }

  /** @param {TouchEvent} e */
  _handleTouchMove(e) {
    if (!this._active) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - this._startX;
    const deltaY = touch.clientY - this._startY;

    // Определяем направление если ещё не определено
    if (!this._direction && (Math.abs(deltaX) > DIRECTION_DETECT_OFFSET || Math.abs(deltaY) > DIRECTION_DETECT_OFFSET)) {
      if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        this._direction = deltaX < 0 ? DIRECTION.LEFT : DIRECTION.RIGHT;
      } else {
        this._direction = deltaY < 0 ? DIRECTION.UP : DIRECTION.DOWN;
      }
    }

    this._moveGesture(deltaX, deltaY);
  }

  /** @param {TouchEvent} e */
  _handleTouchEnd(e) {
    if (!this._active) return;
    this._active = false;

    const touch = e.changedTouches[0];
    const deltaX = touch ? touch.clientX - this._startX : 0;
    const deltaY = touch ? touch.clientY - this._startY : 0;
    this._finishGesture(deltaX, deltaY);
  }

  // ═══════════════════════════════════════
  // MOUSE-ОБРАБОТЧИКИ
  // ═══════════════════════════════════════

  /** @param {MouseEvent} e */
  _handleMouseDown(e) {
    // Только левая кнопка
    if (e.button !== 0) return;
    // Не начинаем новый жест пока старый активен
    if (this._active) return;

    this._startGesture(e.clientX, e.clientY);
    document.addEventListener('mousemove', this._handleMouseMove);
    document.addEventListener('mouseup', this._handleMouseUp);
  }

  /** @param {MouseEvent} e */
  _handleMouseMove(e) {
    if (!this._active) return;

    const deltaX = e.clientX - this._startX;
    const deltaY = e.clientY - this._startY;

    // Определяем направление
    if (!this._direction && (Math.abs(deltaX) > DIRECTION_DETECT_OFFSET || Math.abs(deltaY) > DIRECTION_DETECT_OFFSET)) {
      if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        this._direction = deltaX < 0 ? DIRECTION.LEFT : DIRECTION.RIGHT;
      } else {
        this._direction = deltaY < 0 ? DIRECTION.UP : DIRECTION.DOWN;
      }
    }

    this._moveGesture(deltaX, deltaY);
  }

  /** @param {MouseEvent} e */
  _handleMouseUp(e) {
    if (!this._active) return;
    this._active = false;

    document.removeEventListener('mousemove', this._handleMouseMove);
    document.removeEventListener('mouseup', this._handleMouseUp);

    this._finishGesture(e.clientX - this._startX, e.clientY - this._startY);
  }

  // ═══════════════════════════════════════
  // ОБЩАЯ ЛОГИКА ЖЕСТА
  // ═══════════════════════════════════════

  /**
   * Начало жеста.
   * Если предыдущий жест завис — принудительно завершаем.
   * @param {number} x
   * @param {number} y
   */
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

    // Защита от зависания
    if (this._gestureTimeout) clearTimeout(this._gestureTimeout);
    this._gestureTimeout = setTimeout(() => {
      if (this._active) {
        console.warn('SwipeManager: жест завис, принудительный сброс');
        this._finishGesture(0, 0);
      }
    }, GESTURE_TIMEOUT);
  }

  /**
   * Движение пальца/мыши.
   * Направление уже определено в обработчике, здесь только оповещение.
   * @param {number} deltaX
   * @param {number} deltaY
   */
  _moveGesture(deltaX, deltaY) {
    this._offsetX = deltaX;
    this._offsetY = deltaY;

    if (this._opts.onMove) {
      this._opts.onMove(this._offsetX, this._offsetY, this._direction);
    }
  }

  /**
   * Завершение жеста.
   * Определяет был ли свайп и вызывает соответствующие колбэки.
   * @param {number} deltaX — полное смещение по X
   * @param {number} deltaY — полное смещение по Y
   */
  _finishGesture(deltaX, deltaY) {
    this._active = false;

    if (this._gestureTimeout) {
      clearTimeout(this._gestureTimeout);
      this._gestureTimeout = null;
    }

    let triggeredDirection = null;

    // Определяем итоговое направление
    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      if (Math.abs(deltaX) > this._threshold) {
        triggeredDirection = deltaX < 0 ? DIRECTION.LEFT : DIRECTION.RIGHT;
      }
    } else {
      if (Math.abs(deltaY) > this._threshold) {
        triggeredDirection = deltaY < 0 ? DIRECTION.UP : DIRECTION.DOWN;
      }
    }

    // Вызываем колбэк свайпа
    if (triggeredDirection) {
      switch (triggeredDirection) {
        case DIRECTION.LEFT:  if (this._opts.onSwipeLeft)  this._opts.onSwipeLeft();  break;
        case DIRECTION.RIGHT: if (this._opts.onSwipeRight) this._opts.onSwipeRight(); break;
        case DIRECTION.UP:    if (this._opts.onSwipeUp)    this._opts.onSwipeUp();    break;
        case DIRECTION.DOWN:  if (this._opts.onSwipeDown)  this._opts.onSwipeDown();  break;
      }
    }

    // Колбэк отпускания — всегда
    if (this._opts.onRelease) {
      this._opts.onRelease(triggeredDirection, deltaX, deltaY);
    }

    // Сброс
    this._offsetX = 0;
    this._offsetY = 0;
    this._direction = DIRECTION.NONE;
  }

  // ═══════════════════════════════════════
  // ПУБЛИЧНЫЙ API
  // ═══════════════════════════════════════

  /**
   * Получить текущее смещение и направление.
   * @returns {{ x: number, y: number, direction: string|null }}
   */
  getOffset() {
    return { x: this._offsetX, y: this._offsetY, direction: this._direction };
  }

  /**
   * Активен ли жест прямо сейчас.
   * @returns {boolean}
   */
  isActive() {
    return this._active;
  }

  /**
   * Изменить порог срабатывания.
   * @param {number} px
   */
  setThreshold(px) {
    this._threshold = px;
  }

  /**
   * Принудительно завершить текущий жест без свайпа.
   */
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

  /**
   * Удалить все обработчики событий.
   * Вызывать при уничтожении компонента.
   */
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