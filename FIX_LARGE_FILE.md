# Исправление ошибки с большим файлом

## Проблема
Файл `all_depths.geojson` (1.9GB) превышает лимит GitHub в 100MB, даже с Git LFS.

## Решение

### Вариант 1: Удалить файл из истории (рекомендуется)

Так как карта теперь использует `merged_depths.geojson`, большой файл не нужен.

```bash
# 1. Убедитесь, что файл в .gitignore
echo "all_depths.geojson" >> .gitignore
git add .gitignore

# 2. Удалите файл из истории Git (используйте git filter-repo или BFG)
# Установите git-filter-repo:
# pip install git-filter-repo

# Удалите файл из всей истории:
git filter-repo --path all_depths.geojson --invert-paths

# Или используйте BFG Repo-Cleaner (быстрее):
# java -jar bfg.jar --delete-files all_depths.geojson
# git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

### Вариант 2: Удалить из последнего коммита (если файл только там)

```bash
# Удалите файл из последнего коммита
git reset --soft HEAD~1
git reset HEAD all_depths.geojson
git commit -m "Remove large file"
git push --force
```

### Вариант 3: Создать новый коммит без файла

```bash
# Убедитесь, что файл в .gitignore
echo "all_depths.geojson" >> .gitignore
git add .gitignore
git commit -m "Add all_depths.geojson to gitignore"

# Удалите файл из индекса (если он там)
git rm --cached all_depths.geojson 2>/dev/null || true

# Создайте новый коммит
git commit -m "Remove large file from tracking"
git push
```

### Вариант 4: Использовать Git LFS правильно

Если файл действительно нужен:

```bash
# 1. Убедитесь, что Git LFS установлен
git lfs install

# 2. Отслеживайте файл через LFS
git lfs track "all_depths.geojson"

# 3. Добавьте .gitattributes
git add .gitattributes

# 4. Удалите файл из обычного Git
git rm --cached all_depths.geojson

# 5. Добавьте файл через LFS
git add all_depths.geojson

# 6. Закоммитьте
git commit -m "Move large file to LFS"
git push
```

## Рекомендация

**Используйте Вариант 1 или 3**, так как файл `all_depths.geojson` не используется в карте (карта загружает `merged_depths.geojson`).

После удаления файла из истории:
```bash
git push --force
```

⚠️ **Внимание**: `git push --force` перезапишет историю на GitHub. Убедитесь, что никто другой не работает с этим репозиторием.




