/**
 * Logger — общий модуль логирования.
 * 
 * НАЗНАЧЕНИЕ:
 *   Каждый модуль создаёт свой логгер через createLogger(name, debug).
 *   debug=true: пишет в консоль И в буфер (для отладки).
 *   debug=false: пишет ТОЛЬКО в буфер (для продакшена).
 *   Буфер всегда сохраняется и отправляется в обратную связь.
 * 
 * ИСПОЛЬЗОВАНИЕ:
 *   import { createLogger } from '../utils/Logger.js';
 *   const DEBUG = false; // или true для отладки
 *   const log = createLogger('ModuleName', DEBUG);
 *   log('сообщение');
 *   log('ошибка', 'error');
 */

// ═══════════════════════════════════════
// НАСТРОЙКИ
// ═══════════════════════════════════════

/** Максимальное количество хранимых записей лога */
const MAX_LOG_ENTRIES = 500;

// ═══════════════════════════════════════
// ХРАНИЛИЩЕ
// ═══════════════════════════════════════

/** @type {string[]} Буфер всех логов */
const appLogs = [];

// ═══════════════════════════════════════
// API
// ═══════════════════════════════════════

/**
 * Создать логгер для модуля.
 * @param {string} name — имя модуля (префикс в консоли: [Name])
 * @param {boolean} debug — true = выводить в консоль + буфер, false = только буфер
 * @returns {(message: string, level?: string) => void}
 */
export function createLogger(name, debug) {
  return function log(message, level = 'info') {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const entry = `${timestamp} [${name}] ${message}`;

    // В консоль — только при debug=true
    if (debug) {
      if (level === 'error') console.error(entry);
      else if (level === 'warn') console.warn(entry);
      else console.log(entry);
    }

    // В буфер — всегда
    appLogs.push(entry);
    if (appLogs.length > MAX_LOG_ENTRIES) appLogs.shift();
  };
}

/**
 * Получить все логи для отправки в обратную связь.
 * @returns {string|null} null если буфер пуст
 */
export function getLogs() {
  if (appLogs.length === 0) return null;
  return appLogs.join('\n');
}