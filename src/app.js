/**
 * Точка входа приложения «Выставка».
 * 
 * ПОРЯДОК ИНИЦИАЛИЗАЦИИ:
 *   1. Service Worker — кеширование статики для офлайн-доступа
 *   2. UIManager — создание экранов и подписка на события
 *   3. DataLayer — загрузка данных из Google Таблицы
 *   4. Router — определение начального экрана (хеш / QR)
 * 
 * ПРИ РАСШИРЕНИИ ДОБАВИТЬ:
 *   — Аналитику (отправка статистики просмотров)
 *   — Инициализацию VK Bridge для рекламы / покупок
 *   — Восстановление состояния после перезагрузки
 */

import CONFIG from './config.js';
import DataLayer from './data/DataLayer.js';
import Router from './core/Router.js';
import UIManager from './ui/UIManager.js';
import { getLogs } from './utils/Logger.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/**
 * Включить подробное логирование в консоль.
 * true — логировать все этапы инициализации и ошибки.
 * false — только критические ошибки.
 */
const DEBUG = true;

/**
 * Версия приложения.
 * Менять при каждом деплое для сброса кеша Service Worker.
 * Формат: MAJOR.MINOR.PATCH
 */
const APP_VERSION = '2.5.4';

/** Путь к Service Worker */
const SW_PATH = './sw.js';

// ═══════════════════════════════════════
// ЛОГИРОВАНИЕ
// ═══════════════════════════════════════

function log(...args) { if (DEBUG) console.log('[App]', ...args); }
function warn(...args) { if (DEBUG) console.warn('[App]', ...args); }

// ═══════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ
// ═══════════════════════════════════════

async function init() {
  log(`v${APP_VERSION}: инициализация...`);

  // 1. Service Worker — кеширование статики
  await registerSW();

  // 2. UI — экраны, подписки на события
  UIManager.init();
  log('UIManager инициализирован');

  // 3. Данные из Google Таблицы
  await DataLayer.load();
  log('DataLayer загружен');

  // 4. Роутер — определить начальный экран
  await Router.init();
  log('Router инициализирован');

  log(`v${APP_VERSION}: готово`);
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) {
    warn('Service Worker не поддерживается браузером');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register(SW_PATH, { scope: './' });
    log(`SW зарегистрирован, scope = ${registration.scope}`);
  } catch (e) {
    warn(`SW не зарегистрирован: ${e.message}`);
  }
}

// ═══════════════════════════════════════
// ЗАПУСК
// ═══════════════════════════════════════

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}