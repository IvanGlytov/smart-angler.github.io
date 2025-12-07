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

  // Загружаем слой глубин
  fetch('desna_depths.geojson')
    .then(res => res.json())
    .then(data => {
      L.geoJSON(data, {
        pointToLayer: (feature, latlng) => {
          const depth = feature.properties.depth;
          let color = '#ffcc00'; // мелководье — жёлтый
          if (depth > 1.0) color = '#1e90ff'; // средняя глубина — синяя
          if (depth > 3.0) color = '#00008b'; // глубокая — тёмно-синяя

          return L.circleMarker(latlng, {
            radius: Math.min(4 + depth * 0.8, 10),
            fillColor: color,
            color: '#000',
            weight: 0.5,
            opacity: 1,
            fillOpacity: 0.6
          }).bindPopup(`Глубина: ${depth} м`);
        }
      }).addTo(map);
    })
    .catch(err => console.warn("Слой глубин не загружен:", err));

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