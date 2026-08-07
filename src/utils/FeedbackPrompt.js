/**
 * FeedbackPrompt — подсказка обратной связи («пузырь»).
 * 
 * НАЗНАЧЕНИЕ:
 *   Показывает всплывающий пузырь с предложением оставить отзыв.
 *   Появляется после прочтения описания фото (скролл до конца) или
 *   по таймауту, если скроллить нечего.
 * 
 * КАК ЭТО РАБОТАЕТ:
 *   1. При открытии фото вызывается onPhotoOpened(id)
 *   2. Через CHECK_DELAY проверяется, можно ли скроллить описание
 *   3. Если скролла нет — пузырь показывается через NO_SCROLL_TIMER
 *   4. Если скролл есть — вешается слушатель, ждём доскролливания
 *   5. При доскролливании до SCROLL_THRESHOLD — показ через SCROLL_END_DELAY
 *   6. Пузырь скрывается через AUTO_HIDE_DELAY или по клику
 * 
 * ОГРАНИЧЕНИЯ:
 *   — Не более MAX_PROMPTS показов до сброса счётчика
 *   — Сброс после RESET_AFTER_PHOTOS просмотренных фото
 *   — Не показывается раньше INITIAL_DELAY после старта приложения
 *   — Дебаунс SCROLL_DEBOUNCE на скролл-событии
 *   — Дебаунс SHOW_DEBOUNCE между показами
 * 
 * РАСШИРЕНИЕ:
 *   — Добавить фразы в MESSAGES
 *   — Настроить тайминги в константах
 *   — При создании новых разделов приложения — добавить колбэк в cancel()
 */

// ═══════════════════════════════════════
// НАСТРОЙКИ
// ═══════════════════════════════════════

/**
 * Таймаут перед первым показом пузыря после открытия приложения (мс).
 * Пузырь не появится, пока пользователь не проведёт в приложении это время.
 * 600 000 мс = 10 минут.
 * Установи 0 для отключения задержки.
 */
const INITIAL_DELAY = 600000;

/**
 * Фразы для пузыря.
 * Выбирается случайная при каждом показе.
 * Чтобы добавить — просто добавь строку в массив.
 */
const MESSAGES = [
  'Понравилась выставка?',
  'Как вам фотографии?',
  'Поделитесь впечатлениями',
];

/** Сколько раз показать пузырь до сброса счётчика */
const MAX_PROMPTS = 3;

/** Через сколько просмотренных фото сбросить счётчик показов */
const RESET_AFTER_PHOTOS = 10;

/** Задержка перед проверкой скролла после открытия фото (мс) */
const CHECK_DELAY = 800;

/** Через сколько показать пузырь, если описание не скроллится (мс) */
const NO_SCROLL_TIMER = 5000;

/** Задержка после доскролливания до пузыря (мс) */
const SCROLL_END_DELAY = 1500;

/** Порог «конец скролла» в пикселях от низа */
const SCROLL_THRESHOLD = 40;

/** Через сколько пузырь скроется сам, если не кликнули (мс) */
const AUTO_HIDE_DELAY = 10000;

/** Длительность анимации появления/скрытия (мс). Совпадает с CSS transition */
const BUBBLE_ANIMATION = 300;

/** Минимальный интервал между показами (мс). Защита от двойного срабатывания */
const SHOW_DEBOUNCE = 500;

/** Дебаунс скролл-события (мс). Снижает нагрузку на главный поток */
const SCROLL_DEBOUNCE = 100;

// ═══════════════════════════════════════
// КЛЮЧИ LOCALSTORAGE
// ═══════════════════════════════════════

/** Сколько раз пузырь уже показан с последнего сброса */
const STORAGE_KEY_SHOWN = 'vk_exhibition_prompt_shown';

/** Сколько фото просмотрено с последнего сброса */
const STORAGE_KEY_PHOTO_COUNT = 'vk_exhibition_prompt_photo_count';

