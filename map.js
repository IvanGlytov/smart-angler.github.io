// map.js
document.addEventListener("DOMContentLoaded", () => {
  // Загружаем Telegram WebApp SDK
  if (!window.Telegram || !Telegram.WebApp) {
    console.error("Telegram WebApp SDK не загружен");
    return;
  }

  Telegram.WebApp.ready();
  Telegram.WebApp.expand();

  // Инициализация карты
  const map = L.map('map').setView([55.75, 37.62], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  // Обработчик клика
  map.on('click', function(e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lon; 

    // Опционально: показать маркер
    if (window.marker) map.removeLayer(window.marker);
    window.marker = L.marker([lat, lon]).addTo(map);

    // Отправка данных в бот
    Telegram.WebApp.sendData(JSON.stringify({
      lat: lat,
      lon: lon 
    }));

    // Закрытие Mini App
    Telegram.WebApp.close();
  });
});
