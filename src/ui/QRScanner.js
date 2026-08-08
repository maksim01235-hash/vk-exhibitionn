/**
 * QRScanner — сканер QR-кодов через камеру.
 * 
 * НАЗНАЧЕНИЕ:
 *   Сканирует QR-коды через Html5Qrcode. При успешном сканировании
 *   извлекает ID фото и отправляет событие router:openPhoto.
 * 
 * КАК ЭТО РАБОТАЕТ:
 *   1. Получает список всех камер
 *   2. Сортирует: задние камеры (back/задн) первыми
 *   3. Перебирает камеры по deviceId пока одна не заработает
 *   4. При обнаружении QR — извлекает ID через Router._extractPhotoId
 * 
 * Это решает проблему с телефонами где facingMode: 'environment'
 * выбирает макро-камеру вместо обычной задней.
 * 
 * РАСШИРЕНИЕ:
 *   — Кнопка переключения камеры (фронтальная/задняя)
 *   — Выбор из галереи
 *   — Звуковой сигнал при успешном сканировании
 */

import EventBus from '../core/EventBus.js';
import Router from '../core/Router.js';
import { createLogger } from '../utils/Logger.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/** Включить логирование */
const DEBUG = true;

/** Частота сканирования (кадров/сек) */
const SCAN_FPS = 10;

/** Размер области сканирования (px) */
const QRBOX_SIZE = { width: 250, height: 250 };

/** ID контейнера для сканера */
const READER_ID = 'qr-reader';

/** Сообщения */
const MSG_LIB_NOT_LOADED = '<p class="qr-error">Библиотека сканера не загружена</p>';
const MSG_CAMERA_ERROR = `
  <p class="qr-error">Не удалось запустить камеру</p>
  <p class="qr-error-hint">Проверьте разрешение на использование камеры или используйте мобильное устройство</p>
`;

// ═══════════════════════════════════════
// ЛОГИРОВАНИЕ
// ═══════════════════════════════════════

const log = createLogger('QRScanner', DEBUG);

/** @type {string[]} Логи камеры для отправки в обратную связь */
const cameraLogs = [];

function cameraLogToBuffer(message, data) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  const entry = `[${timestamp}] ${message}` + (data !== undefined ? ` ${JSON.stringify(data)}` : '');
  cameraLogs.push(entry);
  if (cameraLogs.length > 100) cameraLogs.shift();
}

/** Получить все логи камеры */
export function getCameraLogs() {
  return cameraLogs.length > 0 ? cameraLogs.join('\n') : null;
}

class QRScanner {
  constructor() {
    this._reader = null;
    this._readerContainer = document.getElementById(READER_ID);
    this._isRunning = false;
    log('создан');
  }

  // ═══════════════════════════════════════
  // ПУБЛИЧНЫЙ API
  // ═══════════════════════════════════════

  async start() {
    if (this._isRunning) {
      log('уже запущен');
      return;
    }

    log('запуск...');
    log(`userAgent: ${navigator.userAgent.substring(0, 80)}`);

    this._readerContainer.innerHTML = '';

    if (typeof Html5Qrcode === 'undefined') {
      log('Html5Qrcode не загружен', 'error');
      cameraLogToBuffer('ОШИБКА: Html5Qrcode не загружен');
      this._readerContainer.innerHTML = MSG_LIB_NOT_LOADED;
      return;
    }

    // Получаем список камер
    let cameras = [];
    try {
      cameras = await Html5Qrcode.getCameras();
      log(`найдено камер: ${cameras.length}`);
      cameraLogToBuffer(`камер: ${cameras.length}`);
      cameras.forEach((c, i) => {
        log(`  камера ${i}: ${c.label} (${c.id.substring(0, 20)}...)`);
        cameraLogToBuffer(`камера ${i}: ${c.label} id=${c.id.substring(0, 20)}...`);
      });
    } catch (e) {
      log(`список камер недоступен: ${e.message}`, 'warn');
      cameraLogToBuffer(`список камер: ${e.message}`);
    }

    if (cameras.length === 0) {
      log('камеры не найдены', 'error');
      cameraLogToBuffer('камеры не найдены');
      this._readerContainer.innerHTML = MSG_CAMERA_ERROR;
      return;
    }

    /**
     * Сортируем камеры: задние (back/задн) первыми.
     * Это решает проблему с телефонами где facingMode: 'environment'
     * выбирает макро-камеру с фиксированным фокусом на близком расстоянии.
     */
    const backCameras = cameras.filter(c => {
      const label = c.label.toLowerCase();
      return label.includes('back') || label.includes('задн') || label.includes('rear');
    });
    const otherCameras = cameras.filter(c => !backCameras.includes(c));
    const orderedCameras = [...backCameras, ...otherCameras];

    log(`задних камер: ${backCameras.length}, остальных: ${otherCameras.length}`);
    cameraLogToBuffer(`задних: ${backCameras.length}, остальных: ${otherCameras.length}`);

    let started = false;

    for (const camera of orderedCameras) {
      if (started) break;

      const cameraId = camera.id;
      log(`пробую: ${camera.label} (${cameraId.substring(0, 20)}...)`);
      cameraLogToBuffer(`пробую: ${camera.label} id=${cameraId.substring(0, 20)}...`);

      try {
        this._reader = new Html5Qrcode(READER_ID);
        this._isRunning = true;

        await this._reader.start(
          { deviceId: { exact: cameraId } },
          {
            fps: SCAN_FPS,
            qrbox: QRBOX_SIZE,
            aspectRatio: 1.0,
          },
          (decodedText) => {
            log(`считан QR: ${decodedText.substring(0, 50)}`);
            cameraLogToBuffer(`считан: ${decodedText.substring(0, 50)}`);
            this._onScanSuccess(decodedText);
          },
          () => {}
        );

        log(`успех: ${camera.label}`);
        cameraLogToBuffer(`успех: ${camera.label}`);
        started = true;
      } catch (err) {
        log(`ошибка "${camera.label}": ${err.message}`, 'warn');
        cameraLogToBuffer(`ошибка "${camera.label}": ${err.message}`);
        this._isRunning = false;
      }
    }

    if (!started) {
      log('все камеры провалились', 'error');
      cameraLogToBuffer('ВСЕ КАМЕРЫ ПРОВАЛИЛИСЬ');
      this._readerContainer.innerHTML = MSG_CAMERA_ERROR;
    }
  }

  stop() {
    log('остановка');
    cameraLogToBuffer('остановка');
    if (this._reader && this._isRunning) {
      try {
        this._reader.stop().catch(() => {});
      } catch (e) {
        log(`ошибка остановки: ${e.message}`, 'warn');
      }
      this._isRunning = false;
    }
  }

  // ═══════════════════════════════════════
  // ОБРАБОТКА
  // ═══════════════════════════════════════

  _onScanSuccess(decodedText) {
    this.stop();
    const id = Router._extractPhotoId(decodedText);
    log(`извлечён ID: ${id}`);
    cameraLogToBuffer(`ID: ${id || 'не найден'}`);

    if (id) {
      EventBus.emit('router:openPhoto', id);
    } else {
      alert(`QR-код считан, но ID фотографии не найден.\nСодержимое: ${decodedText}`);
      EventBus.emit('router:openGallery');
    }
  }
}

export default QRScanner;