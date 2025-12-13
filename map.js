document.addEventListener("DOMContentLoaded", () => {
  if (!window.Telegram?.WebApp) {
    console.error("Telegram WebApp не загружен");
    return;
  }

  Telegram.WebApp.ready();
  Telegram.WebApp.expand();

  // Инициализация карты с центром по умолчанию (Москва)
  let map = L.map('map').setView([55.75, 37.62], 7);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  // Попытка получить геолокацию пользователя
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        map.setView([latitude, longitude], 13);
        console.log('Геолокация получена:', latitude, longitude);
      },
      (error) => {
        console.warn('Геолокация недоступна, используем Москву:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
  }

  // Функция получения цвета по глубине (30 градаций от 0 до 15 метров)
  function getDepthColor(depth) {
    // Ограничиваем глубину до 15 метров
    const clampedDepth = Math.min(Math.max(depth, 0), 15);
    
    // Нормализуем глубину от 0 до 1 (0-15 метров)
    const normalized = clampedDepth / 15;
    
    // Вычисляем индекс градации (0-29 для 30 градаций)
    const gradientIndex = Math.min(Math.floor(normalized * 30), 29);
    
    // Функция для интерполяции цвета между двумя цветами
    function interpolateColor(color1, color2, factor) {
      const r1 = parseInt(color1.substr(1, 2), 16);
      const g1 = parseInt(color1.substr(3, 2), 16);
      const b1 = parseInt(color1.substr(5, 2), 16);
      const r2 = parseInt(color2.substr(1, 2), 16);
      const g2 = parseInt(color2.substr(3, 2), 16);
      const b2 = parseInt(color2.substr(5, 2), 16);
      
      const r = Math.round(r1 + (r2 - r1) * factor);
      const g = Math.round(g1 + (g2 - g1) * factor);
      const b = Math.round(b1 + (b2 - b1) * factor);
      
      return '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      }).join('');
    }
    
    // Ключевые цвета для градиента (красный → оранжевый → желтый → зеленый → голубой → синий → темно-синий)
    const keyColors = [
      '#FF0000', // 0: Красный (0 м)
      '#FF8000', // Оранжевый (3.75 м)
      '#FFFF00', // Желтый (7.5 м)
      '#80FF00', // Зеленый (11.25 м)
      '#00FFCC', // Голубой (13.125 м)
      '#0080CC', // Синий (14.0625 м)
      '#0000CC'  // Темно-синий (15+ м)
    ];
    
    // Разбиваем на 30 градаций между ключевыми цветами
    const segments = keyColors.length - 1;
    const segmentSize = 30 / segments; // ~4.29 градаций на сегмент
    
    const segmentIndex = Math.floor(gradientIndex / segmentSize);
    const segmentFactor = (gradientIndex % segmentSize) / segmentSize;
    
    const color1 = keyColors[Math.min(segmentIndex, keyColors.length - 2)];
    const color2 = keyColors[Math.min(segmentIndex + 1, keyColors.length - 1)];
    
    return interpolateColor(color1, color2, segmentFactor);
  }

  // Загрузка данных глубин
  fetch('all_depths.geojson?v=1')
    .then(res => {
      if (!res.ok) throw new Error('Не удалось загрузить данные глубин');
      return res.json();
    })
    .then(data => {
      console.log(`Загружено ${data.features.length} точек глубин`);
      
      let pointCount = 0;
      const maxPoints = 50000; // Ограничение для производительности
      
      // Отображаем каждую точку как кружок
      data.features.forEach((feature, index) => {
        // Ограничиваем количество точек для производительности
        if (pointCount >= maxPoints) return;
        
        const [lon, lat] = feature.geometry.coordinates;
        const depth = feature.properties.depth;

        if (typeof depth !== 'number' || isNaN(depth)) return;
        if (typeof lat !== 'number' || typeof lon !== 'number') return;

        const color = getDepthColor(depth);
        
        // Создаем кружок для каждой точки
        L.circleMarker([lat, lon], {
          radius: 3, // Размер кружка
          fillColor: color,
          fillOpacity: 0.7,
          color: color,
          weight: 1,
          opacity: 0.8
        })
        .bindTooltip(`${depth.toFixed(1)} м`, {
          permanent: false,
          direction: 'auto'
        })
        .addTo(map);
        
        pointCount++;
      });
      
      console.log(`Отображено ${pointCount} точек`);

      // Легенда глубин с 30 градациями
      const legend = L.control({ position: 'bottomright' });
      legend.onAdd = () => {
        const div = L.DomUtil.create('div', 'legend');
        div.style.cssText = 'background: rgba(255, 255, 255, 0.95); padding: 12px; border-radius: 6px; font-size: 11px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); max-width: 200px;';
        
        // Создаем градиентную полосу для легенды
        let gradientHtml = '<div style="font-weight: bold; margin-bottom: 8px; font-size: 12px;">Глубина (м):</div>';
        gradientHtml += '<div style="height: 20px; background: linear-gradient(to right, #FF0000, #FF8000, #FFFF00, #80FF00, #00FFCC, #0080CC, #0000CC); border: 1px solid #333; border-radius: 3px; margin-bottom: 6px;"></div>';
        gradientHtml += '<div style="display: flex; justify-content: space-between; font-size: 10px; color: #666;">';
        gradientHtml += '<span>0 м</span><span>7.5 м</span><span>15+ м</span>';
        gradientHtml += '</div>';
        
        // Добавляем примеры цветов для ключевых глубин
        gradientHtml += '<div style="margin-top: 8px; font-size: 10px;">';
        gradientHtml += '<div><span style="background:#FF0000; width:14px; height:10px; display:inline-block; margin-right:4px; border:1px solid #333; border-radius:2px;"></span> 0-0.5 м (мелко)</div>';
        gradientHtml += '<div><span style="background:#FFFF00; width:14px; height:10px; display:inline-block; margin-right:4px; border:1px solid #333; border-radius:2px;"></span> 5-7.5 м</div>';
        gradientHtml += '<div><span style="background:#0080CC; width:14px; height:10px; display:inline-block; margin-right:4px; border:1px solid #333; border-radius:2px;"></span> 12-15 м</div>';
        gradientHtml += '<div><span style="background:#0000CC; width:14px; height:10px; display:inline-block; margin-right:4px; border:1px solid #333; border-radius:2px;"></span> >15 м (глубоко)</div>';
        gradientHtml += '</div>';
        
        div.innerHTML = gradientHtml;
        return div;
      };
      legend.addTo(map);
    })
    .catch(err => {
      console.error('Ошибка загрузки глубин:', err);
      // Пробуем загрузить старый файл как fallback
      return fetch('merged_depths.geojson?v=1')
        .then(res => res.json())
        .then(data => {
          console.log('Загружен резервный файл merged_depths.geojson');
          // Повторяем логику отображения
        })
        .catch(fallbackErr => {
          console.error('Ошибка загрузки резервного файла:', fallbackErr);
        });
    });

  // Поиск по адресу
  const searchControl = L.control({ position: 'topleft' });
  searchControl.onAdd = () => {
    const div = L.DomUtil.create('div', 'search-control');
    div.innerHTML = `
      <input type="text" id="search-input" placeholder="Поиск адреса..." 
             style="width: 200px; padding: 5px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px;">
      <div id="search-results" style="position: absolute; background: white; width: 200px; max-height: 200px; overflow-y: auto; z-index: 1000; display: none; border: 1px solid #ccc; border-radius: 4px; margin-top: 2px;"></div>
    `;
    return div;
  };
  searchControl.addTo(map);

  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  let searchTimeout;

  // Поиск через Nominatim (OpenStreetMap)
  async function searchAddress(query) {
    if (query.length < 3) {
      searchResults.style.display = 'none';
      return;
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&accept-language=ru`
      );
      const results = await response.json();
      
      if (results.length === 0) {
        searchResults.innerHTML = '<div style="padding: 5px;">Ничего не найдено</div>';
        searchResults.style.display = 'block';
        return;
      }

      searchResults.innerHTML = results.map(result => `
        <div class="search-result-item" 
             style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee;"
             data-lat="${result.lat}" 
             data-lon="${result.lon}">
          ${result.display_name}
        </div>
      `).join('');

      // Обработчики клика на результат
      document.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
          const lat = parseFloat(item.dataset.lat);
          const lon = parseFloat(item.dataset.lon);
          map.setView([lat, lon], 13);
          searchResults.style.display = 'none';
          searchInput.value = '';
        });
      });

      searchResults.style.display = 'block';
    } catch (error) {
      console.error('Ошибка поиска:', error);
    }
  }

  // Обработчик ввода в поле поиска
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchAddress(e.target.value);
    }, 500);
  });

  // Скрыть результаты при клике вне поля
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
      searchResults.style.display = 'none';
    }
  });

  // Обработчик клика на карте
  let marker = null;
  map.on('click', function(e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    if (marker) {
      map.removeLayer(marker);
    }
    marker = L.marker([lat, lon]).addTo(map);

    // Отправляем данные в бот
    Telegram.WebApp.sendData(JSON.stringify({ lat, lon }));
    Telegram.WebApp.close();
  });
});
