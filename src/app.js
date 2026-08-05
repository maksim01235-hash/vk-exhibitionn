import CONFIG from './config.js';
import DataLayer from './data/DataLayer.js';
import Router from './core/Router.js';
import UIManager from './ui/UIManager.js';

const APP_VERSION = '1.3.0';

async function init() {
  console.log(`Выставка v${APP_VERSION}: инициализация...`);

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