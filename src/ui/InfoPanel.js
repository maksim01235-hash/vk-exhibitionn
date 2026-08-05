import { renderMarkdown } from '../utils/markdown.js';

class InfoPanel {
  constructor() {
    this._container = document.getElementById('info-content');
  }

  render(photo) {
    let html = '';

    if (photo.title) {
      html += `<h2 class="photo-title">${renderMarkdown(photo.title)}</h2>`;
    }

    if (photo.photographer) {
      html += `<div class="photo-photographer">${renderMarkdown(photo.photographer)}</div>`;
    }

    if (photo.description) {
      html += `<div class="photo-description">${renderMarkdown(photo.description)}</div>`;
    }

    if (photo.funFact) {
      html += `
        <div class="photo-funfact">
          <h3>Интересный факт</h3>
          <div class="funfact-content">${renderMarkdown(photo.funFact)}</div>
        </div>
      `;
    }

    // Техпараметры — автоматически из techInfo
    const techKeys = Object.keys(photo.techInfo || {});
    if (techKeys.length > 0) {
      html += `
        <div class="photo-techinfo">
          <h3>Технические параметры</h3>
          <table class="tech-table">
            ${techKeys.map(key => `
              <tr>
                <td class="tech-label">${this._formatLabel(key)}</td>
                <td class="tech-value">${photo.techInfo[key]}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      `;
    }

    this._container.innerHTML = html;
  }

  _formatLabel(key) {
    // camelCase → читаемый вид
    const labels = {
      'camera': 'Камера',
      'lens': 'Объектив',
      'iso': 'ISO',
      'aperture': 'Диафрагма',
      'shutterSpeed': 'Выдержка',
      'focalLength': 'Фокусное расстояние',
      'exposure': 'Экспозиция',
      'flash': 'Вспышка',
      'whiteBalance': 'Баланс белого',
    };
    return labels[key] || key.charAt(0).toUpperCase() + key.slice(1);
  }
}

export default InfoPanel;