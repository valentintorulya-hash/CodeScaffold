#!/bin/bash

# Перенаправляем stderr в stdout, чтобы внешние раннеры не считали это ошибкой
exec 2>&1

set -e

# Каталог скрипта (.zscripts)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Путь к Next.js проекту
NEXTJS_PROJECT_DIR="/home/z/my-project"

# Проверка существования проекта
if [ ! -d "$NEXTJS_PROJECT_DIR" ]; then
    echo "❌ Ошибка: каталог Next.js проекта не найден: $NEXTJS_PROJECT_DIR"
    exit 1
fi

echo "🚀 Запуск сборки Next.js приложения и mini-services..."
echo "📁 Путь к Next.js проекту: $NEXTJS_PROJECT_DIR"

# Переход в каталог проекта
cd "$NEXTJS_PROJECT_DIR" || exit 1

# Переменные окружения
export NEXT_TELEMETRY_DISABLED=1

BUILD_DIR="/tmp/build_fullstack_$BUILD_ID"
echo "📁 Подготовка каталога сборки: $BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Установка зависимостей
echo "📦 Установка зависимостей..."
bun install

# Сборка Next.js
echo "🔨 Сборка Next.js приложения..."
bun run build

# Сборка mini-services (если каталог существует)
if [ -d "$NEXTJS_PROJECT_DIR/mini-services" ]; then
    echo "🔨 Сборка mini-services..."
    sh "$SCRIPT_DIR/mini-services-install.sh"
    sh "$SCRIPT_DIR/mini-services-build.sh"

    # Копирование скрипта запуска mini-services
    echo "  - Копирование mini-services-start.sh в $BUILD_DIR"
    cp "$SCRIPT_DIR/mini-services-start.sh" "$BUILD_DIR/mini-services-start.sh"
    chmod +x "$BUILD_DIR/mini-services-start.sh"
else
    echo "ℹ️  Каталог mini-services не найден, пропуск"
fi

# Сбор артефактов
echo "📦 Сбор артефактов в $BUILD_DIR..."

# Копирование Next.js standalone
if [ -d ".next/standalone" ]; then
    echo "  - Копирование .next/standalone"
    cp -r .next/standalone "$BUILD_DIR/next-service-dist/"
fi

# Копирование Next.js статики
if [ -d ".next/static" ]; then
    echo "  - Копирование .next/static"
    mkdir -p "$BUILD_DIR/next-service-dist/.next"
    cp -r .next/static "$BUILD_DIR/next-service-dist/.next/"
fi

# Копирование public
if [ -d "public" ]; then
    echo "  - Копирование public"
    cp -r public "$BUILD_DIR/next-service-dist/"
fi

# Миграция базы данных в BUILD_DIR/db
if [ "$(ls -A ./db 2>/dev/null)" ]; then
    echo "🗄️  Найдены файлы БД, запускаем миграцию..."
    DATABASE_URL=file:$BUILD_DIR/db/custom.db bun run db:push
    echo "✅ Миграция БД завершена"
    ls -lah $BUILD_DIR/db
else
    echo "ℹ️  Каталог db пуст, миграция пропущена"
fi

# Копирование ML service (FastAPI + Python backend)
if [ -f "$NEXTJS_PROJECT_DIR/scripts/ml_service.py" ]; then
    echo "  - Копирование ML service (scripts/)"
    mkdir -p "$BUILD_DIR/scripts"
    cp "$NEXTJS_PROJECT_DIR/scripts/ml_service.py" "$BUILD_DIR/scripts/"
    cp "$NEXTJS_PROJECT_DIR/scripts/ml_backend.py" "$BUILD_DIR/scripts/"
    cp "$NEXTJS_PROJECT_DIR/scripts/requirements.txt" "$BUILD_DIR/scripts/"
else
    echo "ℹ️  ML service не найден, пропуск"
fi

# Копирование Caddyfile (если есть)
if [ -f "Caddyfile" ]; then
    echo "  - Копирование Caddyfile"
    cp Caddyfile "$BUILD_DIR/"
else
    echo "ℹ️  Caddyfile не найден, пропуск"
fi

# Копирование start.sh
echo "  - Копирование start.sh в $BUILD_DIR"
cp "$SCRIPT_DIR/start.sh" "$BUILD_DIR/start.sh"
chmod +x "$BUILD_DIR/start.sh"

# Архивация
PACKAGE_FILE="${BUILD_DIR}.tar.gz"
echo ""
echo "📦 Упаковка артефактов в $PACKAGE_FILE..."
cd "$BUILD_DIR" || exit 1
tar -czf "$PACKAGE_FILE" .
cd - > /dev/null || exit 1

# # Очистка временного каталога
# rm -rf "$BUILD_DIR"

echo ""
echo "✅ Сборка завершена! Артефакты упакованы в $PACKAGE_FILE"
echo "📊 Размер архива:"
ls -lh "$PACKAGE_FILE"
