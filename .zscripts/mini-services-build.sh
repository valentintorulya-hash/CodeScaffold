#!/bin/bash

# Параметры
ROOT_DIR="/home/z/my-project/mini-services"
DIST_DIR="/tmp/build_fullstack_$BUILD_ID/mini-services-dist"

main() {
    echo "🚀 Запуск пакетной сборки..."

    # Проверка существования rootdir
    if [ ! -d "$ROOT_DIR" ]; then
        echo "ℹ️  Каталог $ROOT_DIR не найден, сборка пропущена"
        return
    fi

    # Создание каталога вывода
    mkdir -p "$DIST_DIR"

    # Счетчики
    success_count=0
    fail_count=0

    # Обход всех каталогов mini-services
    for dir in "$ROOT_DIR"/*; do
        # Обрабатываем только каталоги с package.json
        if [ -d "$dir" ] && [ -f "$dir/package.json" ]; then
            project_name=$(basename "$dir")

            # Поиск entry-файла по приоритету
            entry_path=""
            for entry in "src/index.ts" "index.ts" "src/index.js" "index.js"; do
                if [ -f "$dir/$entry" ]; then
                    entry_path="$dir/$entry"
                    break
                fi
            done

            if [ -z "$entry_path" ]; then
                echo "⚠️  Пропуск $project_name: не найден entry-файл (index.ts/js)"
                continue
            fi

            echo ""
            echo "📦 Сборка: $project_name..."

            output_file="$DIST_DIR/mini-service-$project_name.js"

            if bun build "$entry_path" \
                --outfile "$output_file" \
                --target bun \
                --minify; then
                echo "✅ $project_name собран успешно -> $output_file"
                success_count=$((success_count + 1))
            else
                echo "❌ Ошибка сборки $project_name"
                fail_count=$((fail_count + 1))
            fi
        fi
    done

    if [ -f ./.zscripts/mini-services-start.sh ]; then
        cp ./.zscripts/mini-services-start.sh "$DIST_DIR/mini-services-start.sh"
        chmod +x "$DIST_DIR/mini-services-start.sh"
    fi

    echo ""
    echo "🎉 Все задачи завершены!"
    if [ $success_count -gt 0 ] || [ $fail_count -gt 0 ]; then
        echo "✅ Успешно: $success_count"
        if [ $fail_count -gt 0 ]; then
            echo "❌ Ошибок: $fail_count"
        fi
    fi
}

main
