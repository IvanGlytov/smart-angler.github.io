document.addEventListener("DOMContentLoaded", () => {
  if (!window.Telegram?.WebApp) {
    console.error("Telegram WebApp не загружен");
    return;
  }

  Telegram.WebApp.ready();
  Telegram.WebApp.expand();

  const map = L.map('map').setView([55.75, 37.62], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  map.on('click', function(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng; // ← именно lng, не lon!

    // Удаляем старый маркер
    if (window.marker) {
      map.removeLayer(window.marker);
    }
    // Добавляем новый маркер
    window.marker = L.marker([lat, lng]).addTo(map);

    // Отправляем данные в бот
    Telegram.WebApp.sendData(JSON.stringify({
      lat: lat,
      lon: lng  // ← в JSON можно назвать "lon", это ок
    }));

    Telegram.WebApp.close();
  });
});
