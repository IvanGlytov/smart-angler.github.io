document.addEventListener("DOMContentLoaded", () => {
  if (!window.Telegram?.WebApp) {
    console.error("Telegram WebApp не загружен");
    return;
  }

  Telegram.WebApp.ready();
  Telegram.WebApp.expand();

  const map = L.map('map').setView([55.75, 37.62], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  // Загружаем GeoJSON с точками глубин
  fetch('desna_depths.geojson')
    .then(res => res.json())
    .then(data => {
      // Конвертируем в формат для heatmap: [lat, lon, вес]
      const heatPoints = data.features.map(feature => {
        const lat = feature.geometry.coordinates[1];
        const lon = feature.geometry.coordinates[0];
        const depth = feature.properties.depth;

        // Вес = глубина (чем глубже — тем "горячее")
        // Или инвертируй, если хочешь мелководье = "горячее"
        return [lat, lon, depth];
      });

      // Создаём heatmap
      L.heatLayer(heatPoints, {
        radius: 10,        // радиус влияния точки (в пикселях)
        blur: 8,          // размытие
        maxZoom: 12,       // не рисовать на очень крупных масштабах
        gradient: {
          0.0: '#FF0000',   // красный — 0 м
          0.2: '#FFA500',   // оранжевый — 1 м
          0.4: '#FFFF00',   // жёлтый — 2 м
          0.6: '#1e90ff',   // синий — 4 м
          1.0: '#00008b'    // тёмно-синий — 10 м+
        }
      }).addTo(map);
    });

  // === ОБРАБОТЧИК КЛИКА ===
  map.on('click', function(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    if (window.marker) {
      map.removeLayer(window.marker);
    }
    window.marker = L.marker([lat, lng]).addTo(map);

    Telegram.WebApp.sendData(JSON.stringify({
      lat: lat,
      lon: lng
    }));

    Telegram.WebApp.close();
  });
});