import Store from '../core/Store.js';
import EventBus from '../core/EventBus.js';
import GalleryView from './GalleryView.js';
import PhotoView from './PhotoView.js';
import QRScanner from './QRScanner.js';

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
      
      // Проверяем хеш напрямую
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
    
    // Запоминаем, откуда пришли
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
      feedbackScreen.className = 'screen hidden';
      feedbackScreen.innerHTML = `
        <div class="toolbar">
          <button id="close-feedback-btn" class="icon-btn" title="Назад">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
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
            <button type="submit" id="feedback-submit" class="feedback-submit-btn">Отправить</button>
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
        this._closeFeedback();
      });

      document.getElementById('feedback-form').addEventListener('submit', (e) => {
        e.preventDefault();
        this._sendFeedback();
      });
    }
    
    this._resetFeedbackForm();
    feedbackScreen.classList.remove('hidden');
  }

  _closeFeedback() {
    const feedbackScreen = document.getElementById('feedback-screen');
    if (feedbackScreen) {
      feedbackScreen.classList.add('hidden');
    }
    const fb = document.getElementById('feedback-btn');
    if (fb) fb.classList.remove('hidden');
    
    // Возвращаемся туда, откуда пришли
    if (this._screenBeforeFeedback === 'photo') {
      this._currentScreen = 'photo';
      this._galleryScreen.classList.add('hidden');
      this._photoScreen.classList.remove('hidden');
      this._qrScreen.classList.add('hidden');
      const fbBtn = document.getElementById('feedback-btn');
      if (fbBtn) fbBtn.classList.add('shifted');
      // Не дёргаем render — всё уже отрендерено
    } else {
      this.showGallery();
    }
  }

  _sendFeedback() {
    const submitBtn = document.getElementById('feedback-submit');
    const form = document.getElementById('feedback-form');
    const success = document.getElementById('feedback-success');
    const error = document.getElementById('feedback-error');
    
    const name = document.getElementById('feedback-name').value.trim();
    const email = document.getElementById('feedback-email').value.trim();
    const message = document.getElementById('feedback-message').value.trim();
    
    if (!name || !email || !message) return;
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправка...';
    
    const templateParams = {
      name: name,
      reply_to: email,
      message: message,
      time: new Date().toLocaleString('ru-RU'),
    };
    
    emailjs.send('service_ym4iqcu', 'template_x16we4g', templateParams, 'oRCD9VBQMxpxKkwIm')
      .then(() => {
        form.classList.add('hidden');
        error.classList.add('hidden');
        success.classList.remove('hidden');
      })
      .catch((err) => {
        console.error('Ошибка отправки:', err);
        error.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Отправить';
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
      submitBtn.textContent = 'Отправить';
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