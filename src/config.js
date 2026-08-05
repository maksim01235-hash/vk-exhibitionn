// Конфигурация приложения
// Вставь сюда свою ссылку на опубликованную Google Таблицу (CSV)
const CONFIG = {
  // ЗАМЕНИ НА СВОЮ ССЫЛКУ:
  SHEET_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQj-JFU4pGi_7Q-dPvxXsFPCGMeAlg0fccBBNsnlXymBEn3AmEg7h0HbkV85Vi62a8BYOZav93Iv_50/pub?output=csv',
  
  // Время кеширования данных в минутах
  CACHE_TTL: 30,
  
  // Количество фотографий на странице в каталоге (для будущей пагинации)
  PHOTOS_PER_PAGE: 50,
};

export default CONFIG;