import CONFIG from './config.js';
import DataLayer from './data/DataLayer.js';
import Router from './core/Router.js';
import UIManager from './ui/UIManager.js';
import EventBus from './core/EventBus.js';

// Точка входа в приложение
async function init() {
  console.log('Выставка: инициализация...');

  // Инициализируем VK Bridge
  if (window.vkBridge) {
    try {
      await vkBridge.send('VKWebAppInit', {});
      console.log('VK Bridge инициализирован');
    } catch (e) {
      console.log('VK Bridge не доступен:', e);
    }
  }

  // Инициализируем UI
  UIManager.init();

  // Загружаем данные
  await DataLayer.load();

  // Запускаем роутер
  await Router.init();

  // Сообщаем VK, что приложение готово
  if (window.vkBridge) {
    try {
      await vkBridge.send('VKWebAppResizeWindow', {});
    } catch (e) {
      console.log('Resize window error:', e);
    }
  }

  console.log('Выставка: готово');
}

// Запуск после загрузки страницы
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}