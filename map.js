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
  
  // Локальный файл (резервный вариант, если Yandex Cloud недоступен)
  const LOCAL_FILE_URL = 'all_depths_small.geojson';
  
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
  console.log('Загрузка файла глубин с URL:', depthsFileUrl);
  
  // Ждем, пока карта полностью инициализируется перед загрузкой данных
  map.whenReady(() => {
    fetch(depthsFileUrl)
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        // Проверяем Content-Type
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.warn('Предупреждение: Content-Type не JSON, но продолжаем...');
        }
        // Получаем текст и парсим вручную для лучшей обработки ошибок
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
        console.log(`Загружено ${data.features.length} точек глубин`);
        
        // Проверяем, что карта инициализирована
        if (!map) {
          console.error('Карта не инициализирована');
          return;
        }
        // Подготавливаем данные для heatmap
        // Формат: [lat, lon, intensity] где intensity от 0 до 1
        const heatData = [];
        const maxPoints = 100000; // Можно больше для heatmap, так как он быстрее
        
        // Показываем индикатор загрузки
        const loadingDiv = L.control({ position: 'topcenter' });
        loadingDiv.onAdd = () => {
          const div = L.DomUtil.create('div', 'loading-message');
          div.style.cssText = 'background: rgba(0, 0, 0, 0.7); color: white; padding: 10px; border-radius: 5px; font-size: 12px; text-align: center;';
          div.innerHTML = '⏳ Обработка данных...';
          return div;
        };
        
        try {
          loadingDiv.addTo(map);
        } catch (addError) {
          console.error('Ошибка при добавлении индикатора загрузки:', addError);
          return;
        }
      
        // Обрабатываем данные батчами для неблокирующей обработки
        let processedCount = 0;
        const batchSize = 5000;
        const totalFeatures = Math.min(data.features.length, maxPoints);
        
        function processBatch() {
          const end = Math.min(processedCount + batchSize, totalFeatures);
          
          for (let i = processedCount; i < end; i++) {
            const feature = data.features[i];
            const [lon, lat] = feature.geometry.coordinates;
            const depth = feature.properties.depth;
            
            if (typeof depth !== 'number' || isNaN(depth)) continue;
            if (typeof lat !== 'number' || typeof lon !== 'number') continue;
            
            // Нормализуем глубину от 0 до 1 (0-15 метров)
            // Инвертируем: мелко (0м) = высокая интенсивность, глубоко (15м+) = низкая
            // Это создаст эффект, где красный = мелко, синий = глубоко
            const clampedDepth = Math.min(Math.max(depth, 0), 15);
            const intensity = 1 - (clampedDepth / 15); // Инвертируем для heatmap
            
            heatData.push([lat, lon, intensity]);
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
            // Все данные обработаны, создаем heatmap
            console.log(`Обработано ${heatData.length} точек для heatmap`);
            
            // Удаляем индикатор загрузки
            map.removeControl(loadingDiv);
            
            // Проверяем, что карта инициализирована
            if (!map) {
              console.error('Карта не инициализирована, невозможно добавить heatmap');
              return;
            }
            
            try {
              // Создаем heatmap слой с градиентом, соответствующим глубинам
              // Градиент: красный (мелко) → оранжевый → желтый → зеленый → голубой → синий (глубоко)
              const heatLayer = L.heatLayer(heatData, {
                radius: 10,        // Радиус влияния каждой точки
                blur: 15,          // Размытие для плавности
                maxZoom: 18,        // Максимальный зум
                max: 1.0,           // Максимальная интенсивность
                minOpacity: 0.3,    // Минимальная прозрачность
                gradient: {
                  0.0: 'blue',      // Глубоко (15м+) - синий
                  0.2: '#0080CC',   // 12-15м - синий
                  0.4: '#00FFCC',   // 9-12м - голубой
                  0.5: '#80FF00',   // 7.5-9м - зеленый
                  0.7: '#FFFF00',   // 3.75-7.5м - желтый
                  0.85: '#FF8000',  // 1.5-3.75м - оранжевый
                  1.0: 'red'        // Мелко (0-1.5м) - красный
                }
              });
              
              heatLayer.addTo(map);
              console.log(`Heatmap создан с ${heatData.length} точками`);
              
              // Сохраняем ссылку на heatmap для возможного обновления
              window.depthsHeatmap = heatLayer;
              
              // Легенда глубин для heatmap (добавляем после создания heatmap)
              const legend = L.control({ position: 'bottomright' });
              legend.onAdd = () => {
                const div = L.DomUtil.create('div', 'legend');
                div.style.cssText = 'background: rgba(255, 255, 255, 0.95); padding: 12px; border-radius: 6px; font-size: 11px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); max-width: 200px;';
                
                // Создаем градиентную полосу для легенды (инвертированный для heatmap)
                // В heatmap: красный = мелко, синий = глубоко
                let gradientHtml = '<div style="font-weight: bold; margin-bottom: 8px; font-size: 12px;">Глубина (м):</div>';
                gradientHtml += '<div style="height: 20px; background: linear-gradient(to right, red, #FF8000, #FFFF00, #80FF00, #00FFCC, #0080CC, blue); border: 1px solid #333; border-radius: 3px; margin-bottom: 6px;"></div>';
                gradientHtml += '<div style="display: flex; justify-content: space-between; font-size: 10px; color: #666;">';
                gradientHtml += '<span>0 м (мелко)</span><span>7.5 м</span><span>15+ м (глубоко)</span>';
                gradientHtml += '</div>';
                
                // Добавляем примеры цветов для ключевых глубин
                gradientHtml += '<div style="margin-top: 8px; font-size: 10px;">';
                gradientHtml += '<div><span style="background:red; width:14px; height:10px; display:inline-block; margin-right:4px; border:1px solid #333; border-radius:2px;"></span> 0-2 м (мелко) 🔴</div>';
                gradientHtml += '<div><span style="background:#FFFF00; width:14px; height:10px; display:inline-block; margin-right:4px; border:1px solid #333; border-radius:2px;"></span> 5-7.5 м 🟡</div>';
                gradientHtml += '<div><span style="background:#00FFCC; width:14px; height:10px; display:inline-block; margin-right:4px; border:1px solid #333; border-radius:2px;"></span> 9-12 м 🔵</div>';
                gradientHtml += '<div><span style="background:blue; width:14px; height:10px; display:inline-block; margin-right:4px; border:1px solid #333; border-radius:2px;"></span> >15 м (глубоко) 🔷</div>';
                gradientHtml += '</div>';
                gradientHtml += '<div style="margin-top: 6px; font-size: 9px; color: #888; font-style: italic;">Тепловая карта глубин</div>';
                
                div.innerHTML = gradientHtml;
                return div;
              };
              legend.addTo(map);
            } catch (addError) {
              console.error('Ошибка при добавлении heatmap или легенды:', addError);
            }
          }
        }
        
        // Начинаем обработку
        processBatch();
      })
      .catch(err => {
        console.error('Ошибка загрузки глубин:', err);
        console.error('Детали ошибки:', err.message, err.stack);
        
        // Проверяем, что карта инициализирована перед добавлением элементов
        if (!map) {
          console.error('Карта не инициализирована, невозможно показать ошибку');
          return;
        }
        
        // Показываем пользователю сообщение об ошибке
        const errorDiv = L.control({ position: 'topcenter' });
        errorDiv.onAdd = () => {
          const div = L.DomUtil.create('div', 'error-message');
          div.style.cssText = 'background: rgba(255, 0, 0, 0.8); color: white; padding: 10px; border-radius: 5px; font-size: 12px; text-align: center;';
          div.innerHTML = `⚠️ Ошибка загрузки данных глубин: ${err.message}`;
          return div;
        };
        
        // Добавляем только если карта готова
        try {
          errorDiv.addTo(map);
        } catch (addError) {
          console.error('Ошибка при добавлении сообщения об ошибке на карту:', addError);
        }
        
        // Пробуем загрузить резервный файл
        console.log('Попытка загрузить резервный файл desna_depths.geojson...');
        fetch('desna_depths.geojson?v=1')
          .then(res => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.text().then(text => JSON.parse(text));
          })
          .then(data => {
            console.log(`Загружен резервный файл: ${data.features.length} точек`);
            
            // Подготавливаем данные для heatmap
            const heatData = [];
            const maxPoints = 100000;
            
            data.features.slice(0, maxPoints).forEach((feature) => {
              const [lon, lat] = feature.geometry.coordinates;
              const depth = feature.properties.depth;
              
              if (typeof depth !== 'number' || isNaN(depth)) return;
              if (typeof lat !== 'number' || typeof lon !== 'number') return;
              
              const clampedDepth = Math.min(Math.max(depth, 0), 15);
              const intensity = 1 - (clampedDepth / 15);
              
              heatData.push([lat, lon, intensity]);
            });
            
            // Создаем heatmap из резервного файла
            const heatLayer = L.heatLayer(heatData, {
              radius: 10,
              blur: 15,
              maxZoom: 18,
              max: 1.0,
              minOpacity: 0.3,
              gradient: {
                0.0: 'blue',
                0.2: '#0080CC',
                0.4: '#00FFCC',
                0.5: '#80FF00',
                0.7: '#FFFF00',
                0.85: '#FF8000',
                1.0: 'red'
              }
            });
            
            if (!map) {
              console.error('Карта не инициализирована, невозможно добавить heatmap');
              return;
            }
            
            try {
              heatLayer.addTo(map);
              window.depthsHeatmap = heatLayer;
              console.log(`Отображено ${heatData.length} точек из резервного файла в heatmap`);
              
              // Добавляем легенду для резервного файла
              const legend = L.control({ position: 'bottomright' });
              legend.onAdd = () => {
                const div = L.DomUtil.create('div', 'legend');
                div.style.cssText = 'background: rgba(255, 255, 255, 0.95); padding: 12px; border-radius: 6px; font-size: 11px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); max-width: 200px;';
                
                let gradientHtml = '<div style="font-weight: bold; margin-bottom: 8px; font-size: 12px;">Глубина (м):</div>';
                gradientHtml += '<div style="height: 20px; background: linear-gradient(to right, red, #FF8000, #FFFF00, #80FF00, #00FFCC, #0080CC, blue); border: 1px solid #333; border-radius: 3px; margin-bottom: 6px;"></div>';
                gradientHtml += '<div style="display: flex; justify-content: space-between; font-size: 10px; color: #666;">';
                gradientHtml += '<span>0 м (мелко)</span><span>7.5 м</span><span>15+ м (глубоко)</span>';
                gradientHtml += '</div>';
                gradientHtml += '<div style="margin-top: 8px; font-size: 10px;">';
                gradientHtml += '<div><span style="background:red; width:14px; height:10px; display:inline-block; margin-right:4px; border:1px solid #333; border-radius:2px;"></span> 0-2 м (мелко) 🔴</div>';
                gradientHtml += '<div><span style="background:#FFFF00; width:14px; height:10px; display:inline-block; margin-right:4px; border:1px solid #333; border-radius:2px;"></span> 5-7.5 м 🟡</div>';
                gradientHtml += '<div><span style="background:#00FFCC; width:14px; height:10px; display:inline-block; margin-right:4px; border:1px solid #333; border-radius:2px;"></span> 9-12 м 🔵</div>';
                gradientHtml += '<div><span style="background:blue; width:14px; height:10px; display:inline-block; margin-right:4px; border:1px solid #333; border-radius:2px;"></span> >15 м (глубоко) 🔷</div>';
                gradientHtml += '</div>';
                gradientHtml += '<div style="margin-top: 6px; font-size: 9px; color: #888; font-style: italic;">Тепловая карта глубин</div>';
                
                div.innerHTML = gradientHtml;
                return div;
              };
              legend.addTo(map);
            } catch (addError) {
              console.error('Ошибка при добавлении heatmap или легенды:', addError);
            }
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
