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
      } else {
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
        this.showPhoto(id);
        return;
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

    // Кнопка обратной связи
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
    document.getElementById('feedback-btn').classList.remove('shifted');
  }

  showPhoto(id) {
    this._currentScreen = 'photo';
    this._galleryScreen.classList.add('hidden');
    this._photoScreen.classList.remove('hidden');
    this._qrScreen.classList.add('hidden');
    this._hideFeedbackScreen();
    this._qrScanner.stop();
    document.getElementById('feedback-btn').classList.add('shifted');
    
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
    document.getElementById('feedback-btn').classList.remove('shifted');
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
    document.getElementById('feedback-btn').classList.add('hidden');
    
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
          <p>Если у вас есть вопросы или предложения, напишите нам:</p>
          <a href="mailto:your@email.com" class="feedback-link">your@email.com</a>
        </div>
      `;
      document.getElementById('app').appendChild(feedbackScreen);
      
      document.getElementById('close-feedback-btn').addEventListener('click', () => {
        feedbackScreen.classList.add('hidden');
        document.getElementById('feedback-btn').classList.remove('hidden');
        this.showGallery();
      });
    }
    
    feedbackScreen.classList.remove('hidden');
  }

  _hideFeedbackScreen() {
    const feedbackScreen = document.getElementById('feedback-screen');
    if (feedbackScreen) {
      feedbackScreen.classList.add('hidden');
    }
    const feedbackBtn = document.getElementById('feedback-btn');
    if (feedbackBtn) {
      feedbackBtn.classList.remove('hidden');
    }
  }
}

export default new UIManager();