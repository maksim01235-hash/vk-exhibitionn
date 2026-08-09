/**
 * QRScanner — сканер QR-кодов через камеру.
 * 
 * НАЗНАЧЕНИЕ:
 *   Сканирует QR-коды через Html5Qrcode. При успешном сканировании
 *   извлекает ID фото и отправляет событие router:openPhoto.
 * 
 * КАК ЭТО РАБОТАЕТ:
 *   1. При первом запуске получает список камер и кеширует его
 *   2. Сортирует: задние камеры (back/задн) первыми
 *   3. Перебирает камеры по deviceId пока одна не заработает
 *   4. Сохраняет ID рабочей камеры для мгновенного запуска в следующий раз
 *   5. При обнаружении QR — извлекает ID через Router._extractPhotoId
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
    
    /** @type {string|null} ID последней успешной камеры */
    this._lastCameraId = null;
    
    /** @type {Array|null} Кешированный список камер */
    this._cachedCameras = null;
        log(`создан, _lastCameraId=${this._lastCameraId}, _cachedCameras=${this._cachedCameras}`);
  }

  // ═══════════════════════════════════════
  // ПУБЛИЧНЫЙ API
  // ═══════════════════════════════════════

  async start() {
    if (this._isRunning) return;
    
    // Полный сброс предыдущего
    if (this._reader) {
      try { await this._reader.stop(); } catch (e) {}
      this._reader = null;
    }
    this._isRunning = false;
    if (this._readerContainer) this._readerContainer.innerHTML = '';
    
    log('запуск...');
    log(`userAgent: ${navigator.userAgent.substring(0, 80)}`);

    if (typeof Html5Qrcode === 'undefined') {
      log('Html5Qrcode не загружен', 'error');
      cameraLogToBuffer('ОШИБКА: Html5Qrcode не загружен');
      this._readerContainer.innerHTML = MSG_LIB_NOT_LOADED;
      return;
    }

    // Получаем список камер (кешируем после первого получения)
    let cameras = this._cachedCameras;
    if (!cameras) {
      try {
        cameras = await Html5Qrcode.getCameras();
        this._cachedCameras = cameras;
        log(`найдено камер: ${cameras.length}`);
        cameraLogToBuffer(`камер: ${cameras.length}`);
        cameras.forEach((c, i) => {
          log(`  камера ${i}: ${c.label} (${c.id.substring(0, 20)}...)`);
          cameraLogToBuffer(`камера ${i}: ${c.label} id=${c.id.substring(0, 20)}...`);
        });
      } catch (e) {
        log(`список камер недоступен: ${e.message}`, 'warn');
        cameraLogToBuffer(`список камер: ${e.message}`);
        cameras = [];
      }
    } else {
      log(`использую кеш камер: ${cameras.length}`);
    }

    if (cameras.length === 0) {
      log('камеры не найдены', 'error');
      cameraLogToBuffer('камеры не найдены');
      this._readerContainer.innerHTML = MSG_CAMERA_ERROR;
      return;
    }

    let started = false;

    // Если есть проверенная камера — пробуем её первой
    if (this._lastCameraId) {
      log(`пробую сохранённую камеру: ${this._lastCameraId.substring(0, 20)}...`);
      cameraLogToBuffer(`пробую сохранённую: ${this._lastCameraId.substring(0, 20)}...`);
      try {
        this._reader = new Html5Qrcode(READER_ID);
        this._isRunning = true;
        await this._reader.start(
          { deviceId: { exact: this._lastCameraId } },
          { fps: SCAN_FPS, qrbox: QRBOX_SIZE, aspectRatio: 1.0 },
          (decodedText) => {
            log(`считан QR: ${decodedText.substring(0, 50)}`);
            cameraLogToBuffer(`считан: ${decodedText.substring(0, 50)}`);
            this._onScanSuccess(decodedText);
          },
          () => {}
        );
        log('успех с сохранённой камерой');
        cameraLogToBuffer('успех с сохранённой');
        started = true;
      } catch (err) {
        log(`сохранённая камера не сработала: ${err.message}`);
        cameraLogToBuffer(`сохранённая не сработала: ${err.message}`);
        this._isRunning = false;
        this._lastCameraId = null;
      }
    }

    // Если сохранённая не сработала — перебираем
    if (!started) {
      const backCameras = cameras.filter(c => {
        const label = c.label.toLowerCase();
        return label.includes('back') || label.includes('задн') || label.includes('rear');
      });
      const otherCameras = cameras.filter(c => !backCameras.includes(c));
      const orderedCameras = [...backCameras, ...otherCameras];

      log(`задних камер: ${backCameras.length}, остальных: ${otherCameras.length}`);
      cameraLogToBuffer(`задних: ${backCameras.length}, остальных: ${otherCameras.length}`);

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
            { fps: SCAN_FPS, qrbox: QRBOX_SIZE, aspectRatio: 1.0 },
            (decodedText) => {
              log(`считан QR: ${decodedText.substring(0, 50)}`);
              cameraLogToBuffer(`считан: ${decodedText.substring(0, 50)}`);
              this._onScanSuccess(decodedText);
            },
            () => {}
          );
          log(`успех: ${camera.label}`);
          cameraLogToBuffer(`успех: ${camera.label}`);
          this._lastCameraId = cameraId;
          started = true;
        } catch (err) {
          log(`ошибка "${camera.label}": ${err.message}`, 'warn');
          cameraLogToBuffer(`ошибка "${camera.label}": ${err.message}`);
          this._isRunning = false;
        }
      }
    }

    if (!started) {
      log('все камеры провалились', 'error');
      cameraLogToBuffer('ВСЕ КАМЕРЫ ПРОВАЛИЛИСЬ');
      this._readerContainer.innerHTML = MSG_CAMERA_ERROR;
    }
        log(`после start, _lastCameraId=${this._lastCameraId?.substring(0, 20)}, _cachedCameras=${this._cachedCameras?.length}`);
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

  stop() {
    if (!this._isRunning) return;
    log('остановка');
    cameraLogToBuffer('остановка');
    
    this._isRunning = false;
    
    if (this._readerContainer) {
      this._readerContainer.innerHTML = '';
    }
    
    if (this._reader) {
      const reader = this._reader;
      this._reader = null;
      reader.stop().catch(() => {});
    }
  }
}

export default QRScanner;