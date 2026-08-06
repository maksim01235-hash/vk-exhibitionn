import EventBus from '../core/EventBus.js';
import Router from '../core/Router.js';

class QRScanner {
  constructor() {
    this._reader = null;
    this._readerContainer = document.getElementById('qr-reader');
    this._isRunning = false;
  }

  async start() {
    if (this._isRunning) return;
    
    this._readerContainer.innerHTML = '';
    
    if (typeof Html5Qrcode === 'undefined') {
      this._readerContainer.innerHTML = '<p class="qr-error">Библиотека сканера не загружена</p>';
      return;
    }

    try {
      this._reader = new Html5Qrcode('qr-reader');
      this._isRunning = true;
      
      await this._reader.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => this._onScanSuccess(decodedText),
        () => {} // Игнорируем ошибки сканирования
      );
    } catch (err) {
      console.log('Камера недоступна:', err.message);
      this._isRunning = false;
      this._readerContainer.innerHTML = `
        <p class="qr-error">Не удалось запустить камеру</p>
        <p class="qr-error-hint">Проверьте разрешение на использование камеры или используйте мобильное устройство</p>
      `;
    }
  }

  _onScanSuccess(decodedText) {
    this.stop();
    
    const id = Router._extractPhotoId(decodedText);
    if (id) {
      EventBus.emit('router:openPhoto', id);
    } else {
      alert(`QR-код считан, но ID фотографии не найден.\nСодержимое: ${decodedText}`);
      EventBus.emit('router:openGallery');
    }
  }

  stop() {
    if (this._reader && this._isRunning) {
      try {
        this._reader.stop().catch(() => {});
      } catch (e) {
        // Игнорируем
      }
      this._isRunning = false;
    }
  }
}

export default QRScanner;