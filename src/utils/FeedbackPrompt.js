/**
 * FeedbackPrompt — подсказка обратной связи («пузырь»).
 */

// ═══════════════════════════════════════
// НАСТРОЙКИ
// ═══════════════════════════════════════
/**
 * Таймаут перед первым показом пузыря после открытия приложения (мс).
 * Пузырь не появится раньше этого времени, даже если условия выполнены.
 * 10 минут = 600 000 мс.
 * Установи 0 для отключения задержки.
 */
const INITIAL_DELAY = 30000; // 10 минут

const MESSAGES = [
  'Понравилась выставка?',
  'Как вам фотографии?',
  'Поделитесь впечатлениями',
];

const MAX_PROMPTS = 3;
const RESET_AFTER_PHOTOS = 10;
const CHECK_DELAY = 800;
const NO_SCROLL_TIMER = 5000;
const SCROLL_END_DELAY = 1500;
const SCROLL_THRESHOLD = 40;
const AUTO_HIDE_DELAY = 10000;
const BUBBLE_ANIMATION = 300;
const SHOW_DEBOUNCE = 500;

const STORAGE_KEY_SHOWN = 'vk_exhibition_prompt_shown';
const STORAGE_KEY_PHOTO_COUNT = 'vk_exhibition_prompt_photo_count';

class FeedbackPrompt {
  constructor() {
    this._shown = 0;
    this._photoCount = 0;
    this._currentPhotoId = null;
    this._timer = null;
    this._bubble = null;
    this._hideTimer = null;
    this._scrollHandler = null;
    this._showing = false;
    this._lastShowTime = 0;
    /** @type {number} Время запуска приложения */
    this._startTime = Date.now();
    this._loadState();
  }

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

  cancel(instant = false) {
    this._cancelAll(instant);
  }

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
        this._timer = setTimeout(() => this._show(), NO_SCROLL_TIMER);
      } else {
        if (this._scrollHandler) {
          slideEl.removeEventListener('scroll', this._scrollHandler);
        }
        this._scrollHandler = () => this._onScroll();
        slideEl.addEventListener('scroll', this._scrollHandler, { passive: true });
      }
    });
  }

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

     _show() {
    const now = Date.now();
    console.log('FP: _show called, now=', now, 'lastShow=', this._lastShowTime, 'startTime=', this._startTime, 'diff=', now - this._startTime, 'INITIAL_DELAY=', INITIAL_DELAY);
    
    if (now - this._lastShowTime < SHOW_DEBOUNCE) {
      console.log('FP: дебаунс, выход');
      return;
    }

    // Не показываем раньше чем через INITIAL_DELAY после старта
    if (now - this._startTime < INITIAL_DELAY) {
      console.log('FP: ещё не прошло INITIAL_DELAY, ждём');
      // Запускаем повторную проверку когда таймаут истечёт
      const remaining = INITIAL_DELAY - (now - this._startTime);
      if (this._timer) clearTimeout(this._timer);
      this._timer = setTimeout(() => this._show(), remaining + 500);
      return;
    }

    if (this._shown >= MAX_PROMPTS || this._showing) {
      console.log('FP: лимит показов или уже показываем, выход');
      return;
    }

    console.log('FP: показываем пузырь');

    const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

    this._hideBubble(true);

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

    requestAnimationFrame(() => {
      bubble.classList.add('visible');
    });

    bubble.addEventListener('click', (e) => {
      if (!e.target.classList.contains('feedback-bubble-close')) {
        this._cancelAll(true);
        document.getElementById('feedback-btn')?.click();
      }
    });

    bubble.querySelector('.feedback-bubble-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this._hideBubble();
    });

    this._hideTimer = setTimeout(() => this._hideBubble(), AUTO_HIDE_DELAY);
  }

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

  _cancelAll(instant = false) {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
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