class FeedbackPrompt {
  constructor() {
    // Счётчики
    this._shown = 0;
    this._photoCount = 0;
    this._currentPhotoId = null;

    // Таймеры
    this._timer = null;
    this._hideTimer = null;
    this._scrollDebounceTimer = null;

    // DOM
    this._bubble = null;

    // Обработчики
    this._scrollHandler = null;

    // Состояние
    this._showing = false;
    this._lastShowTime = 0;
    this._startTime = Date.now();

    this._loadState();
  }

  // ═══════════════════════════════════════
  // СОСТОЯНИЕ (localStorage)
  // ═══════════════════════════════════════

  _loadState() {
    try {
      this._shown = parseInt(localStorage.getItem(STORAGE_KEY_SHOWN) || '0');
      this._photoCount = parseInt(localStorage.getItem(STORAGE_KEY_PHOTO_COUNT) || '0');
      if (isNaN(this._shown) || this._shown < 0) this._shown = 0;
      if (isNaN(this._photoCount) || this._photoCount < 0) this._photoCount = 0;
      if (this._shown > MAX_PROMPTS) this._shown = MAX_PROMPTS;
    } catch (e) {
      this._shown = 0;
      this._photoCount = 0;
    }
  }

  _saveState() {
    try {
      localStorage.setItem(STORAGE_KEY_SHOWN, this._shown.toString());
      localStorage.setItem(STORAGE_KEY_PHOTO_COUNT, this._photoCount.toString());
    } catch (e) {}
  }

  // ═══════════════════════════════════════
  // ПУБЛИЧНЫЙ API
  // ═══════════════════════════════════════

  /**
   * Вызвать при открытии фото.
   * @param {string} photoId — ID открытого фото
   */
  onPhotoOpened(photoId) {
    this._cancelAll();

    const photoScreen = document.getElementById('photo-screen');
    if (!photoScreen || photoScreen.classList.contains('hidden')) return;

    if (this._currentPhotoId !== photoId) {
      this._currentPhotoId = photoId;
      this._photoCount++;

      if (this._photoCount >= RESET_AFTER_PHOTOS) {
        this._shown = 0;
        this._photoCount = 0;
      }

      this._saveState();
    }

    if (this._shown >= MAX_PROMPTS) return;

    this._timer = setTimeout(() => this._checkScroll(), CHECK_DELAY);
  }

  /**
   * Принудительно скрыть пузырь.
   * @param {boolean} [instant=false] — true = мгновенно, false = с анимацией
   */
  cancel(instant = false) {
    this._cancelAll(instant);
  }

  // ═══════════════════════════════════════
  // ЛОГИКА ПОКАЗА
  // ═══════════════════════════════════════

  /** Проверить, можно ли скроллить описание */
  _checkScroll() {
    const photoScreen = document.getElementById('photo-screen');
    if (!photoScreen || photoScreen.classList.contains('hidden')) return;
    if (this._showing || this._shown >= MAX_PROMPTS) return;

    const slideEl = document.querySelector('.slide-center');
    if (!slideEl) return;

    requestAnimationFrame(() => {
      if (this._showing || this._shown >= MAX_PROMPTS) return;

      const canScroll = slideEl.scrollHeight > slideEl.clientHeight + 10;

      if (this._timer) clearTimeout(this._timer);
      this._timer = null;

      if (!canScroll) {
        // Скроллить нечего — таймер
        this._timer = setTimeout(() => this._show(), NO_SCROLL_TIMER);
      } else {
        // Вешаем слушатель скролла с дебаунсом
        if (this._scrollHandler) {
          slideEl.removeEventListener('scroll', this._scrollHandler);
        }
        this._scrollHandler = () => {
          if (this._scrollDebounceTimer) clearTimeout(this._scrollDebounceTimer);
          this._scrollDebounceTimer = setTimeout(() => this._onScroll(), SCROLL_DEBOUNCE);
        };
        slideEl.addEventListener('scroll', this._scrollHandler, { passive: true });
      }
    });
  }

