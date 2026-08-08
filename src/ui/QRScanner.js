/**
 * QRScanner — сканер QR-кодов через камеру.
 */

import EventBus from '../core/EventBus.js';
import Router from '../core/Router.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

const SCAN_FPS = 10;
const QRBOX_SIZE = { width: 250, height: 250 };
const READER_ID = 'qr-reader';

const MSG_LIB_NOT_LOADED = '<p class="qr-error">Библиотека сканера не загружена</p>';
const MSG_CAMERA_ERROR = `
  <p class="qr-error">Не удалось запустить камеру</p>
  <p class="qr-error-hint">Проверьте разрешение на использование камеры или используйте мобильное устройство</p>
`;

class QRScanner {
  constructor() {
    this._reader = null;
    this._readerContainer = document.getElementById(READER_ID);
    this._isRunning = false;
    this._cameras = [];
    this._currentCameraIndex = -1;

    this._onScanSuccess = this._onScanSuccess.bind(this);
  }

  async start() {
    if (this._isRunning) return;

    this._readerContainer.innerHTML = '';

    if (typeof Html5Qrcode === 'undefined') {
      this._readerContainer.innerHTML = MSG_LIB_NOT_LOADED;
      return;
    }

    try {
      this._reader = new Html5Qrcode(READER_ID);
      this._cameras = await Html5Qrcode.getCameras();

      if (this._cameras.length === 0) {
        this._readerContainer.innerHTML = MSG_CAMERA_ERROR;
        return;
      }

      // Показываем кнопку переключения если камер больше одной
      const switchBtn = document.getElementById('switch-camera-btn');
      if (switchBtn) {
        if (this._cameras.length > 1) {
          switchBtn.classList.remove('hidden');
          switchBtn.onclick = () => this._switchCamera();
        } else {
          switchBtn.classList.add('hidden');
        }
      }

      this._currentCameraIndex = 0;
      await this._startCamera(this._cameras[0].id);
    } catch (err) {
      console.log('QRScanner: камера недоступна:', err.message);
      this._isRunning = false;
      this._readerContainer.innerHTML = MSG_CAMERA_ERROR;
    }
  }

  async _startCamera(cameraId) {
    if (this._isRunning) {
      await this._reader.stop();
    }

    this._isRunning = true;

    await this._reader.start(
      { deviceId: { exact: cameraId } },
      {
        fps: SCAN_FPS,
        qrbox: QRBOX_SIZE,
      },
      this._onScanSuccess,
      () => {}
    );
  }

  async _switchCamera() {
    if (this._cameras.length < 2) return;

    this._currentCameraIndex = (this._currentCameraIndex + 1) % this._cameras.length;
    const cameraId = this._cameras[this._currentCameraIndex].id;

    try {
      await this._startCamera(cameraId);
    } catch (err) {
      console.log('QRScanner: не удалось переключить камеру:', err.message);
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
      } catch (e) {}
      this._isRunning = false;
    }
  }
}

export default QRScanner;