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
  }

  init() {
    // Инициализируем компоненты
    this._galleryView = new GalleryView();
    this._photoView = new PhotoView();
    this._qrScanner = new QRScanner();

    // Подписываемся на события
    EventBus.on('router:openGallery', () => this.showGallery());
    EventBus.on('router:openPhoto', (id) => this.showPhoto(id));
    EventBus.on('router:openQR', () => this.showQR());

    // Когда данные загружены — показываем галерею
    EventBus.on('photos:loaded', () => {
      this._hideLoading();
      if (!this._initialized) {
        this._initialized = true;
        this.showGallery();
      }
    });
    
    // При ошибке тоже скрываем загрузку и показываем пустую галерею
    EventBus.on('photos:error', () => {
      this._hideLoading();
      if (!this._initialized) {
        this._initialized = true;
        this.showGallery();
      }
    });

    // Кнопки
    document.getElementById('scan-btn-gallery').addEventListener('click', () => this.showQR());
    document.getElementById('scan-btn-photo').addEventListener('click', () => this.showQR());
    document.getElementById('back-to-gallery-btn').addEventListener('click', () => this.showGallery());
    document.getElementById('close-qr-btn').addEventListener('click', () => this._goBack());
  }

  showGallery() {
    this._currentScreen = 'gallery';
    this._galleryScreen.classList.remove('hidden');
    this._photoScreen.classList.add('hidden');
    this._qrScreen.classList.add('hidden');
    this._qrScanner.stop();
    this._galleryView.render();
  }

  showPhoto(id) {
    this._currentScreen = 'photo';
    this._galleryScreen.classList.add('hidden');
    this._photoScreen.classList.remove('hidden');
    this._qrScreen.classList.add('hidden');
    this._qrScanner.stop();
    
    if (id) {
      Store.navigateToId(id);
    }
    this._photoView.render();
  }

  showQR() {
    this._currentScreen = 'qr';
    this._galleryScreen.classList.add('hidden');
    this._photoScreen.classList.add('hidden');
    this._qrScreen.classList.remove('hidden');
    this._qrScanner.start();
  }

  _goBack() {
    if (this._currentScreen === 'qr') {
      this.showGallery();
    } else if (this._currentScreen === 'photo') {
      this.showGallery();
    }
  }

  _hideLoading() {
    this._loading.classList.add('hidden');
  }
}

export default new UIManager();