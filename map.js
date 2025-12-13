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

  // Функция получения цвета по глубине с плавным градиентом
  function getDepthColor(depth) {
    // Плавный градиент от красного (мелко) к синему (глубоко)
    if (depth < 0.5) return '#FF0000';      // красный
    if (depth < 1) return '#FF4500';        // оранжево-красный
    if (depth < 1.5) return '#FF8C00';      // тёмно-оранжевый
    if (depth < 2) return '#FFA500';        // оранжевый
    if (depth < 2.5) return '#FFD700';      // золотой
    if (depth < 3) return '#FFFF00';        // жёлтый
    if (depth < 4) return '#ADFF2F';        // зелёно-жёлтый
    if (depth < 5) return '#00CED1';        // тёмно-бирюзовый
    if (depth < 7) return '#1E90FF';        // синий
    if (depth < 10) return '#0000FF';       // синий
    return '#00008B';                        // тёмно-синий
  }

  // Функция получения интенсивности для heatmap
  function getIntensity(depth) {
    const normalized = Math.max(0.2, 1.0 - (depth / 15));
    return normalized;
  }

  // Алгоритм построения выпуклой оболочки (Graham scan)
  function convexHull(points) {
    if (points.length < 3) return null;
    
    // Находим самую нижнюю точку (и самую левую при равенстве)
    let bottomPoint = points[0];
    let bottomIndex = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].lat < bottomPoint.lat || 
          (points[i].lat === bottomPoint.lat && points[i].lon < bottomPoint.lon)) {
        bottomPoint = points[i];
        bottomIndex = i;
      }
    }
    
    // Удаляем опорную точку из массива
    const sorted = points.map((p, i) => ({
      ...p,
      index: i
    }));
    const pivot = sorted.splice(bottomIndex, 1)[0];
    
    // Сортируем по полярному углу относительно опорной точки
    sorted.sort((a, b) => {
      const angleA = Math.atan2(a.lat - pivot.lat, a.lon - pivot.lon);
      const angleB = Math.atan2(b.lat - pivot.lat, b.lon - pivot.lon);
      if (Math.abs(angleA - angleB) < 0.0001) {
        // Если углы равны, сортируем по расстоянию
        const distA = Math.pow(a.lat - pivot.lat, 2) + Math.pow(a.lon - pivot.lon, 2);
        const distB = Math.pow(b.lat - pivot.lat, 2) + Math.pow(b.lon - pivot.lon, 2);
        return distA - distB;
      }
      return angleA - angleB;
    });
    
    // Строим выпуклую оболочку
    const hull = [pivot, sorted[0]];
    
    for (let i = 1; i < sorted.length; i++) {
      while (hull.length > 1) {
        const p1 = hull[hull.length - 2];
        const p2 = hull[hull.length - 1];
        const p3 = sorted[i];
        
        // Вычисляем векторное произведение
        const cross = (p2.lon - p1.lon) * (p3.lat - p1.lat) - 
                      (p2.lat - p1.lat) * (p3.lon - p1.lon);
        
        if (cross <= 0) {
          hull.pop();
        } else {
          break;
        }
      }
      hull.push(sorted[i]);
    }
    
    // Преобразуем в массив координат [lat, lon]
    return hull.map(p => [p.lat, p.lon]);
  }

  // Функция расширения полигона для более плавных границ
  function expandPolygon(polygon, expansion = 0.0001) {
    if (polygon.length < 3) return polygon;
    
    // Находим центр масс
    const center = {
      lat: polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length,
      lon: polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length
    };
    
    // Расширяем полигон от центра
    return polygon.map(point => [
      center.lat + (point[0] - center.lat) * (1 + expansion),
      center.lon + (point[1] - center.lon) * (1 + expansion)
    ]);
  }

  // Загрузка данных глубин
  fetch('merged_depths.geojson?v=1')
    .then(res => {
      if (!res.ok) throw new Error('Не удалось загрузить данные глубин');
      return res.json();
    })
    .then(data => {
      // Подготовка данных
      const heatData = [];
      
      // Определяем уровни контуров (изолинии)
      const contourLevels = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 7, 10];
      const contourGroups = {};
      
      contourLevels.forEach(level => {
        contourGroups[level] = [];
      });

      // Обрабатываем все точки
      data.features.forEach(feature => {
        const [lon, lat] = feature.geometry.coordinates;
        const depth = feature.properties.depth;

        if (typeof depth !== 'number' || isNaN(depth)) return;

        // Добавляем в heatmap для градиентной заливки
        heatData.push([lat, lon, getIntensity(depth)]);

        // Группируем по уровням контуров
        for (let i = 0; i < contourLevels.length; i++) {
          const level = contourLevels[i];
          const nextLevel = i < contourLevels.length - 1 ? contourLevels[i + 1] : Infinity;
          
          if (depth >= level && depth < nextLevel) {
            contourGroups[level].push({ lat, lon, depth });
            break;
          }
        }
      });

      // Создаём heatmap с градиентом (базовая заливка)
      const heatLayer = L.heatLayer(heatData, {
        radius: 40,
        blur: 30,
        maxZoom: 17,
        gradient: {
          0.0: 'blue',
          0.2: 'cyan',
          0.4: 'lightblue',
          0.5: 'yellow',
          0.7: 'orange',
          0.9: 'red',
          1.0: 'darkred'
        },
        max: 1.0,
        minOpacity: 0.3
      }).addTo(map);

      // Создаём контурные области для каждого уровня
      Object.keys(contourGroups).forEach(levelStr => {
        const level = parseFloat(levelStr);
        const points = contourGroups[levelStr];
        
        if (points.length < 3) return; // Нужно минимум 3 точки для полигона

        const contourColor = getDepthColor(level);
        
        // Группируем точки в кластеры по близости
        const clusters = [];
        const used = new Set();
        const clusterDistance = 0.003; // Расстояние для группировки в кластеры
        
        points.forEach((point, idx) => {
          if (used.has(idx)) return;
          
          const cluster = [point];
          used.add(idx);
          
          // Ищем все близкие точки для этого кластера
          let foundNew = true;
          while (foundNew) {
            foundNew = false;
            points.forEach((otherPoint, otherIdx) => {
              if (used.has(otherIdx)) return;
              
              // Проверяем расстояние до любой точки в кластере
              for (const clusterPoint of cluster) {
                const distance = Math.sqrt(
                  Math.pow(otherPoint.lat - clusterPoint.lat, 2) + 
                  Math.pow(otherPoint.lon - clusterPoint.lon, 2)
                );
                
                if (distance < clusterDistance) {
                  cluster.push(otherPoint);
                  used.add(otherIdx);
                  foundNew = true;
                  break;
                }
              }
            });
          }
          
          if (cluster.length >= 3) {
            clusters.push(cluster);
          }
        });

        // Создаём полигоны для каждого кластера
        clusters.forEach(cluster => {
          // Строим выпуклую оболочку для кластера
          const hull = convexHull(cluster);
          
          if (hull && hull.length >= 3) {
            // Немного расширяем полигон для более плавных границ
            const expandedHull = expandPolygon(hull, 0.00015);
            
            // Замыкаем полигон
            const closedHull = [...expandedHull, expandedHull[0]];
            
            // Создаём полигон с контурной линией
            L.polygon(closedHull, {
              fillColor: contourColor,
              fillOpacity: 0.4,
              color: contourColor,
              weight: 2.5,
              opacity: 0.9,
              smoothFactor: 1
            })
            .bindTooltip(`${level.toFixed(1)} м`, {
              permanent: false,
              direction: 'auto'
            })
            .addTo(map);
          }
        });
      });

      // Легенда глубин
      const legend = L.control({ position: 'bottomright' });
      legend.onAdd = () => {
        const div = L.DomUtil.create('div', 'legend');
        div.style.cssText = 'background: rgba(255, 255, 255, 0.95); padding: 12px; border-radius: 6px; font-size: 11px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);';
        div.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 6px; font-size: 12px;">Глубина (м):</div>
          <div><span style="background:#FF0000; width:18px; height:12px; display:inline-block; margin-right:6px; border:1px solid #333; border-radius:2px;"></span> < 0.5</div>
          <div><span style="background:#FF8C00; width:18px; height:12px; display:inline-block; margin-right:6px; border:1px solid #333; border-radius:2px;"></span> 1–2</div>
          <div><span style="background:#FFD700; width:18px; height:12px; display:inline-block; margin-right:6px; border:1px solid #333; border-radius:2px;"></span> 2–3</div>
          <div><span style="background:#00CED1; width:18px; height:12px; display:inline-block; margin-right:6px; border:1px solid #333; border-radius:2px;"></span> 4–5</div>
          <div><span style="background:#1E90FF; width:18px; height:12px; display:inline-block; margin-right:6px; border:1px solid #333; border-radius:2px;"></span> 5–7</div>
          <div><span style="background:#00008B; width:18px; height:12px; display:inline-block; margin-right:6px; border:1px solid #333; border-radius:2px;"></span> > 10</div>
        `;
        return div;
      };
      legend.addTo(map);
    })
    .catch(err => {
      console.error('Ошибка загрузки глубин:', err);
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
