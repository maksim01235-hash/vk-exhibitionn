/**
 * UIManager — управление экранами приложения.
 */

import Store from '../core/Store.js';
import EventBus from '../core/EventBus.js';
import GalleryView from './GalleryView.js';
import PhotoView from './PhotoView.js';
import QRScanner, { getCameraLogs } from './QRScanner.js';
import FeedbackPrompt from '../utils/FeedbackPrompt.js';
import CONFIG from '../config.js';
import { createLogger, getLogs } from '../utils/Logger.js';

const DEBUG = true;

const SCREENS = {
  gallery:  'gallery-screen',
  photo:    'photo-screen',
  qr:       'qr-screen',
  feedback: 'feedback-screen',
};

const SHIFTED_CLASS = 'shifted';

const log = createLogger('UIManager', DEBUG);

class UIManager {
  constructor() {
    this._galleryScreen = document.getElementById(SCREENS.gallery);
    this._photoScreen = document.getElementById(SCREENS.photo);
    this._qrScreen = document.getElementById(SCREENS.qr);
    this._loading = document.getElementById('loading');

    this._galleryView = null;
    this._photoView = null;
    this._qrScanner = null;

    this._currentScreen = 'gallery';
    this._initialized = false;
    this._pendingPhotoId = null;
    this._screenBeforeFeedback = null;
    this._screenBeforeQR = null;

    log('синглтон создан');
  }

  init() {
    this._galleryView = new GalleryView();
    this._photoView = new PhotoView();
    this._qrScanner = new QRScanner();
    log('компоненты созданы');

    EventBus.on('router:openGallery', () => this.showGallery());
    EventBus.on('router:openQR', () => this.showQR());

    EventBus.on('router:openPhoto', (id) => {
      if (Store.getCount() === 0) {
        this._pendingPhotoId = id;
      } else if (!this._initialized || this._currentScreen !== 'photo') {
        this._pendingPhotoId = null;
        this.showPhoto(id);
      }
    });

    EventBus.on('photos:loaded', () => this._onDataLoaded());
    EventBus.on('photos:error', () => this._onDataError());

    document.getElementById('scan-btn-gallery').addEventListener('click', () => this.showQR());
    document.getElementById('scan-btn-photo').addEventListener('click', () => this.showQR());
    document.getElementById('back-to-gallery-btn').addEventListener('click', () => this.showGallery());
    document.getElementById('close-qr-btn').addEventListener('click', () => this._goBack());

    const feedbackBtn = document.getElementById('feedback-btn');
    if (feedbackBtn) {
      feedbackBtn.addEventListener('click', () => this._openFeedback());
    }

    log('инициализация завершена');
  }

  _onDataLoaded() {
    this._hideLoading();
    if (this._pendingPhotoId) {
      const id = this._pendingPhotoId;
      this._pendingPhotoId = null;
      this._initialized = true;
      this.showPhoto(id);
      return;
    }
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
      const id = hash.substring(1).replace(/^\//, '');
      if (id && Store.navigateToId(id)) {
        this._initialized = true;
        this.showPhoto(id);
        return;
      }
    }
    if (!this._initialized) {
      this._initialized = true;
      this.showGallery();
    }
  }

  _onDataError() {
    this._hideLoading();
    if (!this._initialized) {
      this._initialized = true;
      this.showGallery();
    }
  }

  showGallery() {
    log('→ галерея');
    this._currentScreen = 'gallery';
    this._galleryScreen.classList.remove('hidden');
    this._photoScreen.classList.add('hidden');
    this._qrScreen.classList.add('hidden');
    this._hideFeedbackScreen();
    this._qrScanner.stop();
    this._photoView.resetSwipe();
    this._photoView.reset();
    this._galleryView.render();
    this._setFeedbackBtnShifted(false);
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
    FeedbackPrompt.cancel();
  }

  showPhoto(id) {
    log(`→ фото #${id || 'текущее'}`);
    this._currentScreen = 'photo';
    this._galleryScreen.classList.add('hidden');
    this._photoScreen.classList.remove('hidden');
    this._qrScreen.classList.add('hidden');
    this._hideFeedbackScreen();
    this._qrScanner.stop();
    this._setFeedbackBtnShifted(true);
    if (id) Store.navigateToId(id);
    this._photoView.render();
  }

