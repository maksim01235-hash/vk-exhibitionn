import CONFIG from '../config.js';
import Store from '../core/Store.js';

class DataLayer {
  constructor() {
    this._cacheKey = 'vk_exhibition_data_backup';
  }

  async load() {
    try {
      const photos = await this._fetchFromSheet();
      Store.setPhotos(photos);
      this._saveBackup(photos);
    } catch (error) {
      console.log('Ошибка загрузки, пробуем резервную копию:', error.message);
      const backup = this._getBackup();
      if (backup) {
        Store.setPhotos(backup);
      } else {
        Store.setError('Не удалось загрузить данные');
      }
    }
  }

  async _fetchFromSheet() {
    const response = await fetch(CONFIG.SHEET_URL);
    if (!response.ok) throw new Error(`Ошибка HTTP: ${response.status}`);
    const csvText = await response.text();
    console.log('CSV первые 500 символов:', csvText.substring(0, 500));
    const photos = this._parseCSV(csvText);
    console.log('Распаршено фото:', photos.length);
    photos.forEach(p => console.log('  id:', p.id, '| title:', p.title?.substring(0, 30)));
    return photos;
  }

  _parseCSV(csvText) {
    const rows = csvText
      .split('\n')
      .map(row => this._parseCSVRow(row))
      .filter(row => row.length > 0);

    if (rows.length < 2) return [];

    const headers = rows[0].map(h => h.trim());
    const photos = [];

    const baseFields = ['id', 'order', 'title', 'photographer', 'description', 'funFact', 'imageUrl', 'category'];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const photo = {};
      
      headers.forEach((header, index) => {
        photo[header] = index < row.length ? row[index].trim() : '';
      });

      photo.techInfo = {};
      headers.forEach((header) => {
        if (!baseFields.includes(header) && photo[header]) {
          photo.techInfo[header] = photo[header];
        }
      });

      if (photo.id && (photo.title || photo.imageUrl)) {
        photos.push(photo);
      }
    }

    photos.sort((a, b) => {
      if (a.order && b.order) return Number(a.order) - Number(b.order);
      return Number(a.id) - Number(b.id);
    });

    return photos;
  }

  _parseCSVRow(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  _saveBackup(photos) {
    try {
      localStorage.setItem(this._cacheKey, JSON.stringify(photos));
    } catch (e) {}
  }

  _getBackup() {
    try {
      const raw = localStorage.getItem(this._cacheKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
}

export default new DataLayer();