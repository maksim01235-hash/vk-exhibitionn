import CONFIG from './config.js';
import DataLayer from './data/DataLayer.js';
import Router from './core/Router.js';
import UIManager from './ui/UIManager.js';
import EventBus from './core/EventBus.js';

// Точка входа в приложение
async function init() {
  console.log('Выставка: инициализация...');

  // Инициализируем UI (создаём компоненты, вешаем обработчики)
  UIManager.init();

  // Загружаем данные
  await DataLayer.load();

  // Запускаем роутер (проверяет deep-link от QR)
  await Router.init();

  console.log('Выставка: готово');
}

// Запуск после загрузки страницы
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}