  /** Вызывается при скролле (с дебаунсом) */
  _onScroll() {
    if (this._showing) return;
    const slideEl = document.querySelector('.slide-center');
    if (!slideEl) return;

    if (slideEl.scrollHeight - slideEl.scrollTop - slideEl.clientHeight <= SCROLL_THRESHOLD) {
      if (this._scrollHandler) {
        slideEl.removeEventListener('scroll', this._scrollHandler);
        this._scrollHandler = null;
      }
      if (this._timer) clearTimeout(this._timer);
      this._timer = setTimeout(() => this._show(), SCROLL_END_DELAY);
    }
  }

  /** Показать пузырь */
  _show() {
    const now = Date.now();

    // Дебаунс между показами
    if (now - this._lastShowTime < SHOW_DEBOUNCE) return;

    // Не показываем раньше INITIAL_DELAY
    if (now - this._startTime < INITIAL_DELAY) {
      const remaining = INITIAL_DELAY - (now - this._startTime);
      if (this._timer) clearTimeout(this._timer);
      this._timer = setTimeout(() => this._show(), remaining + 500);
      return;
    }

    if (this._shown >= MAX_PROMPTS || this._showing) return;

    this._showing = true;
    this._shown++;
    this._lastShowTime = now;
    this._saveState();

    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

    // Удаляем старый пузырь если есть
    this._hideBubble(true);

    // Создаём DOM пузыря
    const bubble = document.createElement('div');
    bubble.className = 'feedback-bubble';
    bubble.innerHTML = `
      <span>${message}</span>
      <button class="feedback-bubble-close">&times;</button>
    `;

    const tail = document.createElement('div');
    tail.className = 'feedback-bubble-tail';
    bubble.appendChild(tail);

    document.getElementById('app').appendChild(bubble);
    this._bubble = bubble;

    // Анимация появления
    requestAnimationFrame(() => {
      bubble.classList.add('visible');
    });

    // Клик по пузырю → форма обратной связи
    bubble.addEventListener('click', (e) => {
      if (!e.target.classList.contains('feedback-bubble-close')) {
        this._cancelAll(true);
        document.getElementById('feedback-btn')?.click();
      }
    });

    // Крестик закрытия
    bubble.querySelector('.feedback-bubble-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this._hideBubble();
    });

    // Автоскрытие
    this._hideTimer = setTimeout(() => this._hideBubble(), AUTO_HIDE_DELAY);
  }

  // ═══════════════════════════════════════
  // УПРАВЛЕНИЕ ПУЗЫРЁМ
  // ═══════════════════════════════════════

  /**
   * Скрыть пузырь.
   * @param {boolean} [instant=false] — true = мгновенно, false = с анимацией
   */
  _hideBubble(instant = false) {
    if (!this._bubble) return;

    if (instant) {
      this._bubble.remove();
      this._bubble = null;
    } else {
      this._bubble.classList.remove('visible');
      setTimeout(() => {
        if (this._bubble) {
          this._bubble.remove();
          this._bubble = null;
        }
      }, BUBBLE_ANIMATION);
    }

    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
  }

  /**
   * Полная отмена: таймеры, скролл, пузырь.
   * @param {boolean} [instant=false]
   */
  _cancelAll(instant = false) {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._scrollDebounceTimer) {
      clearTimeout(this._scrollDebounceTimer);
      this._scrollDebounceTimer = null;
    }
    if (this._scrollHandler) {
      const slideEl = document.querySelector('.slide-center');
      if (slideEl) slideEl.removeEventListener('scroll', this._scrollHandler);
      this._scrollHandler = null;
    }
    this._showing = false;
    this._hideBubble(instant);
  }
}

export default new FeedbackPrompt();