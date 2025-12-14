# Настройка загрузки файла с Google Drive

## Как получить ссылку на файл

1. Загрузите файл `all_depths.geojson` на Google Drive
2. Сделайте файл публичным (правый клик → "Настроить доступ" → "Все, у кого есть ссылка")
3. Скопируйте ссылку на файл

## Варианты использования

### Вариант 1: Использовать ID файла (рекомендуется)

1. Откройте файл в Google Drive
2. Скопируйте ссылку вида: `https://drive.google.com/file/d/1ABC123xyz.../view?usp=sharing`
3. Извлеките ID файла (часть между `/d/` и `/view`)
   - Например, из ссылки `https://drive.google.com/file/d/1ABC123xyz/view` ID будет `1ABC123xyz`
4. Откройте файл `map.js` и вставьте ID в переменную `GOOGLE_DRIVE_FILE_ID`:

```javascript
const GOOGLE_DRIVE_FILE_ID = '1ABC123xyz'; // Ваш ID файла
```

### Вариант 2: Использовать прямую ссылку

1. Преобразуйте ссылку Google Drive в прямую ссылку для скачивания:
   - Обычная ссылка: `https://drive.google.com/file/d/FILE_ID/view?usp=sharing`
   - Прямая ссылка: `https://drive.google.com/uc?export=download&id=FILE_ID`
2. Вставьте прямую ссылку в переменную `GOOGLE_DRIVE_DIRECT_URL`:

```javascript
const GOOGLE_DRIVE_DIRECT_URL = 'https://drive.google.com/uc?export=download&id=1ABC123xyz';
```

### Вариант 3: Использовать полную ссылку Google Drive

Вы можете вставить полную ссылку Google Drive в любую из переменных - код автоматически извлечет ID:

```javascript
const GOOGLE_DRIVE_FILE_ID = 'https://drive.google.com/file/d/1ABC123xyz/view?usp=sharing';
```

## Важно!

⚠️ **Для больших файлов (>100MB) Google Drive может показывать предупреждение о вирусе**

Если файл большой, используйте альтернативный формат прямой ссылки:
```
https://drive.google.com/uc?id=FILE_ID&export=download&confirm=t
```

Или используйте сервис для преобразования ссылок, например:
- https://sites.google.com/site/gdocs2direct/

## Проверка

После настройки:
1. Откройте карту в браузере
2. Откройте консоль разработчика (F12)
3. Проверьте сообщение: `Загрузка файла глубин с URL: ...`
4. Убедитесь, что файл загружается без ошибок

## Отладка

Если файл не загружается:
1. Проверьте, что файл публичный (можно открыть в режиме инкогнито)
2. Проверьте правильность ID файла
3. Проверьте консоль браузера на наличие ошибок CORS
4. Для больших файлов может потребоваться альтернативный формат ссылки (см. выше)

