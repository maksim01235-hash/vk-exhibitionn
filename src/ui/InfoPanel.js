import { renderMarkdown } from '../utils/markdown.js';

class InfoPanel {
  constructor() {
    this._container = document.getElementById('info-content');
  }

  render(photo) {
    const techParams = [];
    if (photo.techInfo) {
      if (photo.techInfo.camera) techParams.push({ label: 'Камера', value: photo.techInfo.camera });
      if (photo.techInfo.lens) techParams.push({ label: 'Объектив', value: photo.techInfo.lens });
      if (photo.techInfo.iso) techParams.push({ label: 'ISO', value: photo.techInfo.iso });
      if (photo.techInfo.aperture) techParams.push({ label: 'Диафрагма', value: photo.techInfo.aperture });
      if (photo.techInfo.shutterSpeed) techParams.push({ label: 'Выдержка', value: photo.techInfo.shutterSpeed });
      if (photo.techInfo.focalLength) techParams.push({ label: 'Фокусное расстояние', value: photo.techInfo.focalLength });
    }

    let html = '';

    // Название
    if (photo.title) {
      html += `<h2 class="photo-title">${renderMarkdown(photo.title)}</h2>`;
    }

    // Автор
    if (photo.photographer) {
      html += `<div class="photo-photographer">${renderMarkdown(photo.photographer)}</div>`;
    }

    // Описание
    if (photo.description) {
      html += `<div class="photo-description">${renderMarkdown(photo.description)}</div>`;
    }

    // Интересный факт
    if (photo.funFact) {
      html += `
        <div class="photo-funfact">
          <h3>Интересный факт</h3>
          <div class="funfact-content">${renderMarkdown(photo.funFact)}</div>
        </div>
      `;
    }

    // Технические параметры
    if (techParams.length > 0) {
      html += `
        <div class="photo-techinfo">
          <h3>Технические параметры</h3>
          <table class="tech-table">
            ${techParams.map(p => `
              <tr>
                <td class="tech-label">${p.label}</td>
                <td class="tech-value">${p.value}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      `;
    }

    this._container.innerHTML = html;
  }
}

export default InfoPanel;