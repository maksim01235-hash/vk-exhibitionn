/**
 * Точка входа приложения «Выставка».
 * 
 * Порядок инициализации:
 *   1. Service Worker — кеширование статики для офлайн-доступа
 *   2. UIManager — создание экранов и подписка на события
 *   3. DataLayer — загрузка данных из Google Таблицы
 *   4. Router — определение начального экрана (хеш / QR)
 * 
 * При расширении можно добавить:
 *   — Аналитику (отправка статистики просмотров)
 *   — Инициализацию VK Bridge для рекламы / покупок
 *   — Восстановление состояния после перезагрузки
 */

import CONFIG from './config.js';
import DataLayer from './data/DataLayer.js';
import Router from './core/Router.js';
import UIManager from './ui/UIManager.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/**
 * Версия приложения.
 * Меняется при каждом деплое для сброса кеша Service Worker.
 * Отображается в консоли для отладки.
 * 
 * Формат: MAJOR.MINOR.PATCH
 *   MAJOR — крупные изменения (новая архитектура)
 *   MINOR — новый функционал
 *   PATCH — исправления
 */
const APP_VERSION = '2.2.8';

/** Путь к файлу Service Worker */
const SW_PATH = '/sw.js';

/**
 * Инициализировать приложение.
 * Вызывается при DOMContentLoaded (или сразу если DOM уже готов).
 */
async function init() {
  console.log(`Выставка v${APP_VERSION}: инициализация...`);

  // 1. Service Worker — кеширование статики и изображений
  await _registerServiceWorker();

  // 2. UI — создание экранов, подписка на события навигации
  UIManager.init();

  // 3. Данные — загрузка из Google Таблицы
  await DataLayer.load();

  // 4. Роутер — определить начальный экран (хеш, QR, галерея)
  await Router.init();

  console.log(`Выставка v${APP_VERSION}: готово`);
}

/**
 * Зарегистрировать Service Worker.
 * Не блокирует запуск при ошибке — приложение работает и без SW.
 */
async function _registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('SW: не поддерживается браузером');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register(SW_PATH);
    console.log('SW: зарегистрирован, scope =', registration.scope);
  } catch (e) {
    console.warn('SW: не зарегистрирован —', e.message);
  }
}

// Запуск: ждём готовности DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}