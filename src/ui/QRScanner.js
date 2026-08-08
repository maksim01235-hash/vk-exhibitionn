/**
 * QRScanner — сканер QR-кодов через камеру.
 * 
 * НАЗНАЧЕНИЕ:
 *   Сканирует QR-коды через Html5Qrcode. При успешном сканировании
 *   извлекает ID фото и отправляет событие router:openPhoto.
 * 
 * КАК ЭТО РАБОТАЕТ:
 *   1. Перебирает конфигурации камеры: мягкий environment, строгий, без указания
 *   2. При успехе — запускает сканирование с частотой SCAN_FPS
 *   3. При обнаружении QR — извлекает ID через Router._extractPhotoId
 *   4. Логи камеры сохраняются в cameraLogs для отправки в обратную связь
 * 
 * РАСШИРЕНИЕ:
 *   — Выбор из галереи (загрузка изображения с QR)
 *   — Звуковой сигнал при успешном сканировании
 *   — Визуальная рамка с анимацией
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

    // Проверяем камеры
    try {
      const devices = await Html5Qrcode.getCameras();
      log(`найдено камер: ${devices.length}`);
      cameraLogToBuffer(`камер: ${devices.length}`);
      devices.forEach((d, i) => {
        log(`  камера ${i}: ${d.label} (${d.id.substring(0, 20)}...)`);
        cameraLogToBuffer(`камера ${i}: ${d.label} id=${d.id.substring(0, 20)}...`);
      });
    } catch (e) {
      log(`список камер недоступен: ${e.message}`, 'warn');
      cameraLogToBuffer(`список камер: ${e.message}`);
    }

    // Конфигурации камеры
    const cameraConfigs = [
      { name: 'environment (мягкий)', config: { facingMode: 'environment' } },
      { name: 'environment (строгий)', config: { facingMode: { exact: 'environment' } } },
      { name: 'без указания', config: {} },
    ];

    let started = false;

    for (const { name, config } of cameraConfigs) {
      if (started) break;

      log(`пробую "${name}"...`);
      cameraLogToBuffer(`пробую "${name}"`);

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
            log(`считан QR: ${decodedText.substring(0, 50)}`);
            cameraLogToBuffer(`считан: ${decodedText.substring(0, 50)}`);
            this._onScanSuccess(decodedText);
          },
          () => {} // ошибки сканирования игнорируем
        );

        log(`успех с "${name}"`);
        cameraLogToBuffer(`успех: "${name}"`);
        started = true;
      } catch (err) {
        log(`ошибка "${name}": ${err.message}`, 'warn');
        cameraLogToBuffer(`ошибка "${name}": ${err.message} (${err.name || 'no name'})`);
        this._isRunning = false;
      }
    }

    if (!started) {
      log('все конфиги провалились', 'error');
      cameraLogToBuffer('ВСЕ КОНФИГИ ПРОВАЛИЛИСЬ');
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