#!/bin/bash

# Параметры
ROOT_DIR="/home/z/my-project/mini-services"

main() {
    echo "🚀 Запуск пакетной установки зависимостей..."

    # Проверка существования rootdir
    if [ ! -d "$ROOT_DIR" ]; then
        echo "ℹ️  Каталог $ROOT_DIR не найден, установка пропущена"
        return
    fi

    # Счетчики
    success_count=0
    fail_count=0
    failed_projects=""

    # Обход всех каталогов mini-services
    for dir in "$ROOT_DIR"/*; do
        # Обрабатываем только каталоги с package.json
        if [ -d "$dir" ] && [ -f "$dir/package.json" ]; then
            project_name=$(basename "$dir")
            echo ""
            echo "📦 Установка зависимостей: $project_name..."

            # Переходим в проект и запускаем bun install
            if (cd "$dir" && bun install); then
                echo "✅ Зависимости $project_name установлены"
                success_count=$((success_count + 1))
            else
                echo "❌ Ошибка установки зависимостей в $project_name"
                fail_count=$((fail_count + 1))
                if [ -z "$failed_projects" ]; then
                    failed_projects="$project_name"
                else
                    failed_projects="$failed_projects $project_name"
                fi
            fi
        fi
    done

    # Итог
    echo ""
    echo "=================================================="
    if [ $success_count -gt 0 ] || [ $fail_count -gt 0 ]; then
        echo "🎉 Установка завершена"
        echo "✅ Успешно: $success_count"
        if [ $fail_count -gt 0 ]; then
            echo "❌ Ошибок: $fail_count"
            echo ""
            echo "Неуспешные проекты:"
            for project in $failed_projects; do
                echo "  - $project"
            done
        fi
    else
        echo "ℹ️  Проекты с package.json не найдены"
    fi
    echo "=================================================="
}

main
