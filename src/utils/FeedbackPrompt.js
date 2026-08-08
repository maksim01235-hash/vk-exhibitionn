/**
 * FeedbackPrompt — подсказка обратной связи («пузырь»).
 * 
 * НАЗНАЧЕНИЕ:
 *   Показывает всплывающий пузырь с предложением оставить отзыв.
 *   Появляется после прочтения описания (скролл до конца) или по таймауту.
 * 
 * КАК ЭТО РАБОТАЕТ:
 *   1. onPhotoOpened(id) — запускает проверку скролла через CHECK_DELAY
 *   2. Если скролла нет — пузырь через NO_SCROLL_TIMER
 *   3. Если скролл есть — слушатель с дебаунсом, ждёт конца
 *   4. Пузырь скрывается через AUTO_HIDE_DELAY или по клику
 * 
 * ОГРАНИЧЕНИЯ:
 *   — Не более MAX_PROMPTS показов до сброса
 *   — Сброс после RESET_AFTER_PHOTOS фото
 *   — Не показывается раньше INITIAL_DELAY после первого запуска
 *   — Не показывается на экране QR-сканера
 *   — Дебаунс на скролл и между показами
 * 
 * РАСШИРЕНИЕ:
 *   — Добавить фразы в MESSAGES
 *   — Настроить тайминги в константах
 */

import { createLogger } from '../utils/Logger.js';

// ═══════════════════════════════════════
// НАСТРОЙКИ
// ═══════════════════════════════════════

/** Включить логирование */
const DEBUG = true;

/**
 * Таймаут перед первым показом пузыря после первого запуска (мс).
 * 600 000 мс = 10 минут. Установи 0 для отключения задержки.
 */
const INITIAL_DELAY = 600000;

/** Фразы для пузыря — выбирается случайная */
const MESSAGES = [
  'Понравилась выставка?',
  'Как вам фотографии?',
  'Поделитесь впечатлениями',
];

/** Максимум показов до сброса счётчика */
const MAX_PROMPTS = 3;

/** Через сколько фото сбросить счётчик */
const RESET_AFTER_PHOTOS = 10;

/** Задержка перед проверкой скролла (мс) */
const CHECK_DELAY = 800;

/** Таймер показа если нечего скроллить (мс) */
const NO_SCROLL_TIMER = 15000;

/** Задержка после доскролливания (мс) */
const SCROLL_END_DELAY = 1500;

/** Порог конца скролла (px) */
const SCROLL_THRESHOLD = 40;

/** Автоскрытие пузыря (мс) */
const AUTO_HIDE_DELAY = 10000;

/** Длительность анимации (мс) — совпадает с CSS */
const BUBBLE_ANIMATION = 300;

/** Дебаунс между показами (мс) */
const SHOW_DEBOUNCE = 500;

/** Дебаунс скролл-события (мс) */
const SCROLL_DEBOUNCE = 100;

// ═══════════════════════════════════════
// КЛЮЧИ LOCALSTORAGE
// ═══════════════════════════════════════

const STORAGE_KEY_START_TIME = 'vk_exhibition_prompt_start_time';
const STORAGE_KEY_SHOWN = 'vk_exhibition_prompt_shown';
const STORAGE_KEY_PHOTO_COUNT = 'vk_exhibition_prompt_photo_count';

// ═══════════════════════════════════════
// ЛОГГЕР
// ═══════════════════════════════════════

const log = createLogger('FP', DEBUG);

class FeedbackPrompt {
  constructor() {
    this._shown = 0;
    this._photoCount = 0;
    this._currentPhotoId = null;

    this._timer = null;
    this._hideTimer = null;
    this._scrollDebounceTimer = null;

    this._bubble = null;
    this._scrollHandler = null;

    this._showing = false;
    this._lastShowTime = 0;
    this._startTime = this._loadStartTime();

    this._loadState();
    log(`инициализация, startTime=${this._startTime}, прошло=${Date.now() - this._startTime}мс`);
  }

  // ═══════════════════════════════════════
  // СОСТОЯНИЕ (localStorage)
  // ═══════════════════════════════════════

