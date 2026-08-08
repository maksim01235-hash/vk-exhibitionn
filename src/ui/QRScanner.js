/**
 * QRScanner — сканер QR-кодов через камеру.
 * 
 * Использует библиотеку Html5Qrcode.
 * При успешном сканировании извлекает ID фотографии и переходит к ней.
 * Если ID не найден — возвращает в галерею.
 * 
 * Поддерживаемые форматы QR:
 *   - https://vk.com/app54708970/#1
 *   - 1 (просто число)
 * 
 * При расширении можно добавить:
 *   - Выбор из галереи (загрузка изображения с QR)
 *   - Звуковой сигнал при успешном сканировании
 *   - Визуальная рамка с анимацией
 */

import EventBus from '../core/EventBus.js';
import Router from '../core/Router.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/** Настройки камеры: задняя (environment) или передняя (user) */
const CAMERA_FACING = 'environment';

/** Частота сканирования (кадров в секунду) */
const SCAN_FPS = 10;

/** Размер области сканирования (px) */
const QRBOX_SIZE = { width: 250, height: 250 };

/** CSS-селектор контейнера для сканера */
const READER_ID = 'qr-reader';

/** Сообщения */
const MSG_LIB_NOT_LOADED = '<p class="qr-error">Библиотека сканера не загружена</p>';
const MSG_CAMERA_ERROR = `
  <p class="qr-error">Не удалось запустить камеру</p>
  <p class="qr-error-hint">Проверьте разрешение на использование камеры или используйте мобильное устройство</p>
`;

class QRScanner {
  constructor() {
    /** @type {Html5Qrcode|null} Экземпляр сканера */
    this._reader = null;

    /** @type {HTMLElement} Контейнер для вставки видео */
    this._readerContainer = document.getElementById(READER_ID);

    /** @type {boolean} Запущен ли сканер */
    this._isRunning = false;
  }

  // ═══════════════════════════════════════
  // ПУБЛИЧНЫЙ API
  // ═══════════════════════════════════════

  /**
   * Запустить сканер. Если уже запущен — выходит.
   * При ошибке камеры показывает сообщение пользователю.
   */
  async start() {
    if (this._isRunning) return;

    this._readerContainer.innerHTML = '';

    if (typeof Html5Qrcode === 'undefined') {
      this._readerContainer.innerHTML = MSG_LIB_NOT_LOADED;
      return;
    }

    try {
      this._reader = new Html5Qrcode(READER_ID);
      
      // Получаем список камер
      const cameras = await Html5Qrcode.getCameras();
      
      let cameraId = { facingMode: CAMERA_FACING };
      
      if (cameras && cameras.length > 0) {
        // Ищем заднюю камеру с самым высоким разрешением (обычно основная)
        const backCameras = cameras.filter(c => c.id.includes('back') || c.id.includes('rear') || c.id === '0');
        if (backCameras.length > 0) {
          // Берём камеру с самым длинным id (обычно основная) или первую
          const mainCamera = backCameras.reduce((a, b) => 
            (a.id.length >= b.id.length) ? a : b
          );
          cameraId = { deviceId: mainCamera.id };
        }
      }
      
      this._isRunning = true;

      await this._reader.start(
        cameraId,
        {
          fps: SCAN_FPS,
          qrbox: QRBOX_SIZE,
        },
        (decodedText) => this._onScanSuccess(decodedText),
        () => {}
      );
    } catch (err) {
      console.log('QRScanner: камера недоступна:', err.message);
      this._isRunning = false;
      this._readerContainer.innerHTML = MSG_CAMERA_ERROR;
    }
  }

  /**
   * Остановить сканер.
   * Безопасно — можно вызывать даже если сканер не запущен.
   */
  stop() {
    if (!this._reader || !this._isRunning) return;

    try {
      this._reader.stop().catch(() => {});
    } catch (e) {
      // Игнорируем ошибки остановки
    }
    this._isRunning = false;
  }

  // ═══════════════════════════════════════
  // ОБРАБОТКА РЕЗУЛЬТАТА
  // ═══════════════════════════════════════

  /**
   * Обработка успешного сканирования.
   * Извлекает ID фото из распознанного текста.
   * 
   * @param {string} decodedText — содержимое QR-кода
   */
  _onScanSuccess(decodedText) {
    this.stop();

    // Извлекаем ID фото (делегируем Router)
    const id = Router._extractPhotoId(decodedText);
    console.log('QRScanner: ID =', id);

    if (id) {
      EventBus.emit('router:openPhoto', id);
    } else {
      alert(`QR-код считан, но ID фотографии не найден.\nСодержимое: ${decodedText}`);
      EventBus.emit('router:openGallery');
    }
  }
}

export default QRScanner;