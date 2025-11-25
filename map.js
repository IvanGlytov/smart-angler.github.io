// map.js
document.addEventListener("DOMContentLoaded", () => {
  // Инициализация Telegram WebApp
  if (window.Telegram && Telegram.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
  }

  // Инициализация карты
  const map = L.map('map').setView([55.75, 37.62], 6);

  // Слой OpenStreetMap
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  // Обработчик клика
  map.on('click', function(e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    // Удаляем старый маркер
    if (window.marker) {
      map.removeLayer(window.marker);
    }
    window.marker = L.marker([lat, lon]).addTo(map);

    // Отправка данных в бот
    if (window.Telegram && Telegram.WebApp) {
      Telegram.WebApp.sendData(JSON.stringify({ lat, lon }));
      Telegram.WebApp.close();
    }
  });
});