  _loadStartTime() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_START_TIME);
      if (saved) return parseInt(saved);
    } catch (e) {}
    const now = Date.now();
    this._saveStartTime(now);
    return now;
  }

  _saveStartTime(time) {
    try { localStorage.setItem(STORAGE_KEY_START_TIME, time.toString()); } catch (e) {}
  }

  _loadState() {
    try {
      this._shown = parseInt(localStorage.getItem(STORAGE_KEY_SHOWN) || '0');
      this._photoCount = parseInt(localStorage.getItem(STORAGE_KEY_PHOTO_COUNT) || '0');
      if (isNaN(this._shown) || this._shown < 0) this._shown = 0;
      if (isNaN(this._photoCount) || this._photoCount < 0) this._photoCount = 0;
      if (this._shown > MAX_PROMPTS) this._shown = MAX_PROMPTS;
    } catch (e) { this._shown = 0; this._photoCount = 0; }
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

  onPhotoOpened(photoId) {
    log(`фото #${photoId}, показано=${this._shown}/${MAX_PROMPTS}, фото=${this._photoCount}`);
    this._cancelAll();

    const photoScreen = document.getElementById('photo-screen');
    if (!photoScreen || photoScreen.classList.contains('hidden')) return;

    if (this._currentPhotoId !== photoId) {
      this._currentPhotoId = photoId;
      this._photoCount++;
      if (this._photoCount >= RESET_AFTER_PHOTOS) {
        this._shown = 0;
        this._photoCount = 0;
        log('счётчики сброшены');
      }
      this._saveState();
    }

    if (this._shown >= MAX_PROMPTS) { log('лимит показов'); return; }

    this._timer = setTimeout(() => this._checkScroll(), CHECK_DELAY);
  }

  cancel(instant = false) {
    this._cancelAll(instant);
  }

  // ═══════════════════════════════════════
  // ЛОГИКА ПОКАЗА
  // ═══════════════════════════════════════

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
        log(`нечего скроллить, таймер ${NO_SCROLL_TIMER}мс`);
        this._timer = setTimeout(() => this._show(), NO_SCROLL_TIMER);
      } else {
        if (this._scrollHandler) slideEl.removeEventListener('scroll', this._scrollHandler);
        this._scrollHandler = () => {
          if (this._scrollDebounceTimer) clearTimeout(this._scrollDebounceTimer);
          this._scrollDebounceTimer = setTimeout(() => this._onScroll(), SCROLL_DEBOUNCE);
        };
        slideEl.addEventListener('scroll', this._scrollHandler, { passive: true });
      }
    });
  }

  _onScroll() {
    if (this._showing) return;
    const slideEl = document.querySelector('.slide-center');
    if (!slideEl) return;

    if (slideEl.scrollHeight - slideEl.scrollTop - slideEl.clientHeight <= SCROLL_THRESHOLD) {
      log('доскроллили до конца');
      if (this._scrollHandler) { slideEl.removeEventListener('scroll', this._scrollHandler); this._scrollHandler = null; }
      if (this._timer) clearTimeout(this._timer);
      this._timer = setTimeout(() => this._show(), SCROLL_END_DELAY);
    }
  }

  _show() {
    const now = Date.now();

    if (now - this._lastShowTime < SHOW_DEBOUNCE) return;

    // Не показываем на QR-сканере
    const qrScreen = document.getElementById('qr-screen');
    if (qrScreen && !qrScreen.classList.contains('hidden')) return;

    if (now - this._startTime < INITIAL_DELAY) {
      const remaining = INITIAL_DELAY - (now - this._startTime);
      log(`ждём INITIAL_DELAY, осталось ${remaining}мс`);
      if (this._timer) clearTimeout(this._timer);
      this._timer = setTimeout(() => this._show(), remaining + 500);
      return;
    }

    if (this._shown >= MAX_PROMPTS || this._showing) return;

    this._showing = true;
    this._shown++;
    this._lastShowTime = now;
    this._saveState();

    if (this._timer) { clearTimeout(this._timer); this._timer = null; }

    const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    log(`показываем: "${message}"`);

    this._hideBubble(true);

    const bubble = document.createElement('div');
    bubble.className = 'feedback-bubble';
    bubble.innerHTML = `<span>${message}</span><button class="feedback-bubble-close">&times;</button>`;
    const tail = document.createElement('div');
    tail.className = 'feedback-bubble-tail';
    bubble.appendChild(tail);

    document.getElementById('app').appendChild(bubble);
    this._bubble = bubble;

    requestAnimationFrame(() => bubble.classList.add('visible'));

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
    if (instant) { this._bubble.remove(); this._bubble = null; }
    else {
      this._bubble.classList.remove('visible');
      setTimeout(() => { if (this._bubble) { this._bubble.remove(); this._bubble = null; } }, BUBBLE_ANIMATION);
    }
    if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
  }

  _cancelAll(instant = false) {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this._scrollDebounceTimer) { clearTimeout(this._scrollDebounceTimer); this._scrollDebounceTimer = null; }
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