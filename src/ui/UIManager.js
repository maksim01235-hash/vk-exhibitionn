import Store from '../core/Store.js';
import EventBus from '../core/EventBus.js';
import GalleryView from './GalleryView.js';
import PhotoView from './PhotoView.js';
import QRScanner from './QRScanner.js';
import FeedbackPrompt from '../utils/FeedbackPrompt.js';

class UIManager {
  constructor() {
    this._galleryScreen = document.getElementById('gallery-screen');
    this._photoScreen = document.getElementById('photo-screen');
    this._qrScreen = document.getElementById('qr-screen');
    this._loading = document.getElementById('loading');
    
    this._galleryView = null;
    this._photoView = null;
    this._qrScanner = null;
    this._currentScreen = 'gallery';
    this._initialized = false;
    this._pendingPhotoId = null;
    this._screenBeforeFeedback = null;
  }

  init() {
    this._galleryView = new GalleryView();
    this._photoView = new PhotoView();
    this._qrScanner = new QRScanner();

    EventBus.on('router:openGallery', () => this.showGallery());
    
    EventBus.on('router:openPhoto', (id) => {
      if (Store.getCount() === 0) {
        this._pendingPhotoId = id;
      } else if (!this._initialized || this._currentScreen !== 'photo') {
        this._pendingPhotoId = null;
        this.showPhoto(id);
      }
    });
    
    EventBus.on('router:openQR', () => this.showQR());

    EventBus.on('photos:loaded', () => {
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
    });
    
    EventBus.on('photos:error', () => {
      this._hideLoading();
      if (!this._initialized) {
        this._initialized = true;
        this.showGallery();
      }
    });

    document.getElementById('scan-btn-gallery').addEventListener('click', () => this.showQR());
    document.getElementById('scan-btn-photo').addEventListener('click', () => this.showQR());
    document.getElementById('back-to-gallery-btn').addEventListener('click', () => this.showGallery());
    document.getElementById('close-qr-btn').addEventListener('click', () => this._goBack());

    const feedbackBtn = document.getElementById('feedback-btn');
    if (feedbackBtn) {
      feedbackBtn.addEventListener('click', () => this._openFeedback());
    }
  }

  showGallery() {
    this._currentScreen = 'gallery';
    this._galleryScreen.classList.remove('hidden');
    this._photoScreen.classList.add('hidden');
    this._qrScreen.classList.add('hidden');
    this._hideFeedbackScreen();
    this._qrScanner.stop();
    this._galleryView.render();
    const fb = document.getElementById('feedback-btn');
    if (fb) fb.classList.remove('shifted');
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
    const fb = document.getElementById('feedback-btn');
    if (fb) fb.classList.add('shifted');
    if (id) Store.navigateToId(id);
    this._photoView.render();
  }

  showQR() {
    this._currentScreen = 'qr';
    this._galleryScreen.classList.add('hidden');
    this._photoScreen.classList.add('hidden');
    this._hideFeedbackScreen();
    this._qrScreen.classList.remove('hidden');
    this._qrScanner.start();
    const fb = document.getElementById('feedback-btn');
    if (fb) fb.classList.remove('shifted');
  }

  _goBack() {
    if (this._currentScreen === 'qr' || this._currentScreen === 'photo') {
      this.showGallery();
    }
  }

  _hideLoading() {
    this._loading.classList.add('hidden');
  }

  _openFeedback() {
    const fb = document.getElementById('feedback-btn');
    if (fb) fb.classList.add('hidden');
    
    this._screenBeforeFeedback = this._currentScreen;
    
    this._galleryScreen.classList.add('hidden');
    this._photoScreen.classList.add('hidden');
    this._qrScreen.classList.add('hidden');
    this._qrScanner.stop();
    this._currentScreen = 'feedback';
    
    let feedbackScreen = document.getElementById('feedback-screen');
    if (!feedbackScreen) {
      feedbackScreen = document.createElement('div');
      feedbackScreen.id = 'feedback-screen';
      feedbackScreen.className = 'screen';
      feedbackScreen.innerHTML = `
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
            <button type="submit" id="feedback-submit" class="feedback-submit-btn"><span class="btn-text">Отправить</span></button>
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
      document.getElementById('app').appendChild(feedbackScreen);
      
      document.getElementById('close-feedback-btn').addEventListener('click', () => {
        feedbackScreen.style.animation = 'feedbackSlideDown 0.3s ease forwards';
        feedbackScreen.addEventListener('animationend', () => {
          feedbackScreen.classList.add('hidden');
          feedbackScreen.style.animation = '';
          const fb2 = document.getElementById('feedback-btn');
          if (fb2) fb2.classList.remove('hidden');
          this._resetFeedbackForm();
          if (this._screenBeforeFeedback === 'photo') {
            this._currentScreen = 'photo';
            this._galleryScreen.classList.add('hidden');
            this._photoScreen.classList.remove('hidden');
            this._qrScreen.classList.add('hidden');
            const fbBtn = document.getElementById('feedback-btn');
            if (fbBtn) fbBtn.classList.add('shifted');
          } else {
            this.showGallery();
          }
        }, { once: true });
      });

      document.getElementById('feedback-form').addEventListener('submit', (e) => {
        e.preventDefault();
        this._sendFeedback();
      });
    }
    
    this._resetFeedbackForm();
    feedbackScreen.classList.remove('hidden');
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
    
    if (!name) { nameInput.classList.add('error'); hasError = true; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { emailInput.classList.add('error'); hasError = true; }
    if (!message) { messageInput.classList.add('error'); hasError = true; }
    
    if (hasError) return;
    
    submitBtn.disabled = true;
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = document.createElement('div');
    spinner.className = 'btn-spinner';
    submitBtn.appendChild(spinner);
    if (btnText) btnText.classList.add('hidden');
    
    const templateParams = {
      name: name,
      reply_to: email,
      message: message,
      time: new Date().toLocaleString('ru-RU'),
    };
    
    emailjs.send('service_ym4iqcu', 'template_x16we4g', templateParams, 'oRCD9VBQMxpxKkwIm')
      .then(() => {
        form.classList.add('hidden');
        errorEl.classList.add('hidden');
        document.getElementById('feedback-success').classList.remove('hidden');
      })
      .catch((err) => {
        console.error('Ошибка отправки:', err);
        errorEl.classList.remove('hidden');
        submitBtn.disabled = false;
        if (spinner) spinner.remove();
        if (btnText) btnText.classList.remove('hidden');
      });
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
    if (submitBtn) {
      submitBtn.disabled = false;
      const spinner = submitBtn.querySelector('.btn-spinner');
      if (spinner) spinner.remove();
      const btnText = submitBtn.querySelector('.btn-text');
      if (btnText) btnText.classList.remove('hidden');
    }
  }

  _hideFeedbackScreen() {
    const feedbackScreen = document.getElementById('feedback-screen');
    if (feedbackScreen) {
      feedbackScreen.classList.add('hidden');
    }
    const fb = document.getElementById('feedback-btn');
    if (fb) {
      fb.classList.remove('hidden');
    }
  }
}

export default new UIManager();