/**
 * FeedbackPrompt — подсказка обратной связи («пузырь»).
 * 
 * Появляется после прочтения описания фото (скролл до конца) или по таймауту,
 * если скроллить нечего. Содержит случайную фразу, при клике открывает
 * форму обратной связи.
 */

// ═══════════════════════════════════════
// НАСТРОЙКИ
// ═══════════════════════════════════════

const MESSAGES = [
  'Понравилась выставка?',
  'Как вам фотографии?',
  'Поделитесь впечатлениями',
];

/** Максимальное количество показов пузыря до сброса */
const MAX_PROMPTS = 3;

/** Количество фото для сброса счётчика показов */
const RESET_AFTER_PHOTOS = 10;

/** Задержка перед проверкой скролла (мс) */
const CHECK_DELAY = 800;

/** Таймер показа, если контент не скроллится (мс) */
const NO_SCROLL_TIMER = 5000;

/** Задержка после доскролливания до конца (мс) */
const SCROLL_END_DELAY = 1500;

/** Порог «доскроллено до конца» (px) */
const SCROLL_THRESHOLD = 40;

/** Автоскрытие пузыря (мс) */
const AUTO_HIDE_DELAY = 10000;

/** Длительность анимации (мс) */
const BUBBLE_ANIMATION = 300;

/** Дебаунс между показами (мс) */
const SHOW_DEBOUNCE = 500;

// ═══════════════════════════════════════
// КЛЮЧИ LOCALSTORAGE
// ═══════════════════════════════════════

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
    console.log('FP: onPhotoOpened, id=', photoId, 'shown=', this._shown, 'photoCount=', this._photoCount);

    this._cancelAll();

    const photoScreen = document.getElementById('photo-screen');
    console.log('FP: photoScreen hidden?', photoScreen?.classList.contains('hidden'));

    if (!photoScreen || photoScreen.classList.contains('hidden')) {
      console.log('FP: экран фото скрыт, выход');
      return;
    }

    if (this._currentPhotoId !== photoId) {
      this._currentPhotoId = photoId;
      this._photoCount++;

      if (this._photoCount >= RESET_AFTER_PHOTOS) {
        this._shown = 0;
        this._photoCount = 0;
      }

      this._saveState();
    }

    if (this._shown >= MAX_PROMPTS) {
      console.log('FP: лимит показов исчерпан');
      return;
    }

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
    console.log('FP: _checkScroll, slideEl found?', !!slideEl);
    if (!slideEl) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this._showing || this._shown >= MAX_PROMPTS) return;

        const canScroll = slideEl.scrollHeight > slideEl.clientHeight + 10;
        console.log('FP: scrollH', slideEl.scrollHeight, 'clientH', slideEl.clientHeight, 'canScroll', canScroll);

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
    });
  }

  _onScroll() {
    if (this._showing) return;
    const slideEl = document.querySelector('.slide-center');
    if (!slideEl) return;

    const distanceToBottom = slideEl.scrollHeight - slideEl.scrollTop - slideEl.clientHeight;
    console.log('FP: distanceToBottom', distanceToBottom, 'threshold', SCROLL_THRESHOLD);

    if (distanceToBottom <= SCROLL_THRESHOLD) {
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
    if (now - this._lastShowTime < SHOW_DEBOUNCE) return;
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
    console.log('FP: показываем пузырь:', message);

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