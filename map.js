document.addEventListener("DOMContentLoaded", () => {
  if (!window.Telegram?.WebApp) {
    console.error("Telegram WebApp не загружен");
    return;
  }

  Telegram.WebApp.ready();
  Telegram.WebApp.expand();

  // Конфигурация: URL файла с глубинами
  // Используем Yandex Object Storage с настроенным CORS
  
  // Отключаем все внешние источники
  const GOOGLE_DRIVE_FILE_ID = '';
  const GOOGLE_DRIVE_DIRECT_URL = '';
  const USE_CORS_PROXY = false; // Не требуется для Yandex Cloud
  const CORS_PROXY_URL = '';
  const GITHUB_RELEASES_URL = '';
  
  // Используем Yandex Object Storage
  // ЗАМЕНИТЕ на ваш реальный URL из Yandex Cloud
  // const DIRECT_FILE_URL = 'https://storage.yandexcloud.net/depths-map/all_depths.geojson';
  const DIRECT_FILE_URL = 'https://storage.yandexcloud.net/depths-map/all_depths_small.geojson'
  
  // Локальный файл с точками (резервный вариант, если Yandex Cloud недоступен)
  const LOCAL_FILE_URL = 'all_depths_small.geojson';
  
  // URL файла с контурами глубин (GeoJSON)
  // Замените на реальный URL после экспорта из ноутбука
  const CONTOURS_FILE_URL = 'https://storage.yandexcloud.net/depths-map/new_map_contours.geojson'; // Локальный файл или URL
  
  // Параметры heatmap
  const HEATMAP_MAX_POINTS = 100000; // Максимальное количество точек для heatmap
  const HEATMAP_RADIUS = 15; // Радиус точки в пикселях
  const HEATMAP_BLUR = 20; // Размытие в пикселях
  const HEATMAP_MAX_ZOOM = 18; // Максимальный зум для heatmap
  const HEATMAP_GRADIENT = {
    0.0: 'blue',    // Глубокие места - синий
    0.3: 'cyan',    // Средние глубины - голубой
    0.6: 'yellow',  // Мелководье - желтый
    0.8: 'orange',  // Очень мелко - оранжевый
    1.0: 'red'      // Очень мелко - красный
  };
  
  // Определяем, какой источник использовать (приоритет: GitHub Releases > Direct URL > Google Drive > Local)
  const USE_LOCAL_FILE = !GITHUB_RELEASES_URL && !DIRECT_FILE_URL && !GOOGLE_DRIVE_FILE_ID && !GOOGLE_DRIVE_DIRECT_URL;

  // Функция для преобразования ссылки Google Drive в прямую ссылку для скачивания
  function getGoogleDriveDownloadUrl(fileIdOrUrl) {
    let fileId = '';
    
    // Если это уже прямая ссылка, возвращаем как есть
    if (fileIdOrUrl.startsWith('http://') || fileIdOrUrl.startsWith('https://')) {
      // Проверяем, это уже прямая ссылка для скачивания
      if (fileIdOrUrl.includes('/uc?') && (fileIdOrUrl.includes('export=download') || fileIdOrUrl.includes('id='))) {
        return fileIdOrUrl; // Уже прямая ссылка
      }
      // Извлекаем ID из обычной ссылки Google Drive
      const match = fileIdOrUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match) {
        fileId = match[1];
      } else {
        // Если не удалось извлечь ID, возвращаем как есть (может быть другой формат)
        return fileIdOrUrl;
      }
    } else {
      // Если это просто ID файла
      fileId = fileIdOrUrl;
    }
    
    // Для больших файлов Google Drive может показывать страницу подтверждения
    // Пробуем несколько форматов:
    // 1. С confirm=yes (может не работать для очень больших файлов)
    // 2. Без confirm (может работать для файлов среднего размера)
    // Используем формат без confirm сначала, так как confirm=yes все равно показывает страницу для больших файлов
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }

  // Определяем URL для загрузки файла
  let depthsFileUrl;
  if (GITHUB_RELEASES_URL) {
    // Используем GitHub Releases (лучший вариант - нет CORS проблем)
    depthsFileUrl = GITHUB_RELEASES_URL;
  } else if (DIRECT_FILE_URL) {
    // Используем прямой URL
    depthsFileUrl = DIRECT_FILE_URL;
  } else if (GOOGLE_DRIVE_DIRECT_URL || GOOGLE_DRIVE_FILE_ID) {
    // Используем Google Drive (требует CORS proxy)
    const driveUrl = GOOGLE_DRIVE_DIRECT_URL || GOOGLE_DRIVE_FILE_ID;
    const directDriveUrl = getGoogleDriveDownloadUrl(driveUrl);
    
    if (USE_CORS_PROXY) {
      // Используем CORS proxy для обхода ограничений Google Drive
      const proxyUrl = CORS_PROXY_URL || 'https://corsproxy.io/?';
      depthsFileUrl = proxyUrl + encodeURIComponent(directDriveUrl);
    } else {
      // Без прокси не будет работать из-за CORS
      console.warn('⚠️ Google Drive блокирует CORS. Используйте CORS proxy или загрузите файл на GitHub Releases.');
      depthsFileUrl = directDriveUrl; // Попробуем, но скорее всего не сработает
    }
  } else {
    depthsFileUrl = LOCAL_FILE_URL;
  }

  // Проверяем, что элемент карты существует
  const mapElement = document.getElementById('map');
  if (!mapElement) {
    console.error('Элемент карты #map не найден в DOM');
    return;
  }

  // Инициализация карты с центром по умолчанию (Москва)
  let map = L.map('map').setView([55.75, 37.62], 7);
  
  // Спутниковая карта Esri World Imagery
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
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

  // Функция для получения цвета по глубине (от желтого до темно-синего)
  function getDepthColor(depth) {
    // Нормализуем глубину - ограничиваем диапазон и обрабатываем крайние случаи
    const normalizedDepth = Math.max(0, Math.min(depth, 20)); // Ограничиваем от 0 до 20м
    
    // Градиент от желтого (#FFFF00) до темно-синего (#00008B)
    const colors = [
      { depth: 0, color: '#FFFF00' },    // Желтый
      { depth: 2, color: '#FFD700' },     // Золотой
      { depth: 4, color: '#FFA500' },    // Оранжевый
      { depth: 6, color: '#FF8C00' },    // Темно-оранжевый
      { depth: 8, color: '#4169E1' },    // Королевский синий
      { depth: 12, color: '#0000CD' },    // Средний синий
      { depth: 20, color: '#00008B' }    // Темно-синий
    ];
    
    // Если глубина больше максимальной, возвращаем темно-синий
    if (normalizedDepth >= colors[colors.length - 1].depth) {
      return colors[colors.length - 1].color;
    }
    
    // Если глубина меньше минимальной, возвращаем желтый
    if (normalizedDepth <= colors[0].depth) {
      return colors[0].color;
    }
    
    // Находим два ближайших цвета для интерполяции
    let color1 = colors[0];
    let color2 = colors[colors.length - 1];
    
    for (let i = 0; i < colors.length - 1; i++) {
      if (normalizedDepth >= colors[i].depth && normalizedDepth <= colors[i + 1].depth) {
        color1 = colors[i];
        color2 = colors[i + 1];
        break;
      }
    }
    
    // Интерполируем между цветами
    const depthRange = color2.depth - color1.depth;
    const ratio = depthRange > 0 ? (normalizedDepth - color1.depth) / depthRange : 0;
    
    const r1 = parseInt(color1.color.slice(1, 3), 16);
    const g1 = parseInt(color1.color.slice(3, 5), 16);
    const b1 = parseInt(color1.color.slice(5, 7), 16);
    const r2 = parseInt(color2.color.slice(1, 3), 16);
    const g2 = parseInt(color2.color.slice(3, 5), 16);
    const b2 = parseInt(color2.color.slice(5, 7), 16);
    
    const r = Math.round(r1 + (r2 - r1) * ratio);
    const g = Math.round(g1 + (g2 - g1) * ratio);
    const b = Math.round(b1 + (b2 - b1) * ratio);
    
    return `rgb(${r}, ${g}, ${b})`;
  }

  // Функция для отображения контуров глубин
  function displayDepthContours(contoursUrl, mapInstance) {
    if (!contoursUrl) {
      console.warn('URL контуров не указан');
      return;
    }
    
    console.log(`Загрузка контуров с URL: ${contoursUrl}`);
    
    fetch(contoursUrl)
    .then(res => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.text().then(text => {
        const trimmedText = text.trim();
          if (trimmedText.startsWith('<!DOCTYPE') || trimmedText.startsWith('<html')) {
            throw new Error('Получен HTML вместо JSON');
          }
          return JSON.parse(text);
      });
    })
      .then(geojson => {
        console.log(`Загружено ${geojson.features.length} контуров`);
        
        // Находим диапазон глубин для информации
        let minDepth = Infinity;
        let maxDepth = -Infinity;
        geojson.features.forEach(feature => {
          const depth = feature.properties.depth_avg || feature.properties.depth_min || 0;
          if (depth < minDepth) minDepth = depth;
          if (depth > maxDepth) maxDepth = depth;
        });
        console.log(`Диапазон глубин: ${minDepth.toFixed(2)}м - ${maxDepth.toFixed(2)}м`);
        
        // Создаем стиль для каждого контура на основе реальной глубины
        // Используем абсолютные значения, без нормализации
        const styleFunction = (feature) => {
          const avgDepth = feature.properties.depth_avg || feature.properties.depth_min || 0;
          
          // Используем реальную глубину напрямую (без растягивания)
          const color = getDepthColor(avgDepth);
          
          // Логируем первые несколько контуров для отладки
          if (geojson.features.indexOf(feature) < 5) {
            console.log(`Контур ${geojson.features.indexOf(feature)}: глубина=${avgDepth.toFixed(2)}м, цвет=${color}`);
          }
          
          return {
          fillColor: color,
            fillOpacity: 0.6,
          color: color,
          weight: 1,
          opacity: 0.8
          };
        };
        
        // Создаем GeoJSON слой
        const contoursLayer = L.geoJSON(geojson, {
          style: styleFunction,
          onEachFeature: (feature, layer) => {
            // Добавляем popup с информацией о глубине
            const props = feature.properties;
            const popupContent = `
              <div style="font-size: 12px;">
                <strong>Глубина:</strong><br>
                Средняя: ${props.depth_avg} м<br>
                Мин: ${props.depth_min} м<br>
                Макс: ${props.depth_max} м
              </div>
            `;
            layer.bindPopup(popupContent);
          }
        });
        
        // Добавляем слой на карту
        contoursLayer.addTo(mapInstance);
        window.depthsContours = contoursLayer; // Сохраняем ссылку для управления
        
        console.log('✅ Контуры глубин добавлены на карту');
    })
    .catch(err => {
        console.warn('Ошибка загрузки контуров:', err);
        console.warn('Продолжаем работу без контуров');
      });
  }

  // Функция для создания heatmap из точек
  function createHeatmapFromPoints(data, mapInstance) {
    if (!data || !data.features || data.features.length === 0) {
      console.warn('Нет данных для создания heatmap');
      return;
    }
    
    if (typeof L.heatLayer === 'undefined') {
      console.warn('leaflet.heat не загружен, heatmap недоступен');
      return;
    }
    
    console.log('Создание heatmap из точек...');
    
    // Подготавливаем точки для heatmap
    const heatPoints = [];
    const maxPoints = Math.min(data.features.length, HEATMAP_MAX_POINTS);
    const sampleRate = Math.max(1, Math.floor(data.features.length / maxPoints));
    
    let processedCount = 0;
    for (let i = 0; i < data.features.length && processedCount < maxPoints; i++) {
      if (i % sampleRate !== 0) continue;
      
      const feature = data.features[i];
      if (feature.geometry.type !== 'Point') continue;
            
            const [lon, lat] = feature.geometry.coordinates;
            const depth = feature.properties.depth;

      if (typeof depth !== 'number' || isNaN(depth)) continue;
      if (typeof lat !== 'number' || typeof lon !== 'number') continue;
      
      // Нормализуем глубину от 0 до 1 для интенсивности heatmap
      // Инвертируем: мелкие места (0м) = высокая интенсивность (1.0), глубокие (15м+) = низкая (0.1)
      const normalizedDepth = Math.min(Math.max(depth, 0), 15);
      const intensity = 1.0 - (normalizedDepth / 15) * 0.9; // От 1.0 до 0.1
      
      // Формат для leaflet.heat: [lat, lon, intensity]
      heatPoints.push([lat, lon, intensity]);
      processedCount++;
    }
    
    console.log(`Создано ${heatPoints.length} точек для heatmap`);
    
    // Создаем heatmap слой
    const heatLayer = L.heatLayer(heatPoints, {
      radius: HEATMAP_RADIUS,
      blur: HEATMAP_BLUR,
      maxZoom: HEATMAP_MAX_ZOOM,
      gradient: HEATMAP_GRADIENT,
      max: 1.0, // Максимальная интенсивность
      minOpacity: 0.3 // Минимальная прозрачность
    });
    
    // Добавляем heatmap на карту
    if (mapInstance && mapInstance.getContainer()) {
      heatLayer.addTo(mapInstance);
      window.depthsHeatmap = heatLayer; // Сохраняем ссылку для управления
      console.log('✅ Heatmap добавлен на карту');
    }
  }

  // Загрузка контуров глубин (heatmap отключен)
  // Ждем, пока карта полностью инициализируется перед загрузкой контуров
  map.whenReady(() => {
    // Загружаем контуры независимо от точек
    if (CONTOURS_FILE_URL) {
      setTimeout(() => {
        displayDepthContours(CONTOURS_FILE_URL, map);
        
        // Добавляем легенду для контуров
        const legend = L.control({ position: 'bottomright' });
        legend.onAdd = () => {
          const div = L.DomUtil.create('div', 'legend');
          div.style.cssText = 'background: rgba(255, 255, 255, 0.95); padding: 12px; border-radius: 6px; font-size: 11px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); max-width: 200px;';
          
          let legendHtml = '<div style="font-weight: bold; margin-bottom: 8px; font-size: 12px;">Карта глубин</div>';
          
          // Легенда для контуров
          legendHtml += '<div style="margin-top: 4px;">';
          legendHtml += '<div style="font-size: 10px; margin-bottom: 4px;">Контуры глубин:</div>';
          legendHtml += '<span style="background:linear-gradient(to right, #FFFF00, #FFD700, #FFA500, #FF8C00, #4169E1, #0000CD, #00008B); width:100%; height:12px; display:block; border:1px solid #333; border-radius:2px; margin-bottom: 4px;"></span>';
          legendHtml += '<div style="display: flex; justify-content: space-between; font-size: 9px; color: #666;">';
          legendHtml += '<span>0м (мелко)</span><span>20м+ (глубоко)</span>';
          legendHtml += '</div>';
          legendHtml += '</div>';
          
          div.innerHTML = legendHtml;
          return div;
        };
        
        if (map && map.getContainer()) {
          legend.addTo(map);
        }
      }, 50);
    } else {
      console.warn('CONTOURS_FILE_URL не указан, контуры не будут загружены');
    }
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
