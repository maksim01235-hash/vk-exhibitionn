/**
 * QRScanner — сканер QR-кодов через камеру.
 */

import EventBus from '../core/EventBus.js';
import Router from '../core/Router.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

const CAMERA_FACING = 'environment';
const SCAN_FPS = 10;
const QRBOX_SIZE = { width: 250, height: 250 };
const READER_ID = 'qr-reader';

const MSG_LIB_NOT_LOADED = '<p class="qr-error">Библиотека сканера не загружена</p>';
const MSG_CAMERA_ERROR = `
  <p class="qr-error">Не удалось запустить камеру</p>
  <p class="qr-error-hint">Проверьте разрешение на использование камеры или используйте мобильное устройство</p>
`;

// ═══════════════════════════════════════
// ЛОГИРОВАНИЕ
// ═══════════════════════════════════════

/** @type {string[]} Логи работы с камерой */
const cameraLogs = [];

function cameraLog(message, data) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  const entry = `[${timestamp}] ${message}` + (data !== undefined ? ` ${JSON.stringify(data)}` : '');
  console.log('QRScanner:', entry);
  cameraLogs.push(entry);
  // Храним последние 100 записей
  if (cameraLogs.length > 100) cameraLogs.shift();
}

/** Получить все логи камеры */
export function getCameraLogs() {
  return cameraLogs.join('\n');
}

class QRScanner {
  constructor() {
    this._reader = null;
    this._readerContainer = document.getElementById(READER_ID);
    this._isRunning = false;
  }

  async start() {
    if (this._isRunning) {
      cameraLog('start: уже запущен, выход');
      return;
    }

    cameraLog('start: начало инициализации');
    cameraLog('start: userAgent', navigator.userAgent);
    cameraLog('start: platform', navigator.platform);
    cameraLog('start: vendor', navigator.vendor);

    this._readerContainer.innerHTML = '';

    if (typeof Html5Qrcode === 'undefined') {
      cameraLog('start: ОШИБКА — Html5Qrcode не загружен');
      this._readerContainer.innerHTML = MSG_LIB_NOT_LOADED;
      return;
    }

    cameraLog('start: Html5Qrcode доступен, версия', Html5Qrcode.version);

    // Проверяем доступные камеры
    try {
      const devices = await Html5Qrcode.getCameras();
      cameraLog('start: найдено камер', devices.length);
      devices.forEach((d, i) => cameraLog(`start: камера ${i}`, { id: d.id, label: d.label }));
    } catch (e) {
      cameraLog('start: не удалось получить список камер', e.message);
    }

    // Пробуем разные конфигурации
    const cameraConfigs = [
      { name: 'environment (мягкий)', config: { facingMode: 'environment' } },
      { name: 'environment (строгий)', config: { facingMode: { exact: 'environment' } } },
      { name: 'без указания', config: {} },
    ];

    let started = false;

    for (const { name, config } of cameraConfigs) {
      if (started) break;

      cameraLog(`start: пробую конфиг "${name}"`, config);

      try {
        this._reader = new Html5Qrcode(READER_ID);
        this._isRunning = true;

        await this._reader.start(
          config,
          {
            fps: SCAN_FPS,
            qrbox: QRBOX_SIZE,
            aspectRatio: 1.0,
          },
          (decodedText) => {
            cameraLog('scan: успешно считан QR', decodedText.substring(0, 50));
            this._onScanSuccess(decodedText);
          },
          (errorMessage) => {
            // Ошибки сканирования в процессе — не логируем чтобы не засорять
          }
        );

        cameraLog(`start: УСПЕХ с конфигом "${name}"`);
        started = true;
      } catch (err) {
        cameraLog(`start: ОШИБКА с конфигом "${name}"`, {
          message: err.message,
          name: err.name,
        });
        this._isRunning = false;
      }
    }

    if (!started) {
      cameraLog('start: ВСЕ КОНФИГИ ПРОВАЛИЛИСЬ');
      this._isRunning = false;
      this._readerContainer.innerHTML = MSG_CAMERA_ERROR;
    }
  }

  _onScanSuccess(decodedText) {
    cameraLog('onScanSuccess: распознано', decodedText);
    this.stop();

    const id = Router._extractPhotoId(decodedText);
    cameraLog('onScanSuccess: извлечён ID', id);

    if (id) {
      EventBus.emit('router:openPhoto', id);
    } else {
      alert(`QR-код считан, но ID фотографии не найден.\nСодержимое: ${decodedText}`);
      EventBus.emit('router:openGallery');
    }
  }

  stop() {
    cameraLog('stop: остановка сканера');
    if (this._reader && this._isRunning) {
      try {
        this._reader.stop().catch(() => {});
      } catch (e) {
        cameraLog('stop: ошибка остановки', e.message);
      }
      this._isRunning = false;
    }
  }
}

export default QRScanner;