/**
 * UIManager — управление экранами приложения.
 * 
 * Отвечает за:
 *   - Переключение между экранами: галерея, фото, QR-сканер, обратная связь
 *   - Обработку навигационных событий от Router
 *   - Управление видимостью кнопки обратной связи
 *   - Отложенный переход к фото (пока данные не загружены)
 * 
 * При расширении можно добавить:
 *   - Экран достижений
 *   - Экран анонсов
 *   - Модальные окна (подтверждения, уведомления)
 *   - Анимации переходов между экранами
 * 
 * Схема навигации:
 *   Галерея ←→ Фото ←→ QR-сканер
 *   Галерея ←→ Обратная связь
 *   Фото ←→ Обратная связь
 *   Галерея ←→ Фото (по ссылке /#id)
 */

import Store from '../core/Store.js';
import EventBus from '../core/EventBus.js';
import GalleryView from './GalleryView.js';
import PhotoView from './PhotoView.js';
import QRScanner from './QRScanner.js';
import FeedbackPrompt from '../utils/FeedbackPrompt.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/** Селекторы экранов */
const SCREENS = {
  gallery:  'gallery-screen',
  photo:    'photo-screen',
  qr:       'qr-screen',
  feedback: 'feedback-screen',
};

/** CSS-класс для кнопки обратной связи на экране фото */
const SHIFTED_CLASS = 'shifted';

/** Длительность анимации закрытия формы (мс) */
const FEEDBACK_CLOSE_DURATION = 300;

/** Ключи EmailJS */
const EMAILJS = {
  serviceId:  'service_ym4iqcu',
  templateId: 'template_x16we4g',
  publicKey:  'oRCD9VBQMxpxKkwIm',
};

class UIManager {
  constructor() {
    /** @type {HTMLElement} */
    this._galleryScreen = document.getElementById(SCREENS.gallery);
    /** @type {HTMLElement} */
    this._photoScreen = document.getElementById(SCREENS.photo);
    /** @type {HTMLElement} */
    this._qrScreen = document.getElementById(SCREENS.qr);
    /** @type {HTMLElement} */
    this._loading = document.getElementById('loading');

    /** @type {GalleryView|null} */
    this._galleryView = null;
    /** @type {PhotoView|null} */
    this._photoView = null;
    /** @type {QRScanner|null} */
    this._qrScanner = null;

    /** @type {string} Текущий активный экран */
    this._currentScreen = 'gallery';

    /** @type {boolean} Была ли первая инициализация */
    this._initialized = false;

    /** @type {string|null} ID фото для отложенного открытия */
    this._pendingPhotoId = null;

    /** @type {string|null} Экран, с которого открыли обратную связь */
    this._screenBeforeFeedback = null;

     /** @type {string|null} Экран, с которого открыли сканер QR */
    this._screenBeforeQR = null;
  }

  // ═══════════════════════════════════════
  // ИНИЦИАЛИЗАЦИЯ
  // ═══════════════════════════════════════

  /**
   * Инициализировать UI: создать компоненты, подписаться на события.
   * Вызывается один раз при старте приложения.
   */
  init() {
    this._galleryView = new GalleryView();
    this._photoView = new PhotoView();
    this._qrScanner = new QRScanner();

    // Подписки на навигационные события
    EventBus.on('router:openGallery', () => this.showGallery());
    EventBus.on('router:openQR', () => this.showQR());

    // Открытие фото: может быть отложенным, если данные ещё не загружены
    EventBus.on('router:openPhoto', (id) => {
      if (Store.getCount() === 0) {
        this._pendingPhotoId = id;
      } else if (!this._initialized || this._currentScreen !== 'photo') {
        this._pendingPhotoId = null;
        this.showPhoto(id);
      }
    });

    // Данные загружены — определяем начальный экран
    EventBus.on('photos:loaded', () => this._onDataLoaded());
    EventBus.on('photos:error', () => this._onDataError());

    // Кнопки навигации
    document.getElementById('scan-btn-gallery').addEventListener('click', () => this.showQR());
    document.getElementById('scan-btn-photo').addEventListener('click', () => this.showQR());
    document.getElementById('back-to-gallery-btn').addEventListener('click', () => this.showGallery());
    document.getElementById('close-qr-btn').addEventListener('click', () => this._goBack());

    // Кнопка обратной связи
    const feedbackBtn = document.getElementById('feedback-btn');
    if (feedbackBtn) {
      feedbackBtn.addEventListener('click', () => this._openFeedback());
    }
  }

  /**
   * Данные загружены — показать начальный экран.
   */
  _onDataLoaded() {
    this._hideLoading();

    // Если был отложенный переход к фото
    if (this._pendingPhotoId) {
      const id = this._pendingPhotoId;
      this._pendingPhotoId = null;
      this._initialized = true;
      this.showPhoto(id);
      return;
    }

    // Если в URL есть хеш — открыть фото
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
      const id = hash.substring(1).replace(/^\//, '');
      if (id && Store.navigateToId(id)) {
        this._initialized = true;
        this.showPhoto(id);
        return;
      }
    }

    // По умолчанию — галерея
    if (!this._initialized) {
      this._initialized = true;
      this.showGallery();
    }
  }

