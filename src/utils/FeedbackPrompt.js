// ═══════════════════════════════════════
// НАСТРОЙКИ
// ═══════════════════════════════════════

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

// ═══════════════════════════════════════

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
    console.log('FP: фото открыто', photoId, '| показано', this._shown, '/', MAX_PROMPTS, '| фото', this._photoCount);
    
    // Полная отмена всего
    this._cancelAll();
    
    const photoScreen = document.getElementById('photo-screen');
    if (!photoScreen || photoScreen.classList.contains('hidden')) {
      console.log('FP: экран фото скрыт');
      return;
    }
    
    if (this._currentPhotoId !== photoId) {
      this._currentPhotoId = photoId;
      this._photoCount++;
      
      if (this._photoCount >= RESET_AFTER_PHOTOS) {
        this._shown = 0;
        this._photoCount = 0;
        console.log('FP: счётчики сброшены');
      }
      
      this._saveState();
    }

    if (this._shown >= MAX_PROMPTS) {
      console.log('FP: лимит показов');
      return;
    }

    // Один таймер на проверку
    this._timer = setTimeout(() => this._checkScroll(), CHECK_DELAY);
  }

  _checkScroll() {
    // Проверяем, не ушли ли с фото и не показываем ли уже
    const photoScreen = document.getElementById('photo-screen');
    if (!photoScreen || photoScreen.classList.contains('hidden')) return;
    if (this._showing) return;
    if (this._shown >= MAX_PROMPTS) return;

    const infoEl = document.getElementById('photo-info');
    if (!infoEl) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this._showing) return;
        if (this._shown >= MAX_PROMPTS) return;
        
        const scrollHeight = infoEl.scrollHeight;
        const clientHeight = infoEl.clientHeight;
        const canScroll = scrollHeight > clientHeight + 10;
        console.log('FP: scrollH', scrollHeight, 'clientH', clientHeight, 'canScroll', canScroll);

        // Чистим старый таймер
        if (this._timer) clearTimeout(this._timer);
        this._timer = null;

        if (!canScroll) {
          console.log('FP: таймер', NO_SCROLL_TIMER, 'мс');
          this._timer = setTimeout(() => this._show(), NO_SCROLL_TIMER);
        } else {
          console.log('FP: слушаем скролл');
          // Снимаем старый обработчик
          if (this._scrollHandler) {
            infoEl.removeEventListener('scroll', this._scrollHandler);
          }
          this._scrollHandler = () => this._onScroll();
          infoEl.addEventListener('scroll', this._scrollHandler, { passive: true });
        }
      });
    });
  }

  _onScroll() {
    if (this._showing) return;
    const infoEl = document.getElementById('photo-info');
    if (!infoEl) return;

    const distanceToBottom = infoEl.scrollHeight - infoEl.scrollTop - infoEl.clientHeight;
    
    if (distanceToBottom <= SCROLL_THRESHOLD) {
      console.log('FP: доскроллили, показ через', SCROLL_END_DELAY, 'мс');
      if (this._scrollHandler) {
        infoEl.removeEventListener('scroll', this._scrollHandler);
        this._scrollHandler = null;
      }
      if (this._timer) clearTimeout(this._timer);
      this._timer = setTimeout(() => this._show(), SCROLL_END_DELAY);
    }
  }

  _show() {
    // Жёсткий дебаунс
    const now = Date.now();
    if (now - this._lastShowTime < SHOW_DEBOUNCE) {
      console.log('FP: дебаунс, пропускаем');
      return;
    }
    
    if (this._shown >= MAX_PROMPTS || this._showing) return;
    
    this._showing = true;
    this._shown++;
    this._lastShowTime = now;
    this._saveState();
    
    // Чистим все таймеры
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    
    const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    console.log('FP: показываем:', message);
    
    this._hideBubble();
    
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
        this._hideBubble();
        document.getElementById('feedback-btn')?.click();
      }
    });
    
    bubble.querySelector('.feedback-bubble-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this._hideBubble();
    });
    
    this._hideTimer = setTimeout(() => this._hideBubble(), AUTO_HIDE_DELAY);
  }

  _hideBubble() {
    if (this._bubble) {
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

  _cancelAll() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._scrollHandler) {
      const infoEl = document.getElementById('photo-info');
      if (infoEl) infoEl.removeEventListener('scroll', this._scrollHandler);
      this._scrollHandler = null;
    }
    this._showing = false;
    this._hideBubble();
  }
    cancel() {
    this._cancelAll();
  }
}
export default new FeedbackPrompt();