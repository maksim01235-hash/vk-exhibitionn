import CONFIG from './config.js';
import DataLayer from './data/DataLayer.js';
import Router from './core/Router.js';
import UIManager from './ui/UIManager.js';

const APP_VERSION = '1.4.6';

async function init() {
  console.log(`Выставка v${APP_VERSION}: инициализация...`);

  // Регистрируем Service Worker
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('SW зарегистрирован:', registration.scope);
    } catch (e) {
      console.log('SW не зарегистрирован:', e);
    }
  }

  UIManager.init();
  await DataLayer.load();
  await Router.init();

  console.log(`Выставка v${APP_VERSION}: готово`);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}