  /**
   * Ошибка загрузки данных — показать галерею (с заглушкой).
   */
  _onDataError() {
    this._hideLoading();
    if (!this._initialized) {
      this._initialized = true;
      this.showGallery();
    }
  }

  // ═══════════════════════════════════════
  // НАВИГАЦИЯ
  // ═══════════════════════════════════════

  /**
   * Показать галерею.
   * Очищает хеш URL, отменяет пузырь подсказки.
   */
  showGallery() {
    this._currentScreen = 'gallery';
    this._galleryScreen.classList.remove('hidden');
    this._photoScreen.classList.add('hidden');
    this._qrScreen.classList.add('hidden');
    this._hideFeedbackScreen();
    this._qrScanner.stop();
    this._photoView.resetSwipe();  // ← добавить
    this._galleryView.render();
    this._setFeedbackBtnShifted(false);
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname);
    }
    FeedbackPrompt.cancel();
  }

  /**
   * Показать экран фотографии.
   * @param {string} [id] — ID фото для перехода
   */
  showPhoto(id) {
    this._currentScreen = 'photo';
    this._galleryScreen.classList.add('hidden');
    this._photoScreen.classList.remove('hidden');
    this._qrScreen.classList.add('hidden');
    this._hideFeedbackScreen();
    this._qrScanner.stop();

    // Кнопка обратной связи в верхней позиции (чтобы не перекрывать тулбар)
    this._setFeedbackBtnShifted(true);

    if (id) Store.navigateToId(id);
    this._photoView.render();
  }

  /**
   * Показать QR-сканер.
   */
  showQR() {
    // Запоминаем откуда пришли
    this._screenBeforeQR = this._currentScreen;

    this._currentScreen = 'qr';
    this._galleryScreen.classList.add('hidden');
    this._photoScreen.classList.add('hidden');
    this._hideFeedbackScreen();
    this._qrScreen.classList.remove('hidden');
    this._qrScanner.start();
    this._photoView.resetSwipe();
    this._setFeedbackBtnShifted(false);
  }

  /**
   * Вернуться назад (из QR-сканера или фото — в галерею).
   */
  _goBack() {
    if (this._currentScreen === 'qr') {
      this._qrScanner.stop();

      if (this._screenBeforeQR === 'photo') {
        this.showPhoto();
      } else {
        this.showGallery();
      }
    } else if (this._currentScreen === 'photo') {
      this.showGallery();
    }
  }

  // ═══════════════════════════════════════
  // КНОПКА ОБРАТНОЙ СВЯЗИ
  // ═══════════════════════════════════════

  /**
   * Установить позицию кнопки обратной связи.
   * @param {boolean} shifted — true = поднять выше (на экране фото)
   */
  _setFeedbackBtnShifted(shifted) {
    const fb = document.getElementById('feedback-btn');
    if (!fb) return;
    if (shifted) {
      fb.classList.add(SHIFTED_CLASS);
    } else {
      fb.classList.remove(SHIFTED_CLASS);
    }
  }

  // ═══════════════════════════════════════
  // ОБРАТНАЯ СВЯЗЬ — экран
  // ═══════════════════════════════════════

  /**
   * Открыть экран обратной связи.
   */
  _openFeedback() {

        // Скрываем пузырь, если он виден
    FeedbackPrompt.cancel();

    const fb = document.getElementById('feedback-btn');
    if (fb) fb.classList.add('hidden');

    this._screenBeforeFeedback = this._currentScreen;

    this._galleryScreen.classList.add('hidden');
    this._photoScreen.classList.add('hidden');
    this._qrScreen.classList.add('hidden');
    this._qrScanner.stop();
    this._photoView.resetSwipe();  // ← добавить
    this._currentScreen = 'feedback';

    let feedbackScreen = document.getElementById(SCREENS.feedback);
    if (!feedbackScreen) {
      feedbackScreen = this._createFeedbackScreen();
    }

    this._resetFeedbackForm();
    feedbackScreen.classList.remove('hidden');
  }

  /**
   * Создать DOM экрана обратной связи (один раз).
   * @returns {HTMLElement}
   */
  _createFeedbackScreen() {
    const screen = document.createElement('div');
    screen.id = SCREENS.feedback;
    screen.className = 'screen';
    screen.innerHTML = `
      <div class="toolbar">
        <button id="close-feedback-btn" class="icon-btn" title="Назад">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h1 class="toolbar-title">Обратная связь</h1>
        <div style="width:40px"></div>
      </div>
      <div class="feedback-content">
        <form id="feedback-form" class="feedback-form">
          <input type="text" id="feedback-name" class="feedback-input" placeholder="Ваше имя" required />
          <input type="email" id="feedback-email" class="feedback-input" placeholder="Ваша почта" required />
          <textarea id="feedback-message" class="feedback-textarea" placeholder="Ваше сообщение..." rows="5" required></textarea>
          <button type="submit" id="feedback-submit" class="feedback-submit-btn">
            <span class="btn-text">Отправить</span>
          </button>
        </form>
        <div id="feedback-success" class="feedback-success hidden">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <p>Сообщение отправлено!</p>
          <p style="font-size:14px;color:var(--text-muted)">Мы ответим вам в ближайшее время</p>
        </div>
        <div id="feedback-error" class="feedback-error hidden">
          <p>Ошибка при отправке. Попробуйте позже.</p>
        </div>
      </div>
    `;
    document.getElementById('app').appendChild(screen);

    // Кнопка «Назад»
    document.getElementById('close-feedback-btn').addEventListener('click', () => {
      this._animateCloseFeedback(screen);
    });

    // Отправка формы
    document.getElementById('feedback-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this._sendFeedback();
    });

    return screen;
  }

  /**
   * Анимированное закрытие экрана обратной связи.
   */
  _animateCloseFeedback(screen) {
    screen.style.animation = `feedbackSlideDown ${FEEDBACK_CLOSE_DURATION}ms ease forwards`;
    screen.addEventListener('animationend', () => {
      screen.classList.add('hidden');
      screen.style.animation = '';

      // Показываем кнопку обратной связи
      const fb = document.getElementById('feedback-btn');
      if (fb) fb.classList.remove('hidden');

      this._resetFeedbackForm();

      // Возвращаемся на экран, с которого пришли
        if (this._screenBeforeFeedback === 'photo') {
          this._currentScreen = 'photo';
          this._galleryScreen.classList.add('hidden');
          this._photoScreen.classList.remove('hidden');
          this._qrScreen.classList.add('hidden');
          this._setFeedbackBtnShifted(true);
          this._photoView.resetSwipe();  // ← добавить
        } else {
        this.showGallery();
      }
    }, { once: true });
  }

  /**
   * Скрыть экран обратной связи (без анимации).
   */
  _hideFeedbackScreen() {
    const screen = document.getElementById(SCREENS.feedback);
    if (screen) screen.classList.add('hidden');

    const fb = document.getElementById('feedback-btn');
    if (fb) fb.classList.remove('hidden');
  }

  // ═══════════════════════════════════════
  // ОБРАТНАЯ СВЯЗЬ — отправка
  // ═══════════════════════════════════════

  /**
   * Валидация и отправка формы обратной связи.
   */
  _sendFeedback() {
    const form = document.getElementById('feedback-form');
    const submitBtn = document.getElementById('feedback-submit');
    const errorEl = document.getElementById('feedback-error');

    const nameInput = document.getElementById('feedback-name');
    const emailInput = document.getElementById('feedback-email');
    const messageInput = document.getElementById('feedback-message');

    // Сброс ошибок
    [nameInput, emailInput, messageInput].forEach(el => el.classList.remove('error'));
    errorEl.classList.add('hidden');

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const message = messageInput.value.trim();

    // Валидация
    let hasError = false;
    if (!name)     { nameInput.classList.add('error');    hasError = true; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    emailInput.classList.add('error');   hasError = true; }
    if (!message)  { messageInput.classList.add('error'); hasError = true; }
    if (hasError) return;

    // Показываем спинер
    this._setSubmitLoading(submitBtn, true);

    const templateParams = {
      name: name,
      reply_to: email,
      message: message,
      time: new Date().toLocaleString('ru-RU'),
    };

    emailjs.send(EMAILJS.serviceId, EMAILJS.templateId, templateParams, EMAILJS.publicKey)
      .then(() => {
        form.classList.add('hidden');
        errorEl.classList.add('hidden');
        document.getElementById('feedback-success').classList.remove('hidden');
      })
      .catch((err) => {
        console.error('UIManager: ошибка отправки:', err);
        errorEl.classList.remove('hidden');
        this._setSubmitLoading(submitBtn, false);
      });
  }

  /**
   * Переключить кнопку отправки в состояние загрузки / обычное.
   * @param {HTMLElement} btn
   * @param {boolean} loading
   */
  _setSubmitLoading(btn, loading) {
    btn.disabled = loading;
    const btnText = btn.querySelector('.btn-text');
    const existingSpinner = btn.querySelector('.btn-spinner');

    if (loading) {
      if (!existingSpinner) {
        const spinner = document.createElement('div');
        spinner.className = 'btn-spinner';
        btn.appendChild(spinner);
      }
      if (btnText) btnText.classList.add('hidden');
    } else {
      if (existingSpinner) existingSpinner.remove();
      if (btnText) btnText.classList.remove('hidden');
    }
  }

  /**
   * Сбросить форму обратной связи к исходному состоянию.
   */
  _resetFeedbackForm() {
    const form = document.getElementById('feedback-form');
    const success = document.getElementById('feedback-success');
    const error = document.getElementById('feedback-error');
    const submitBtn = document.getElementById('feedback-submit');

    if (form) {
      form.classList.remove('hidden');
      form.reset();
    }
    if (success) success.classList.add('hidden');
    if (error) error.classList.add('hidden');
    if (submitBtn) this._setSubmitLoading(submitBtn, false);
  }

  // ═══════════════════════════════════════
  // УТИЛИТЫ
  // ═══════════════════════════════════════

  _hideLoading() {
    this._loading.classList.add('hidden');
  }
}

export default new UIManager();