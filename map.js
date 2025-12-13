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

  // Цвет по глубине
  function getDepthColor(depth) {
    if (depth < 1) return '#FF0000';     // красный — <1 м
    if (depth < 2) return '#FF8C00';     // тёмно-оранжевый — 1–2 м
    if (depth < 3) return '#FFD700';     // золотой — 2–3 м
    if (depth < 5) return '#1E90FF';     // синий — 3–5 м
    return '#00008B';                    // тёмно-синий — >5 м
  }

  // Размер ячейки (подберите под плотность точек)
  const CELL_SIZE = 0.0005; // ~55 метров на широте 55°

  fetch('desna_depths.geojson?v=2')
    .then(res => {
      if (!res.ok) throw new Error('Не удалось загрузить данные глубин');
      return res.json();
    })
    .then(data => {
      data.features.forEach(feature => {
        const [lon, lat] = feature.geometry.coordinates;
        const depth = feature.properties.depth;

        if (typeof depth !== 'number' || isNaN(depth)) return;

        const bounds = [
          [lat - CELL_SIZE, lon - CELL_SIZE],
          [lat + CELL_SIZE, lon + CELL_SIZE]
        ];

        L.rectangle(bounds, {
          fillColor: getDepthColor(depth),
          fillOpacity: 0.85,
          color: '#00000010', // почти прозрачная тонкая граница
          weight: 0.3,
          interactive: true // чтобы работал tooltip
        })
        .bindTooltip(`${depth.toFixed(1)} м`, {
          permanent: false,
          direction: 'center',
          className: 'depth-tooltip',
          offset: [0, 0]
        })
        .addTo(map);
      });

      // === Легенда глубин ===
      const legend = L.control({ position: 'bottomright' });
      legend.onAdd = () => {
        const div = L.DomUtil.create('div', 'legend');
        div.innerHTML = `
          <div><b>Глубина:</b></div>
          <div><span style="background:#FF0000; width:16px; height:16px; display:inline-block; margin-right:4px;"></span> < 1 м</div>
          <div><span style="background:#FF8C00; width:16px; height:16px; display:inline-block; margin-right:4px;"></span> 1–2 м</div>
          <div><span style="background:#FFD700; width:16px; height:16px; display:inline-block; margin-right:4px;"></span> 2–3 м</div>
          <div><span style="background:#1E90FF; width:16px; height:16px; display:inline-block; margin-right:4px;"></span> 3–5 м</div>
          <div><span style="background:#00008B; width:16px; height:16px; display:inline-block; margin-right:4px;"></span> > 5 м</div>
        `;
        return div;
      };
      legend.addTo(map);
    })
    .catch(err => {
      console.error('Ошибка загрузки глубин:', err);
      alert('Не удалось загрузить карту глубин. Проверьте подключение.');
    });

  // === Обработчик клика ===
  map.on('click', function(e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    if (window.marker) {
      map.removeLayer(window.marker);
    }
    window.marker = L.marker([lat, lng]).addTo(map);

    Telegram.WebApp.sendData(JSON.stringify({ lat, lon }));
    Telegram.WebApp.close();
  });
});