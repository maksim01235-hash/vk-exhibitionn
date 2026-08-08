/**
 * Logger — общий модуль логирования.
 * 
 * НАЗНАЧЕНИЕ:
 *   Каждый модуль создаёт свой логгер через createLogger(name, enabled).
 *   Логгер пишет в консоль и сохраняет сообщения в общий буфер.
 *   Если хоть один логгер включён — буфер добавляется к письму обратной связи.
 * 
 * ИСПОЛЬЗОВАНИЕ:
 *   import { createLogger } from '../utils/Logger.js';
 *   const DEBUG = true;
 *   const log = createLogger('ModuleName', DEBUG);
 *   log('сообщение');
 *   log('ошибка', 'error');
 */

// ═══════════════════════════════════════
// НАСТРОЙКИ
// ═══════════════════════════════════════

/** Максимальное количество хранимых записей лога */
const MAX_LOG_ENTRIES = 2000;

// ═══════════════════════════════════════
// ХРАНИЛИЩЕ
// ═══════════════════════════════════════

/** @type {string[]} Буфер всех логов */
const appLogs = [];

/** @type {boolean} Включён ли хоть один логгер */
let anyEnabled = false;

// ═══════════════════════════════════════
// API
// ═══════════════════════════════════════

/**
 * Создать логгер для модуля.
 * @param {string} name — имя модуля (префикс в консоли: [Name])
 * @param {boolean} enabled — true = писать в консоль и сохранять в буфер
 * @returns {(message: string, level?: string) => void}
 */
export function createLogger(name, enabled) {
  if (enabled) anyEnabled = true;

  return function log(message, level = 'info') {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const entry = `${timestamp} [${name}] ${message}`;

    if (enabled) {
      if (level === 'error') console.error(entry);
      else if (level === 'warn') console.warn(entry);
      else console.log(entry);
    }

    // Сохраняем только если хоть один логгер включён
    if (anyEnabled) {
      appLogs.push(entry);
      if (appLogs.length > MAX_LOG_ENTRIES) appLogs.shift();
    }
  };
}

/**
 * Получить все логи для отправки в обратную связь.
 * @returns {string|null} null если ни один логгер не был включён
 */
export function getLogs() {
  if (!anyEnabled || appLogs.length === 0) return null;
  return appLogs.join('\n');
}