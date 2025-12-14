document.addEventListener("DOMContentLoaded", () => {
  if (!window.Telegram?.WebApp) {
    console.error("Telegram WebApp не загружен");
    return;
  }

  Telegram.WebApp.ready();
  Telegram.WebApp.expand();

  // Конфигурация: URL файла с глубинами
  // Вариант 1: Использовать Google Drive (укажите ID файла или прямую ссылку)
  // Получите ID из ссылки вида: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  // const GOOGLE_DRIVE_FILE_ID = ''; // Вставьте сюда ID файла из Google Drive
  // Или используйте прямую ссылку (если уже преобразовали):
  // const GOOGLE_DRIVE_DIRECT_URL = ''; // Или вставьте прямую ссылку вида: https://drive.google.com/uc?export=download&id=FILE_ID
  
  // ВАЖНО: Google Drive блокирует CORS запросы. Используйте один из вариантов:
  // 1. CORS Proxy (временное решение) - раскомментируйте следующую строку:
  // const USE_CORS_PROXY = true;
  // const CORS_PROXY_URL = 'https://corsproxy.io/?'; // или другой прокси
  const USE_CORS_PROXY = false; // Не требуется для GitHub Releases
  
  // 2. GitHub Releases (рекомендуется) - загрузите файл на GitHub Releases и укажите URL:
  // const GITHUB_RELEASES_URL = 'https://github.com/USERNAME/REPO/releases/download/v1.0/all_depths.geojson';
  // ВАЖНО: Раскомментируйте следующую строку после загрузки файла на GitHub Releases:
  // const GITHUB_RELEASES_URL = 'https://github.com/IvanGlytov/smart-angler/releases/download/v1.0/all_depths.geojson';
  const GITHUB_RELEASES_URL = 'https://github.com/IvanGlytov/smart-angler/releases/download/v1.0/all_depths.geojson'; // URL файла на GitHub Releases (загрузите файл на Releases и вставьте ссылку)
  
  // 3. Прямой URL (если файл на другом хостинге без CORS ограничений)
  // Файл уже доступен на GitHub Pages - используйте его:
  // const DIRECT_FILE_URL = 'https://ivanglytov.github.io/smart-angler.github.io/merged_depths.geojson'; // Прямой URL к файлу
  
  // Вариант 4: Использовать локальный файл (если файл на GitHub Pages)
  const USE_LOCAL_FILE = !GOOGLE_DRIVE_FILE_ID && !GOOGLE_DRIVE_DIRECT_URL && !GITHUB_RELEASES_URL && !DIRECT_FILE_URL;
  const LOCAL_FILE_URL = 'merged_depths.geojson?v=3';

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
    
    // Для больших файлов используем формат с confirm=t, чтобы обойти предупреждение
    // Альтернативный формат: https://drive.google.com/uc?id=FILE_ID&export=download&confirm=t
    return `https://drive.google.com/uc?id=${fileId}&export=download&confirm=t`;
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
      const proxyUrl = 'https://corsproxy.io/?';
      depthsFileUrl = proxyUrl + encodeURIComponent(directDriveUrl);
    } else {
      // Без прокси не будет работать из-за CORS
      console.warn('⚠️ Google Drive блокирует CORS. Используйте CORS proxy или загрузите файл на GitHub Releases.');
      depthsFileUrl = directDriveUrl; // Попробуем, но скорее всего не сработает
    }
  } else {
    depthsFileUrl = LOCAL_FILE_URL;
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
          console.error('Получен HTML вместо JSON. Возможные причины:');
          console.error('1. Файл слишком большой и Google Drive требует подтверждения');
          console.error('2. Файл не публичный или ссылка неправильная');
          console.error('3. Нужно использовать альтернативный формат ссылки');
          console.error('Первые 500 символов ответа:', text.substring(0, 500));
          throw new Error('Google Drive вернул HTML страницу вместо файла. Проверьте, что файл публичный и используйте правильный формат ссылки.');
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
      console.error('Детали ошибки:', err.message, err.stack);
      
      // Показываем пользователю сообщение об ошибке
      const errorDiv = L.control({ position: 'topcenter' });
      errorDiv.onAdd = () => {
        const div = L.DomUtil.create('div', 'error-message');
        div.style.cssText = 'background: rgba(255, 0, 0, 0.8); color: white; padding: 10px; border-radius: 5px; font-size: 12px; text-align: center;';
        div.innerHTML = `⚠️ Ошибка загрузки данных глубин: ${err.message}`;
        return div;
      };
      errorDiv.addTo(map);
      
      // Пробуем загрузить резервный файл
      console.log('Попытка загрузить резервный файл desna_depths.geojson...');
      fetch('desna_depths.geojson?v=1')
        .then(res => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.text().then(text => JSON.parse(text));
        })
        .then(data => {
          console.log(`Загружен резервный файл: ${data.features.length} точек`);
          // Повторяем логику отображения для резервного файла
          let pointCount = 0;
          const maxPoints = 50000;
          
          data.features.forEach((feature) => {
            if (pointCount >= maxPoints) return;
            
            const [lon, lat] = feature.geometry.coordinates;
            const depth = feature.properties.depth;

            if (typeof depth !== 'number' || isNaN(depth)) return;
            if (typeof lat !== 'number' || typeof lon !== 'number') return;

            const color = getDepthColor(depth);
            
            L.circleMarker([lat, lon], {
              radius: 3,
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
          
          console.log(`Отображено ${pointCount} точек из резервного файла`);
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
