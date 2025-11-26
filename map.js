// map.js
document.addEventListener("DOMContentLoaded", () => {
  // Инициализация Telegram WebApp
  if (window.Telegram?.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
  }

  // Функция инициализации карты
  function initMap(centerLat, centerLon) {
    const map = L.map('map').setView([centerLat, centerLon], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    let marker;

    map.on('click', function(e) {
      const { lat, lon } = e.latlng;
      if (marker) map.removeLayer(marker);
      marker = L.marker([lat, lon]).addTo(map);

      if (window.Telegram?.WebApp) {
        Telegram.WebApp.sendData(JSON.stringify({ lat, lon: lon }));
        Telegram.WebApp.close();
      }
    });
  }

  // Пытаемся получить геопозицию пользователя
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        initMap(latitude, longitude);
      },
      () => {
        // Если нет доступа — карта центрируется на Москве
        initMap(55.75, 37.62);
      }
    );
  } else {
    initMap(55.75, 37.62);
  }
});