  showQR() {
    log('→ QR-сканер');
    FeedbackPrompt.cancel(true);
    this._screenBeforeQR = this._currentScreen;
    this._currentScreen = 'qr';
    this._galleryScreen.classList.add('hidden');
    this._photoScreen.classList.add('hidden');
    this._hideFeedbackScreen();
    this._qrScreen.classList.remove('hidden', 'closing');
    this._qrScanner.start();
    this._photoView.resetSwipe();
    this._setFeedbackBtnShifted(false);
  }

  _goBack() {
    if (this._currentScreen === 'qr') {
      this._qrScanner.stop();
      this._qrScreen.classList.add('hidden');
      if (this._screenBeforeQR === 'photo') this.showPhoto();
      else this.showGallery();
    } else if (this._currentScreen === 'photo') {
      this.showGallery();
    }
  }

  _setFeedbackBtnShifted(shifted) {
    const fb = document.getElementById('feedback-btn');
    if (!fb) return;
    if (shifted) fb.classList.add(SHIFTED_CLASS);
    else fb.classList.remove(SHIFTED_CLASS);
  }

  _openFeedback() {
    log('→ обратная связь');
    FeedbackPrompt.cancel();
    const fb = document.getElementById('feedback-btn');
    if (fb) fb.classList.add('hidden');
    this._screenBeforeFeedback = this._currentScreen;
    this._galleryScreen.classList.add('hidden');
    this._photoScreen.classList.add('hidden');
    this._qrScreen.classList.add('hidden');
    this._qrScanner.stop();
    this._photoView.resetSwipe();
    this._currentScreen = 'feedback';

    let feedbackScreen = document.getElementById(SCREENS.feedback);
    if (!feedbackScreen) feedbackScreen = this._createFeedbackScreen();

    this._resetFeedbackForm();
    feedbackScreen.classList.remove('hidden');
  }

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
          <textarea id="feedback-message" class="feedback-textarea" placeholder="Ваше сообщение..." rows="5"></textarea>
          <div class="feedback-stars" id="feedback-stars">
            <span class="star" data-value="1"><i data-lucide="star"></i></span>
            <span class="star" data-value="2"><i data-lucide="star"></i></span>
            <span class="star" data-value="3"><i data-lucide="star"></i></span>
            <span class="star" data-value="4"><i data-lucide="star"></i></span>
            <span class="star" data-value="5"><i data-lucide="star"></i></span>
          </div>
          <input type="hidden" id="feedback-rating" value="0" />
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
          <p style="font-size:14px;color:var(--text-muted)">Спасибо за ответ!
Мы очень ценим ваше участие.</p>
        </div>
        <div id="feedback-error" class="feedback-error hidden">
          <p>Ошибка при отправке. Попробуйте позже.</p>
        </div>
      </div>
    `;
    document.getElementById('app').appendChild(screen);

    // Инициализируем Lucide иконки (все на странице)
    if (window.lucide) {
      lucide.createIcons();
    }

    // Звёзды рейтинга
    const stars = screen.querySelectorAll('#feedback-stars .star');
    const ratingInput = screen.querySelector('#feedback-rating');
    let currentRating = 0;

    const updateStars = () => {
      stars.forEach((s, i) => {
        const svg = s.querySelector('svg');
        if (!svg) return;
        if (i < currentRating) {
          svg.setAttribute('fill', '#FFD700');
          svg.setAttribute('stroke', '#FFD700');
          s.classList.add('active');
        } else {
          svg.setAttribute('fill', 'none');
          svg.setAttribute('stroke', 'currentColor');
          s.classList.remove('active');
        }
      });
    };

    stars.forEach(star => {
      star.addEventListener('click', () => {
        currentRating = parseInt(star.dataset.value);
        ratingInput.value = currentRating;
        updateStars();
      });
    });

    // Кнопка «Назад»
    screen.querySelector('#close-feedback-btn').addEventListener('click', () => {
      log('закрытие обратной связи');
      screen.classList.add('hidden');
      const fb = document.getElementById('feedback-btn');
      if (fb) fb.classList.remove('hidden');
      this._resetFeedbackForm();
      if (this._screenBeforeFeedback === 'photo') {
        this._currentScreen = 'photo';
        this._galleryScreen.classList.add('hidden');
        this._photoScreen.classList.remove('hidden');
        this._qrScreen.classList.add('hidden');
        this._setFeedbackBtnShifted(true);
        this._photoView.resetSwipe();
      } else if (this._screenBeforeFeedback === 'qr') {
        this._currentScreen = 'qr';
        this._galleryScreen.classList.add('hidden');
        this._photoScreen.classList.add('hidden');
        this._qrScreen.classList.remove('hidden');
      } else {
        this.showGallery();
      }
    });

    // Отправка
    screen.querySelector('#feedback-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this._sendFeedback();
    });

    return screen;
  }

  _hideFeedbackScreen() {
    const screen = document.getElementById(SCREENS.feedback);
    if (screen) screen.classList.add('hidden');
    const fb = document.getElementById('feedback-btn');
    if (fb) fb.classList.remove('hidden');
  }

  _sendFeedback() {
    log('отправка обратной связи...');
    const form = document.getElementById('feedback-form');
    const submitBtn = document.getElementById('feedback-submit');
    const errorEl = document.getElementById('feedback-error');
    const nameInput = document.getElementById('feedback-name');
    const emailInput = document.getElementById('feedback-email');
    const messageInput = document.getElementById('feedback-message');
    const ratingInput = document.getElementById('feedback-rating');

    [nameInput, emailInput, messageInput].forEach(el => el.classList.remove('error'));
    errorEl.classList.add('hidden');

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const message = messageInput.value.trim();
    const rating = ratingInput?.value || '0';

    let hasError = false;
    if (!name)     { nameInput.classList.add('error');    hasError = true; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    emailInput.classList.add('error');   hasError = true; }
    if (rating === '0') {
      // Подсвечиваем звёзды красным если оценка не выбрана
      document.getElementById('feedback-stars').classList.add('error');
      hasError = true;
    } else {
      document.getElementById('feedback-stars').classList.remove('error');
    }
    if (hasError) { log('валидация не пройдена', 'warn'); return; }

    this._setSubmitLoading(submitBtn, true);

    let fullMessage = message;
    if (rating !== '0') fullMessage += `\nОценка: ${rating}/5`;

    const appLogs = getLogs();
    const cameraLogs = getCameraLogs();
    if (appLogs) fullMessage += '\n\n--- ЛОГИ ПРИЛОЖЕНИЯ ---\n' + appLogs;
    if (cameraLogs) fullMessage += '\n\n--- ЛОГИ КАМЕРЫ ---\n' + cameraLogs;

    // Сохраняем в Google Таблицу (фоном, ошибки игнорируем)
    // Сохраняем в Google Таблицу
    if (CONFIG.FEEDBACK_SHEET?.SCRIPT_URL) {
      fetch(CONFIG.FEEDBACK_SHEET.SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          email: email,
          message: message,
          rating: rating,
          logs: (appLogs || '') + '\n' + (cameraLogs || ''),
        }),
      }).catch(() => {});
    }

    const templateParams = {
      name: name,
      reply_to: email,
      message: fullMessage,
      time: new Date().toLocaleString('ru-RU'),
    };

    emailjs.send(CONFIG.EMAILJS.SERVICE_ID, CONFIG.EMAILJS.TEMPLATE_ID, templateParams, CONFIG.EMAILJS.PUBLIC_KEY)
      .then(() => {
        log('отправлено успешно');
        form.classList.add('hidden');
        errorEl.classList.add('hidden');
        document.getElementById('feedback-success').classList.remove('hidden');
      })
      .catch((err) => {
        log(`ошибка отправки: ${err.message}`, 'error');
        errorEl.classList.remove('hidden');
        this._setSubmitLoading(submitBtn, false);
      });
  }

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

  _resetFeedbackForm() {
    const form = document.getElementById('feedback-form');
    const success = document.getElementById('feedback-success');
    const error = document.getElementById('feedback-error');
    const submitBtn = document.getElementById('feedback-submit');
    if (form) { form.classList.remove('hidden'); form.reset(); }
    if (success) success.classList.add('hidden');
    if (error) error.classList.add('hidden');
    if (submitBtn) this._setSubmitLoading(submitBtn, false);

    // Сброс звёзд
    const stars = document.querySelectorAll('#feedback-stars .star');
    stars.forEach(s => {
      const svg = s.querySelector('svg');
      if (svg) {
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
      }
      s.classList.remove('active');
    });
    const ratingInput = document.getElementById('feedback-rating');
    if (ratingInput) ratingInput.value = '0';
  }

  _hideLoading() {
    this._loading.classList.add('hidden');
  }
}

export default new UIManager();