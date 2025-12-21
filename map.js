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
  
  // URL файла с готовыми изолиниями и цветовыми зонами
  // Создается один раз скриптом generate_contours.py
  const CONTOURS_FILE_URL = 'https://storage.yandexcloud.net/depths-map/all_depths_small_contours.geojson';
  // Локальный файл с изолиниями (резервный вариант)
  const LOCAL_CONTOURS_FILE_URL = 'all_depths_small_contours.geojson';
  
  // Локальный файл с точками (резервный вариант, если Yandex Cloud недоступен)
  const LOCAL_FILE_URL = 'all_depths_small.geojson';
  
  // Использовать готовые изолинии (рекомендуется) или создавать на лету
  const USE_PRECOMPUTED_CONTOURS = true;
  
  // Отображать точки через heatmap (для уменьшения нагрузки)
  const USE_HEATMAP = true;
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

  // Определяем URL для загрузки изолиний
  let contoursFileUrl = '';
  if (USE_PRECOMPUTED_CONTOURS) {
    // Используем готовые изолинии
    if (CONTOURS_FILE_URL) {
      contoursFileUrl = CONTOURS_FILE_URL;
    } else if (LOCAL_CONTOURS_FILE_URL) {
      contoursFileUrl = LOCAL_CONTOURS_FILE_URL;
    }
  }
  
  // Загрузка данных глубин (изолинии или точки)
  const fileUrlToLoad = USE_PRECOMPUTED_CONTOURS && contoursFileUrl ? contoursFileUrl : depthsFileUrl;
  console.log(USE_PRECOMPUTED_CONTOURS && contoursFileUrl 
    ? `Загрузка готовых изолиний с URL: ${contoursFileUrl}`
    : `Загрузка файла глубин с URL: ${depthsFileUrl}`);
  
  // Ждем, пока карта полностью инициализируется перед загрузкой данных
  map.whenReady(() => {
  fetch(fileUrlToLoad)
    .then(res => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      // Получаем текст и парсим вручную для лучшей обработки ошибок
        // Примечание: не проверяем Content-Type, так как многие серверы хранения файлов
        // (Yandex Cloud, Google Drive и др.) могут возвращать неправильный Content-Type
        // для GeoJSON файлов. Вместо этого проверяем содержимое файла.
      return res.text().then(text => {
        // Проверяем, не является ли ответ HTML страницей (Google Drive может вернуть HTML для больших файлов)
        const trimmedText = text.trim();
        if (trimmedText.startsWith('<!DOCTYPE') || trimmedText.startsWith('<html') || trimmedText.startsWith('<HTML')) {
            console.error('Получен HTML вместо JSON. Google Drive показывает страницу подтверждения.');
            console.error('Возможные причины:');
          console.error('1. Файл слишком большой и Google Drive требует подтверждения');
          console.error('2. Файл не публичный или ссылка неправильная');
            console.error('3. Google Drive блокирует автоматическое скачивание больших файлов');
          console.error('Первые 500 символов ответа:', text.substring(0, 500));
            throw new Error('Google Drive вернул HTML страницу вместо файла. Для больших файлов Google Drive требует ручного подтверждения. Рекомендуется использовать локальный файл или GitHub Pages.');
        }
        try {
          return JSON.parse(text);
        } catch (e) {
          console.error('Ошибка парсинга JSON:', e);
          console.error('Первые 500 символов ответа:', text.substring(0, 500));
          throw new Error(`Ошибка парсинга JSON: ${e.message}`);
        }
      });
    })
    .then(data => {
      console.log(`Загружено ${data.features.length} элементов`);
      
      // Проверяем, что карта инициализирована
      if (!map) {
        console.error('Карта не инициализирована');
        return;
      }
      
      // Если загружены готовые изолинии, просто отображаем их
      if (USE_PRECOMPUTED_CONTOURS && contoursFileUrl) {
        console.log('Используются готовые изолинии из файла');
        
        // Показываем индикатор загрузки
        let loadingDiv = null;
        try {
          const mapContainer = map.getContainer();
          if (mapContainer) {
            loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading-message';
            loadingDiv.style.cssText = 'position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 1000; background: rgba(0, 0, 0, 0.7); color: white; padding: 10px; border-radius: 5px; font-size: 12px; text-align: center; pointer-events: none;';
            loadingDiv.innerHTML = '⏳ Загрузка изолиний...';
            mapContainer.appendChild(loadingDiv);
          }
        } catch (addError) {
          console.warn('Не удалось добавить индикатор загрузки:', addError);
        }
        
        // Разделяем изобанды и изолинии
        const isobands = [];
        const contours = [];
        
        data.features.forEach(feature => {
          if (feature.geometry.type === 'Polygon') {
            isobands.push(feature);
          } else if (feature.geometry.type === 'LineString') {
            contours.push(feature);
          }
        });
        
        console.log(`Найдено ${isobands.length} цветовых зон и ${contours.length} изолиний`);
        
        // Удаляем индикатор загрузки
        try {
          if (loadingDiv && loadingDiv.parentNode) {
            loadingDiv.parentNode.removeChild(loadingDiv);
          }
        } catch (e) {
          // Игнорируем ошибку удаления
        }
        
        // Отображаем изолинии на карте
        setTimeout(() => {
          try {
            // Создаем группу слоев для изобанд (цветовые зоны)
            const isobandsCollection = {
              type: 'FeatureCollection',
              features: isobands
            };
            const isobandsLayer = L.geoJSON(isobandsCollection, {
              style: (feature) => ({
                fillColor: feature.properties.fill || '#888',
                fillOpacity: feature.properties.fillOpacity || 0.6,
                color: feature.properties.stroke || '#333',
                weight: feature.properties.strokeWidth || 0.5,
                opacity: feature.properties.strokeOpacity || 0.5
              }),
              onEachFeature: (feature, layer) => {
                const depthRange = feature.properties.depthRange || 'неизвестно';
                layer.bindTooltip(`${depthRange}`, { permanent: false, direction: 'center' });
              }
            });
            
            // Создаем группу слоев для изолиний (линии)
            const contoursCollection = {
              type: 'FeatureCollection',
              features: contours
            };
            const contoursLayer = L.geoJSON(contoursCollection, {
              style: (feature) => ({
                color: feature.properties.stroke || '#333',
                weight: feature.properties.strokeWidth || 1,
                opacity: feature.properties.strokeOpacity || 0.8,
                fill: false
              }),
              onEachFeature: (feature, layer) => {
                const depth = feature.properties.depth || 'неизвестно';
                layer.bindTooltip(`${depth} м`, { permanent: false, direction: 'center' });
              }
            });
            
            if (map && map.getContainer()) {
              // Добавляем сначала цветовые зоны, затем изолинии поверх
              isobandsLayer.addTo(map);
              contoursLayer.addTo(map);
              
              console.log(`Изолинии отображены: ${isobands.length} зон, ${contours.length} линий`);
              
              // Сохраняем ссылки на слои
              window.depthsIsobands = isobandsLayer;
              window.depthsContours = contoursLayer;
              
              // Легенда глубин для изолиний
              const legend = L.control({ position: 'bottomright' });
              legend.onAdd = () => {
                const div = L.DomUtil.create('div', 'legend');
                div.style.cssText = 'background: rgba(255, 255, 255, 0.95); padding: 12px; border-radius: 6px; font-size: 11px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); max-width: 200px;';
                
                let legendHtml = '<div style="font-weight: bold; margin-bottom: 8px; font-size: 12px;">Глубина (м):</div>';
                
                // Добавляем примеры цветов для зон глубин
                const depthRanges = [
                  { range: '0-1 м', color: '#FF0000', label: '0-1 м (мелко) 🔴' },
                  { range: '1-2 м', color: '#FF8000', label: '1-2 м 🟠' },
                  { range: '2-3 м', color: '#FFFF00', label: '2-3 м 🟡' },
                  { range: '3-4 м', color: '#CCFF00', label: '3-4 м 🟢' },
                  { range: '4-5 м', color: '#80FF00', label: '4-5 м 🟢' },
                  { range: '5-6 м', color: '#40FF80', label: '5-6 м 🔵' },
                  { range: '6-7.5 м', color: '#00FFCC', label: '6-7.5 м 🔵' },
                  { range: '7.5-9 м', color: '#00CCFF', label: '7.5-9 м 🔵' },
                  { range: '9-10 м', color: '#0080FF', label: '9-10 м 🔵' },
                  { range: '10-12 м', color: '#0066CC', label: '10-12 м 🔵' },
                  { range: '12-15 м', color: '#0040CC', label: '12-15 м 🔵' },
                  { range: '15+ м', color: '#0000CC', label: '15+ м (глубоко) 🔷' }
                ];
                
                legendHtml += '<div style="max-height: 200px; overflow-y: auto; margin-top: 4px;">';
                depthRanges.forEach(({ range, color, label }) => {
                  legendHtml += `<div style="margin: 2px 0; font-size: 10px;">`;
                  legendHtml += `<span style="background:${color}; width:16px; height:12px; display:inline-block; margin-right:6px; border:1px solid #333; border-radius:2px; vertical-align:middle;"></span>`;
                  legendHtml += `<span style="vertical-align:middle;">${label}</span>`;
                  legendHtml += `</div>`;
                });
                legendHtml += '</div>';
                
                legendHtml += '<div style="margin-top: 8px; font-size: 9px; color: #888; font-style: italic; border-top: 1px solid #ddd; padding-top: 6px;">Изолинии (изобаты) глубин</div>';
                
                div.innerHTML = legendHtml;
                return div;
              };
              
              if (map && map.getContainer()) {
                legend.addTo(map);
              }
            }
          } catch (addError) {
            console.error('Ошибка при добавлении изолиний:', addError);
          }
        }, 50);
        
        // Загружаем исходные точки для heatmap, если включено
        if (USE_HEATMAP && depthsFileUrl) {
          console.log('Загрузка исходных точек для heatmap...');
          fetch(depthsFileUrl)
            .then(res => {
              if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
              return res.text().then(text => {
                const trimmedText = text.trim();
                if (trimmedText.startsWith('<!DOCTYPE') || trimmedText.startsWith('<html') || trimmedText.startsWith('<HTML')) {
                  throw new Error('Получен HTML вместо JSON');
                }
                return JSON.parse(text);
              });
            })
            .then(pointsData => {
              console.log(`Загружено ${pointsData.features.length} точек для heatmap`);
              createHeatmapFromPoints(pointsData, map);
            })
            .catch(err => {
              console.warn('Не удалось загрузить точки для heatmap:', err);
            });
        }
        
        return; // Выходим, так как изолинии уже загружены
      }
      
      // Если не используются готовые изолинии, создаем их на лету (старый код)
      console.log(`Загружено ${data.features.length} точек глубин`);
      
      // Подготавливаем данные для создания изолиний
        // Фильтруем и ограничиваем количество точек для производительности
        const maxPoints = 50000; // Меньше точек для изолиний, так как они требуют больше вычислений
        const filteredFeatures = [];
        const sampleRate = Math.max(1, Math.floor(data.features.length / maxPoints));
        
        // Функция для интерполяции значения на сетке (IDW - Inverse Distance Weighting)
        function interpolateValue(gridX, gridY, points, power = 2) {
          let sumWeight = 0;
          let sumValue = 0;
          let closestDistance = Infinity;
          let closestValue = 0;
          
          for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const [lon, lat] = point.geometry.coordinates;
            const depth = point.properties.depth;
            
            const dx = gridX - lon;
            const dy = gridY - lat;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Сохраняем ближайшую точку на случай, если все точки далеко
            if (distance < closestDistance) {
              closestDistance = distance;
              closestValue = depth;
            }
            
            if (distance < 0.0001) {
              // Если точка очень близко, возвращаем её значение сразу
              return depth;
            }
            
            const weight = 1 / Math.pow(distance, power);
            sumWeight += weight;
            sumValue += weight * depth;
          }
          
          // Если все точки далеко, используем значение ближайшей точки
          if (sumWeight === 0 || closestDistance > 0.01) {
            return closestValue;
          }
          
          return sumValue / sumWeight;
        }
        
        // Функция для создания полигонов цветовых зон
        function createDepthZones(grid, contourLevels, depthColors) {
          const zones = [];
          const rows = grid.length;
          const cols = grid[0].length;
          
          // Создаем полигоны для каждой зоны между изолиниями
          for (let levelIndex = 0; levelIndex < contourLevels.length - 1; levelIndex++) {
            const lower = contourLevels[levelIndex];
            const upper = contourLevels[levelIndex + 1];
            const color = depthColors[lower];
            
            // Находим все ячейки сетки, которые попадают в этот диапазон
            const zoneCells = [];
            for (let i = 0; i < rows - 1; i++) {
              for (let j = 0; j < cols - 1; j++) {
                const value = grid[i][j];
                if (value >= lower && value < upper) {
                  zoneCells.push({ row: i, col: j, value: value });
                }
              }
            }
            
            // Группируем соседние ячейки в полигоны
            if (zoneCells.length > 0) {
              // Создаем простые квадратные полигоны для каждой ячейки
              zoneCells.forEach(cell => {
                // Получаем координаты углов ячейки из сетки
                // Это упрощенный подход - в реальности нужно использовать координаты сетки
                const polygon = {
                  type: 'Feature',
                  geometry: {
                    type: 'Polygon',
                    coordinates: [[
                      [cell.col * 0.001, cell.row * 0.001],
                      [(cell.col + 1) * 0.001, cell.row * 0.001],
                      [(cell.col + 1) * 0.001, (cell.row + 1) * 0.001],
                      [cell.col * 0.001, (cell.row + 1) * 0.001],
                      [cell.col * 0.001, cell.row * 0.001]
                    ]]
                  },
                  properties: {
                    depthRange: `${lower}-${upper}м`,
                    fill: color,
                    fillOpacity: 0.6,
                    stroke: color,
                    strokeWidth: 0.5
                  }
                };
                zones.push(polygon);
              });
            }
          }
          
          return zones;
        }
        
        // Функция для создания изолиний (упрощенный алгоритм)
        function createContours(grid, level, bbox, cellSize) {
          const contours = [];
          const rows = grid.length;
          const cols = grid[0].length;
          
          // Простой алгоритм построения изолиний на основе сетки
          // Используем алгоритм marching squares для построения контуров
          for (let i = 0; i < rows - 1; i++) {
            for (let j = 0; j < cols - 1; j++) {
              const corners = [
                grid[i][j],
                grid[i][j + 1],
                grid[i + 1][j + 1],
                grid[i + 1][j]
              ];
              
              // Проверяем, пересекает ли изолиния этот квадрат
              const above = corners.map(v => v >= level);
              const below = corners.map(v => v < level);
              
              if (above.some(v => v) && below.some(v => v)) {
                // Изолиния пересекает этот квадрат
                // Создаем простой сегмент линии
                const lon = bbox[0] + j * cellSize;
                const lat = bbox[1] + i * cellSize;
                
                const contour = {
                  type: 'Feature',
                  geometry: {
                    type: 'LineString',
                    coordinates: [
                      [lon, lat],
                      [lon + cellSize, lat],
                      [lon + cellSize, lat + cellSize],
                      [lon, lat + cellSize],
                      [lon, lat]
                    ]
                  },
                  properties: {
                    depth: level,
                    stroke: '#333',
                    strokeWidth: (level % 2.5 === 0 || level === 0) ? 2 : 1,
                    strokeOpacity: 0.8
                  }
                };
                contours.push(contour);
              }
            }
          }
          
          return contours;
        }
        
        // Проверяем, что карта имеет контейнер
        if (!map || !map.getContainer()) {
          console.error('Карта не готова для добавления элементов');
          return;
        }
        
        // Показываем индикатор загрузки - добавляем напрямую в DOM карты
        let loadingDiv = null;
        try {
          const mapContainer = map.getContainer();
          if (mapContainer) {
            loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading-message';
            loadingDiv.style.cssText = 'position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 1000; background: rgba(0, 0, 0, 0.7); color: white; padding: 10px; border-radius: 5px; font-size: 12px; text-align: center; pointer-events: none;';
            loadingDiv.innerHTML = '⏳ Обработка данных для изолиний...';
            mapContainer.appendChild(loadingDiv);
          }
        } catch (addError) {
          console.warn('Не удалось добавить индикатор загрузки:', addError);
        }
      
        // Обрабатываем данные батчами для неблокирующей обработки
        let processedCount = 0;
        const batchSize = 5000;
        const totalFeatures = Math.min(data.features.length, maxPoints * sampleRate);
        
        function processBatch() {
          const end = Math.min(processedCount + batchSize, totalFeatures);
          
          for (let i = processedCount; i < end; i++) {
            // Применяем сэмплирование
            if (i % sampleRate !== 0) continue;
            
            const feature = data.features[i];
        const [lon, lat] = feature.geometry.coordinates;
        const depth = feature.properties.depth;

            if (typeof depth !== 'number' || isNaN(depth)) continue;
            if (typeof lat !== 'number' || typeof lon !== 'number') continue;
            
            // Ограничиваем глубину до 15 метров и округляем
            const clampedDepth = Math.min(Math.max(depth, 0), 15);
            
            // Добавляем точку в формате для Turf.js
            filteredFeatures.push({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [lon, lat]
              },
              properties: {
                depth: clampedDepth
              }
            });
          }
          
          processedCount = end;
          
          // Обновляем индикатор
          const loadingElement = document.querySelector('.loading-message');
          if (loadingElement) {
            loadingElement.innerHTML = `⏳ Обработка данных... ${Math.round((processedCount / totalFeatures) * 100)}%`;
          }
          
          if (processedCount < totalFeatures) {
            // Используем requestAnimationFrame для неблокирующей обработки
            requestAnimationFrame(processBatch);
          } else {
            // Все данные обработаны, создаем изолинии
            console.log(`Обработано ${filteredFeatures.length} точек для изолиний`);
            
            // Обновляем индикатор
            if (loadingElement) {
              loadingElement.innerHTML = '⏳ Создание изолиний...';
            }
            
            // Используем setTimeout для неблокирующей обработки
            setTimeout(() => {
              try {
                // Определяем границы области данных
                let minLon = Infinity, maxLon = -Infinity;
                let minLat = Infinity, maxLat = -Infinity;
                
                filteredFeatures.forEach(feature => {
                  const [lon, lat] = feature.geometry.coordinates;
                  minLon = Math.min(minLon, lon);
                  maxLon = Math.max(maxLon, lon);
                  minLat = Math.min(minLat, lat);
                  maxLat = Math.max(maxLat, lat);
                });
                
                const cellSize = 0.001; // Размер ячейки сетки в градусах (~100м)
                const gridCols = Math.ceil((maxLon - minLon) / cellSize) + 1;
                const gridRows = Math.ceil((maxLat - minLat) / cellSize) + 1;
                
                // Определяем уровни изолиний (изобаты) в метрах
                const contourLevels = [0, 1, 2, 3, 4, 5, 6, 7.5, 9, 10, 12, 15];
                
                // Цвета для зон между изолиниями (от мелкого к глубокому)
                const depthColors = {
                  0: '#FF0000',      // 0-1м - красный (мелко)
                  1: '#FF8000',      // 1-2м - оранжевый
                  2: '#FFFF00',      // 2-3м - желтый
                  3: '#CCFF00',      // 3-4м - желто-зеленый
                  4: '#80FF00',      // 4-5м - зеленый
                  5: '#40FF80',      // 5-6м - зелено-голубой
                  6: '#00FFCC',      // 6-7.5м - голубой
                  7.5: '#00CCFF',    // 7.5-9м - светло-синий
                  9: '#0080FF',      // 9-10м - синий
                  10: '#0066CC',     // 10-12м - темно-синий
                  12: '#0040CC',     // 12-15м - очень темно-синий
                  15: '#0000CC'      // 15м+ - самый темный синий
                };
                
                // Обновляем индикатор
                if (loadingElement) {
                  loadingElement.innerHTML = '⏳ Создание сетки и интерполяция...';
                }
                
                // Создаем регулярную сетку и интерполируем значения
                const grid = [];
                for (let i = 0; i < gridRows; i++) {
                  grid[i] = [];
                  for (let j = 0; j < gridCols; j++) {
                    const lon = minLon + j * cellSize;
                    const lat = minLat + i * cellSize;
                    const depth = interpolateValue(lon, lat, filteredFeatures, 2);
                    grid[i][j] = depth;
                  }
                  
                  // Обновляем прогресс
                  if (i % 10 === 0 && loadingElement) {
                    loadingElement.innerHTML = `⏳ Создание сетки... ${Math.round((i / gridRows) * 50)}%`;
                  }
                }
                
                // Обновляем индикатор
                if (loadingElement) {
                  loadingElement.innerHTML = '⏳ Создание цветовых зон...';
                }
                
                // Создаем цветовые зоны (изобанды)
                const isobands = [];
                for (let levelIndex = 0; levelIndex < contourLevels.length - 1; levelIndex++) {
                  const lower = contourLevels[levelIndex];
                  const upper = contourLevels[levelIndex + 1];
                  const color = depthColors[lower];
                  
                  // Находим все ячейки сетки в этом диапазоне и создаем полигоны
                  for (let i = 0; i < gridRows - 1; i++) {
                    for (let j = 0; j < gridCols - 1; j++) {
                      const depth = grid[i][j];
                      if (depth >= lower && depth < upper) {
                        const lon = minLon + j * cellSize;
                        const lat = minLat + i * cellSize;
                        
                        const polygon = {
                          type: 'Feature',
                          geometry: {
                            type: 'Polygon',
                            coordinates: [[
                              [lon, lat],
                              [lon + cellSize, lat],
                              [lon + cellSize, lat + cellSize],
                              [lon, lat + cellSize],
                              [lon, lat]
                            ]]
                          },
                          properties: {
                            depthRange: `${lower}-${upper}м`,
                            fill: color,
                            fillOpacity: 0.6,
                            stroke: color,
                            strokeWidth: 0.5,
                            strokeOpacity: 0.5
                          }
                        };
                        isobands.push(polygon);
                      }
                    }
                  }
                }
                
                // Обновляем индикатор
                if (loadingElement) {
                  loadingElement.innerHTML = '⏳ Создание изолиний...';
                }
                
                // Создаем изолинии (линии одинаковой глубины)
                const contours = [];
                contourLevels.forEach(level => {
                  // Создаем линии для каждого уровня
                  for (let i = 0; i < gridRows - 1; i++) {
                    for (let j = 0; j < gridCols - 1; j++) {
                      const corners = [
                        grid[i][j],
                        grid[i][j + 1],
                        grid[i + 1][j + 1],
                        grid[i + 1][j]
                      ];
                      
                      // Проверяем, пересекает ли изолиния этот квадрат
                      const hasAbove = corners.some(v => v >= level);
                      const hasBelow = corners.some(v => v < level);
                      
                      if (hasAbove && hasBelow) {
                        // Упрощенный алгоритм: создаем линию по границе квадрата
                        const lon = minLon + j * cellSize;
                        const lat = minLat + i * cellSize;
                        
                        // Определяем, какие стороны пересекает изолиния
                        const lineCoords = [];
                        
                        // Верхняя сторона
                        if ((corners[0] >= level) !== (corners[1] >= level)) {
                          const t = (level - corners[0]) / (corners[1] - corners[0]);
                          lineCoords.push([lon + t * cellSize, lat]);
                        }
                        
                        // Правая сторона
                        if ((corners[1] >= level) !== (corners[2] >= level)) {
                          const t = (level - corners[1]) / (corners[2] - corners[1]);
                          lineCoords.push([lon + cellSize, lat + t * cellSize]);
                        }
                        
                        // Нижняя сторона
                        if ((corners[2] >= level) !== (corners[3] >= level)) {
                          const t = (level - corners[2]) / (corners[3] - corners[2]);
                          lineCoords.push([lon + (1 - t) * cellSize, lat + cellSize]);
                        }
                        
                        // Левая сторона
                        if ((corners[3] >= level) !== (corners[0] >= level)) {
                          const t = (level - corners[3]) / (corners[0] - corners[3]);
                          lineCoords.push([lon, lat + (1 - t) * cellSize]);
                        }
                        
                        // Если есть точки пересечения, создаем линию
                        if (lineCoords.length >= 2) {
                          // Замыкаем линию, если нужно
                          if (lineCoords.length === 2) {
                            lineCoords.push(lineCoords[0]);
                          }
                          
                          const contour = {
                            type: 'Feature',
                            geometry: {
                              type: 'LineString',
                              coordinates: lineCoords
                            },
                            properties: {
                              depth: level,
                              stroke: '#333',
                              strokeWidth: (level % 2.5 === 0 || level === 0) ? 2 : 1,
                              strokeOpacity: 0.8
                            }
                          };
                          contours.push(contour);
                        }
                      }
                    }
                  }
                });
                
                console.log(`Создано ${isobands.length} цветовых зон и ${contours.length} изолиний`);
                
                // Удаляем индикатор загрузки
                try {
                  if (loadingDiv && loadingDiv.parentNode) {
                    loadingDiv.parentNode.removeChild(loadingDiv);
                  }
                } catch (e) {
                  // Игнорируем ошибку удаления
                }
                
                // Проверяем, что карта инициализирована и имеет контейнер
                if (!map || !map.getContainer()) {
                  console.error('Карта не инициализирована, невозможно добавить изолинии');
                  return;
                }
                
                // Используем setTimeout для гарантии готовности карты
                setTimeout(() => {
                  try {
                    // Создаем группу слоев для изобанд (цветовые зоны)
                    const isobandsCollection = {
                      type: 'FeatureCollection',
                      features: isobands
                    };
                    const isobandsLayer = L.geoJSON(isobandsCollection, {
                      style: (feature) => ({
                        fillColor: feature.properties.fill || '#888',
                        fillOpacity: feature.properties.fillOpacity || 0.6,
                        color: feature.properties.stroke || '#333',
                        weight: feature.properties.strokeWidth || 0.5,
                        opacity: feature.properties.strokeOpacity || 0.5
                      }),
                      onEachFeature: (feature, layer) => {
                        const depthRange = feature.properties.depthRange || 'неизвестно';
                        layer.bindTooltip(`${depthRange}`, { permanent: false, direction: 'center' });
                      }
                    });
                    
                    // Создаем группу слоев для изолиний (линии)
                    const contoursCollection = {
                      type: 'FeatureCollection',
                      features: contours
                    };
                    const contoursLayer = L.geoJSON(contoursCollection, {
                      style: (feature) => ({
                        color: feature.properties.stroke || '#333',
                        weight: feature.properties.strokeWidth || 1,
                        opacity: feature.properties.strokeOpacity || 0.8,
                        fill: false
                      }),
                      onEachFeature: (feature, layer) => {
                        const depth = feature.properties.depth || 'неизвестно';
                        layer.bindTooltip(`${depth} м`, { permanent: false, direction: 'center' });
                      }
                    });
                    
                    if (map && map.getContainer()) {
                      // Добавляем сначала цветовые зоны, затем изолинии поверх
                      isobandsLayer.addTo(map);
                      contoursLayer.addTo(map);
      
                      console.log(`Изолинии созданы: ${isobands.length} зон, ${contours.length} линий`);
                      
                      // Сохраняем ссылки на слои
                      window.depthsIsobands = isobandsLayer;
                      window.depthsContours = contoursLayer;
                      
                      // Создаем heatmap из исходных точек, если включено
                      if (USE_HEATMAP && data) {
                        setTimeout(() => {
                          createHeatmapFromPoints(data, map);
                        }, 100);
                      }

                      // Легенда глубин для изолиний
      const legend = L.control({ position: 'bottomright' });
      legend.onAdd = () => {
        const div = L.DomUtil.create('div', 'legend');
        div.style.cssText = 'background: rgba(255, 255, 255, 0.95); padding: 12px; border-radius: 6px; font-size: 11px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); max-width: 200px;';
        
                        let legendHtml = '<div style="font-weight: bold; margin-bottom: 8px; font-size: 12px;">Глубина (м):</div>';
                        
                        // Добавляем примеры цветов для зон глубин
                        const depthRanges = [
                          { range: '0-1 м', color: '#FF0000', label: '0-1 м (мелко) 🔴' },
                          { range: '1-2 м', color: '#FF8000', label: '1-2 м 🟠' },
                          { range: '2-3 м', color: '#FFFF00', label: '2-3 м 🟡' },
                          { range: '3-4 м', color: '#CCFF00', label: '3-4 м 🟢' },
                          { range: '4-5 м', color: '#80FF00', label: '4-5 м 🟢' },
                          { range: '5-6 м', color: '#40FF80', label: '5-6 м 🔵' },
                          { range: '6-7.5 м', color: '#00FFCC', label: '6-7.5 м 🔵' },
                          { range: '7.5-9 м', color: '#00CCFF', label: '7.5-9 м 🔵' },
                          { range: '9-10 м', color: '#0080FF', label: '9-10 м 🔵' },
                          { range: '10-12 м', color: '#0066CC', label: '10-12 м 🔵' },
                          { range: '12-15 м', color: '#0040CC', label: '12-15 м 🔵' },
                          { range: '15+ м', color: '#0000CC', label: '15+ м (глубоко) 🔷' }
                        ];
                        
                        legendHtml += '<div style="max-height: 200px; overflow-y: auto; margin-top: 4px;">';
                        depthRanges.forEach(({ range, color, label }) => {
                          legendHtml += `<div style="margin: 2px 0; font-size: 10px;">`;
                          legendHtml += `<span style="background:${color}; width:16px; height:12px; display:inline-block; margin-right:6px; border:1px solid #333; border-radius:2px; vertical-align:middle;"></span>`;
                          legendHtml += `<span style="vertical-align:middle;">${label}</span>`;
                          legendHtml += `</div>`;
                        });
                        legendHtml += '</div>';
                        
                        legendHtml += '<div style="margin-top: 8px; font-size: 9px; color: #888; font-style: italic; border-top: 1px solid #ddd; padding-top: 6px;">Изолинии (изобаты) глубин</div>';
        
                        div.innerHTML = legendHtml;
        return div;
      };
                      
                      if (map && map.getContainer()) {
      legend.addTo(map);
                      }
                    }
                  } catch (addError) {
                    console.error('Ошибка при добавлении изолиний или легенды:', addError);
                  }
                }, 50);
              } catch (processingError) {
                console.error('Ошибка при создании изолиний:', processingError);
                // Удаляем индикатор загрузки при ошибке
                try {
                  if (loadingDiv && loadingDiv.parentNode) {
                    loadingDiv.parentNode.removeChild(loadingDiv);
                  }
                } catch (e) {
                  // Игнорируем ошибку удаления
                }
              }
            }, 100);
          }
        }
        
        // Начинаем обработку
        processBatch();
    })
    .catch(err => {
      console.error('Ошибка загрузки глубин:', err);
      console.error('Детали ошибки:', err.message, err.stack);
      
        // Проверяем, что карта инициализирована перед добавлением элементов
        if (!map || !map.getContainer()) {
          console.error('Карта не инициализирована, невозможно показать ошибку');
          return;
        }
      
        // Показываем пользователю сообщение об ошибке - добавляем напрямую в DOM
        setTimeout(() => {
          try {
            if (map && map.getContainer()) {
              const mapContainer = map.getContainer();
              const errorDiv = document.createElement('div');
              errorDiv.className = 'error-message';
              errorDiv.style.cssText = 'position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 1000; background: rgba(255, 0, 0, 0.8); color: white; padding: 10px; border-radius: 5px; font-size: 12px; text-align: center; pointer-events: none;';
              errorDiv.innerHTML = `⚠️ Ошибка загрузки данных глубин: ${err.message}`;
              mapContainer.appendChild(errorDiv);
              
              // Удаляем сообщение через 10 секунд
              setTimeout(() => {
                if (errorDiv.parentNode) {
                  errorDiv.parentNode.removeChild(errorDiv);
                }
              }, 10000);
            }
          } catch (addError) {
            console.error('Ошибка при добавлении сообщения об ошибке на карту:', addError);
          }
        }, 100);
      
      // Пробуем загрузить резервный файл
      console.log('Попытка загрузить резервный файл desna_depths.geojson...');
      fetch('desna_depths.geojson?v=1')
        .then(res => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.text().then(text => JSON.parse(text));
        })
        .then(data => {
          console.log(`Загружен резервный файл: ${data.features.length} точек`);
            
            // Используем ту же логику создания изолиний, что и для основного файла
            if (typeof turf === 'undefined') {
              console.error('Turf.js не загружен для резервного файла');
              return;
            }
            
            // Фильтруем данные
          const maxPoints = 50000;
            const filteredFeatures = [];
            const sampleRate = Math.max(1, Math.floor(data.features.length / maxPoints));
          
            data.features.forEach((feature, i) => {
              if (i % sampleRate !== 0) return;
            
            const [lon, lat] = feature.geometry.coordinates;
            const depth = feature.properties.depth;

            if (typeof depth !== 'number' || isNaN(depth)) return;
            if (typeof lat !== 'number' || typeof lon !== 'number') return;

              const clampedDepth = Math.min(Math.max(depth, 0), 15);
              
              filteredFeatures.push({
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [lon, lat]
                },
                properties: {
                  depth: clampedDepth
                }
              });
            });
            
            if (!map || !map.getContainer()) {
              console.error('Карта не инициализирована, невозможно добавить изолинии');
              return;
            }
            
            // Используем setTimeout для гарантии готовности карты
            setTimeout(() => {
              try {
                // Определяем границы области данных
                let minLon = Infinity, maxLon = -Infinity;
                let minLat = Infinity, maxLat = -Infinity;
                
                filteredFeatures.forEach(feature => {
                  const [lon, lat] = feature.geometry.coordinates;
                  minLon = Math.min(minLon, lon);
                  maxLon = Math.max(maxLon, lon);
                  minLat = Math.min(minLat, lat);
                  maxLat = Math.max(maxLat, lat);
                });
                
                const cellSize = 0.001;
                const gridCols = Math.ceil((maxLon - minLon) / cellSize) + 1;
                const gridRows = Math.ceil((maxLat - minLat) / cellSize) + 1;
                const contourLevels = [0, 1, 2, 3, 4, 5, 6, 7.5, 9, 10, 12, 15];
                
                const depthColors = {
                  0: '#FF0000', 1: '#FF8000', 2: '#FFFF00', 3: '#CCFF00', 4: '#80FF00',
                  5: '#40FF80', 6: '#00FFCC', 7.5: '#00CCFF', 9: '#0080FF',
                  10: '#0066CC', 12: '#0040CC', 15: '#0000CC'
                };
                
                // Создаем сетку и интерполируем значения
                const grid = [];
                for (let i = 0; i < gridRows; i++) {
                  grid[i] = [];
                  for (let j = 0; j < gridCols; j++) {
                    const lon = minLon + j * cellSize;
                    const lat = minLat + i * cellSize;
                    const depth = interpolateValue(lon, lat, filteredFeatures, 2);
                    grid[i][j] = depth;
                  }
                }
                
                // Создаем цветовые зоны
                const isobands = [];
                for (let levelIndex = 0; levelIndex < contourLevels.length - 1; levelIndex++) {
                  const lower = contourLevels[levelIndex];
                  const upper = contourLevels[levelIndex + 1];
                  const color = depthColors[lower];
                  
                  for (let i = 0; i < gridRows - 1; i++) {
                    for (let j = 0; j < gridCols - 1; j++) {
                      const depth = grid[i][j];
                      if (depth >= lower && depth < upper) {
                        const lon = minLon + j * cellSize;
                        const lat = minLat + i * cellSize;
                        
                        isobands.push({
                          type: 'Feature',
                          geometry: {
                            type: 'Polygon',
                            coordinates: [[
                              [lon, lat],
                              [lon + cellSize, lat],
                              [lon + cellSize, lat + cellSize],
                              [lon, lat + cellSize],
                              [lon, lat]
                            ]]
                          },
                          properties: {
                            depthRange: `${lower}-${upper}м`,
                            fill: color,
                            fillOpacity: 0.6,
                            stroke: color,
                            strokeWidth: 0.5,
                            strokeOpacity: 0.5
                          }
                        });
                      }
                    }
                  }
                }
                
                // Создаем изолинии
                const contours = [];
                contourLevels.forEach(level => {
                  for (let i = 0; i < gridRows - 1; i++) {
                    for (let j = 0; j < gridCols - 1; j++) {
                      const corners = [
                        grid[i][j],
                        grid[i][j + 1],
                        grid[i + 1][j + 1],
                        grid[i + 1][j]
                      ];
                      
                      const hasAbove = corners.some(v => v >= level);
                      const hasBelow = corners.some(v => v < level);
                      
                      if (hasAbove && hasBelow) {
                        const lon = minLon + j * cellSize;
                        const lat = minLat + i * cellSize;
                        const lineCoords = [];
                        
                        if ((corners[0] >= level) !== (corners[1] >= level)) {
                          const t = (level - corners[0]) / (corners[1] - corners[0]);
                          lineCoords.push([lon + t * cellSize, lat]);
                        }
                        if ((corners[1] >= level) !== (corners[2] >= level)) {
                          const t = (level - corners[1]) / (corners[2] - corners[1]);
                          lineCoords.push([lon + cellSize, lat + t * cellSize]);
                        }
                        if ((corners[2] >= level) !== (corners[3] >= level)) {
                          const t = (level - corners[2]) / (corners[3] - corners[2]);
                          lineCoords.push([lon + (1 - t) * cellSize, lat + cellSize]);
                        }
                        if ((corners[3] >= level) !== (corners[0] >= level)) {
                          const t = (level - corners[3]) / (corners[0] - corners[3]);
                          lineCoords.push([lon, lat + (1 - t) * cellSize]);
                        }
                        
                        if (lineCoords.length >= 2) {
                          if (lineCoords.length === 2) {
                            lineCoords.push(lineCoords[0]);
                          }
                          
                          contours.push({
                            type: 'Feature',
                            geometry: {
                              type: 'LineString',
                              coordinates: lineCoords
                            },
                            properties: {
                              depth: level,
                              stroke: '#333',
                              strokeWidth: (level % 2.5 === 0 || level === 0) ? 2 : 1,
                              strokeOpacity: 0.8
                            }
                          });
                        }
                      }
                    }
                  }
                });
                
                if (map && map.getContainer()) {
                  const isobandsCollection = {
                    type: 'FeatureCollection',
                    features: isobands
                  };
                  const isobandsLayer = L.geoJSON(isobandsCollection, {
                    style: (feature) => ({
                      fillColor: feature.properties.fill || '#888',
                      fillOpacity: feature.properties.fillOpacity || 0.6,
                      color: feature.properties.stroke || '#333',
                      weight: feature.properties.strokeWidth || 0.5,
                      opacity: feature.properties.strokeOpacity || 0.5
                    })
                  });
                  
                  const contoursCollection = {
                    type: 'FeatureCollection',
                    features: contours
                  };
                  const contoursLayer = L.geoJSON(contoursCollection, {
                    style: (feature) => ({
                      color: feature.properties.stroke || '#333',
                      weight: feature.properties.strokeWidth || 1,
                      opacity: feature.properties.strokeOpacity || 0.8,
                      fill: false
                    })
                  });
                  
                  isobandsLayer.addTo(map);
                  contoursLayer.addTo(map);
                  
                  window.depthsIsobands = isobandsLayer;
                  window.depthsContours = contoursLayer;
                  
                  // Создаем heatmap из исходных точек, если включено
                  if (USE_HEATMAP && data) {
                    setTimeout(() => {
                      createHeatmapFromPoints(data, map);
                    }, 100);
                  }
          
                  console.log(`Отображено ${filteredFeatures.length} точек из резервного файла в изолиниях`);
                }
              } catch (addError) {
                console.error('Ошибка при добавлении изолиний из резервного файла:', addError);
              }
            }, 50);
        })
        .catch(fallbackErr => {
          console.error('Ошибка загрузки резервного файла:', fallbackErr);
          });
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
