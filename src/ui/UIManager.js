/**
 * UIManager — управление экранами приложения.
 */

import Store from '../core/Store.js';
import EventBus from '../core/EventBus.js';
import GalleryView from './GalleryView.js';
import PhotoView from './PhotoView.js';
import QRScanner from './QRScanner.js';
import FeedbackPrompt from '../utils/FeedbackPrompt.js';
import CONFIG from '../config.js';

const SCREENS = {
  gallery:  'gallery-screen',
  photo:    'photo-screen',
  qr:       'qr-screen',
  feedback: 'feedback-screen',
};

const SHIFTED_CLASS = 'shifted';

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
  }

  init() {
    this._galleryView = new GalleryView();
    this._photoView = new PhotoView();
    this._qrScanner = new QRScanner();

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
    this._currentScreen = 'gallery';
    this._galleryScreen.classList.remove('hidden');
    this._photoScreen.classList.add('hidden');
    this._qrScreen.classList.add('hidden');
    this._hideFeedbackScreen();
    this._qrScanner.stop();
    this._photoView.resetSwipe();
    this._photoView.reset(); // ← сброс состояния фото
    this._galleryView.render();
    this._setFeedbackBtnShifted(false);
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname);
    }
    FeedbackPrompt.cancel();
  }

  showPhoto(id) {
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
      // Явно показываем
      if (this._screenBeforeQR === 'photo') {
        this._currentScreen = 'photo';
        this._photoScreen.classList.remove('hidden');
        this._galleryScreen.classList.add('hidden');
        this._qrScreen.classList.add('hidden');
        this._setFeedbackBtnShifted(true);
        this._photoView.resetSwipe();
      } else {
        this._galleryScreen.classList.remove('hidden');
        this._photoScreen.classList.add('hidden');
        this._qrScreen.classList.add('hidden');
        this._currentScreen = 'gallery';
        this._setFeedbackBtnShifted(false);
        this._galleryView.render();
      }
    } else if (this._currentScreen === 'photo') {
      this.showGallery();
    }
  }

  _setFeedbackBtnShifted(shifted) {
    const fb = document.getElementById('feedback-btn');
    if (!fb) return;
    if (shifted) {
      fb.classList.add(SHIFTED_CLASS);
    } else {
      fb.classList.remove(SHIFTED_CLASS);
    }
  }

  _openFeedback() {
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
    if (!feedbackScreen) {
      feedbackScreen = this._createFeedbackScreen();
    }

    this._resetFeedbackForm();
    feedbackScreen.classList.remove('hidden');
  }

  _animateCloseQR() {
    const qrScreen = this._qrScreen;
    
    // Показываем целевой экран сразу
    if (this._screenBeforeQR === 'photo') {
      this._currentScreen = 'photo';
      this._galleryScreen.classList.add('hidden');
      this._photoScreen.classList.remove('hidden');
      this._qrScreen.classList.add('hidden');
      this._setFeedbackBtnShifted(true);
    } else {
      this.showGallery();
      this._qrScreen.classList.remove('hidden');
    }

    this._qrScanner.stop();

    // Анимация закрытия поверх
    qrScreen.classList.add('closing');
    qrScreen.addEventListener('animationend', () => {
      qrScreen.classList.add('hidden');
      qrScreen.classList.remove('closing');
    }, { once: true });
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

    document.getElementById('close-feedback-btn').addEventListener('click', () => {
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

    document.getElementById('feedback-form').addEventListener('submit', (e) => {
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
    const form = document.getElementById('feedback-form');
    const submitBtn = document.getElementById('feedback-submit');
    const errorEl = document.getElementById('feedback-error');
    const nameInput = document.getElementById('feedback-name');
    const emailInput = document.getElementById('feedback-email');
    const messageInput = document.getElementById('feedback-message');

    [nameInput, emailInput, messageInput].forEach(el => el.classList.remove('error'));
    errorEl.classList.add('hidden');

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const message = messageInput.value.trim();

    let hasError = false;
    if (!name)     { nameInput.classList.add('error');    hasError = true; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    emailInput.classList.add('error');   hasError = true; }
    if (!message)  { messageInput.classList.add('error'); hasError = true; }
    if (hasError) return;

    this._setSubmitLoading(submitBtn, true);

    const templateParams = {
      name: name,
      reply_to: email,
      message: message,
      time: new Date().toLocaleString('ru-RU'),
    };

    emailjs.send(CONFIG.EMAILJS.SERVICE_ID, CONFIG.EMAILJS.TEMPLATE_ID, templateParams, CONFIG.EMAILJS.PUBLIC_KEY)
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

    if (form) {
      form.classList.remove('hidden');
      form.reset();
    }
    if (success) success.classList.add('hidden');
    if (error) error.classList.add('hidden');
    if (submitBtn) this._setSubmitLoading(submitBtn, false);
  }

  _hideLoading() {
    this._loading.classList.add('hidden');
  }
}

export default new UIManager();