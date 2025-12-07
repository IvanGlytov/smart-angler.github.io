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

  // === ЗАГРУЗКА ЗАГЛУШКИ ГЛУБИН ===
  fetch('depths_mock.geojson')
    .then(res => res.json())
    .then(data => {
      L.geoJSON(data, {
        pointToLayer: (feature, latlng) => {
          const depth = feature.properties.depth || 0;
          let style = { radius: 8, fillColor: '#00f', color: '#000', weight: 1, fillOpacity: 0.6 };
      
          if (feature.properties.type === 'deep_hole') {
            style = { ...style, radius: 12, fillColor: '#00008b' };
          } else if (feature.properties.type === 'medium_depth') {
            style = { ...style, radius: 9, fillColor: '#1e90ff' };
          } else if (feature.properties.type === 'shoal') {
            style = { ...style, radius: 7, fillColor: '#ffcc00' };
          }
      
          return L.circleMarker(latlng, style)
            .bindPopup(`<b>${feature.properties.name}</b><br>Глубина: ${depth} м`);
        },
        style: (feature) => {
          if (feature.properties.type === 'slope') {
            return { color: '#ff8c00', weight: 4, opacity: 0.8 };
          }
          if (feature.properties.type === 'waterbody_outline') {
            return { color: '#1e90ff', weight: 2, fillOpacity: 0.1 };
          }
        }
      }).addTo(map);

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