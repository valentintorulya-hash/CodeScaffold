#!/bin/sh

set -e

# Каталог текущего скрипта
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR"

# PID всех дочерних процессов
pids=""

# Аккуратное завершение всех сервисов
cleanup() {
    echo ""
    echo "🛑 Останавливаем все сервисы..."

    # Отправка SIGTERM всем дочерним процессам
    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            service_name=$(ps -p "$pid" -o comm= 2>/dev/null || echo "неизвестно")
            echo "   Завершение процесса $pid ($service_name)..."
            kill -TERM "$pid" 2>/dev/null
        fi
    done

    # Ожидание завершения (до 5 секунд)
    sleep 1
    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            timeout=4
            while [ $timeout -gt 0 ] && kill -0 "$pid" 2>/dev/null; do
                sleep 1
                timeout=$((timeout - 1))
            done
            # Принудительное завершение, если процесс не вышел
            if kill -0 "$pid" 2>/dev/null; then
                echo "   Принудительное завершение процесса $pid..."
                kill -KILL "$pid" 2>/dev/null
            fi
        fi
    done

    echo "✅ Все сервисы остановлены"
    exit 0
}

echo "🚀 Запуск всех сервисов..."
echo ""

# Переход в каталог сборки
cd "$BUILD_DIR" || exit 1

ls -lah

# Инициализация базы данных (если есть)
if [ -d "./next-service-dist/db" ] && [ "$(ls -A ./next-service-dist/db 2>/dev/null)" ] && [ -d "/db" ]; then
    echo "🗄️  Инициализация БД: ./next-service-dist/db -> /db..."
    cp -r ./next-service-dist/db/* /db/ 2>/dev/null || echo "  ⚠️  Не удалось скопировать в /db, инициализация БД пропущена"
    echo "✅ Инициализация БД завершена"
fi

# Запуск Next.js сервера
if [ -f "./next-service-dist/server.js" ]; then

    # Запуск FastAPI ML service (перед Next.js, чтобы был готов к запросам)
    if [ -f "./scripts/ml_service.py" ]; then
        echo "🧠 Запуск FastAPI ML service..."
        python3 ./scripts/ml_service.py &
        ML_PID=$!
        pids="$ML_PID"

        # Ожидание старта ML service (до 30 сек — TF может загружаться долго)
        ml_ready=0
        for i in $(seq 1 30); do
            if curl -s http://127.0.0.1:8000/health > /dev/null 2>&1; then
                ml_ready=1
                break
            fi
            sleep 1
        done

        if [ "$ml_ready" -eq 1 ]; then
            echo "✅ FastAPI ML service запущен (PID: $ML_PID)"
        else
            echo "⚠️  FastAPI ML service не ответил за 30с, продолжаем (fallback на Python spawn)"
        fi
    else
        echo "ℹ️  FastAPI ML service не найден, пропуск"
    fi

    echo "🚀 Запуск Next.js сервера..."
    cd next-service-dist/ || exit 1

    # Переменные окружения
    export NODE_ENV=production
    export PORT=${PORT:-3000}
    export HOSTNAME=${HOSTNAME:-0.0.0.0}

    # Запуск в фоне
    bun server.js &
    NEXT_PID=$!
    pids="$pids $NEXT_PID"

    # Небольшая пауза и проверка старта
    sleep 1
    if ! kill -0 "$NEXT_PID" 2>/dev/null; then
        echo "❌ Не удалось запустить Next.js сервер"
        exit 1
    else
        echo "✅ Next.js сервер запущен (PID: $NEXT_PID, порт: $PORT)"
    fi

    cd ../
else
    echo "⚠️  Файл Next.js сервера не найден: ./next-service-dist/server.js"
fi

# Запуск mini-services
if [ -f "./mini-services-start.sh" ]; then
    echo "🚀 Запуск mini-services..."

    sh ./mini-services-start.sh &
    MINI_PID=$!
    pids="$pids $MINI_PID"

    sleep 1
    if ! kill -0 "$MINI_PID" 2>/dev/null; then
        echo "⚠️  Возможно, mini-services не запустились, продолжаем работу"
    else
        echo "✅ mini-services запущены (PID: $MINI_PID)"
    fi
elif [ -d "./mini-services-dist" ]; then
    echo "⚠️  Скрипт запуска mini-services не найден, но каталог существует"
else
    echo "ℹ️  Каталог mini-services отсутствует, пропуск"
fi

# Запуск Caddy
echo "🚀 Запуск Caddy..."
echo "✅ Caddy запущен (foreground режим)"
echo ""
echo "🎉 Все сервисы запущены!"
echo ""
echo "💡 Нажмите Ctrl+C, чтобы остановить все сервисы"
echo ""

# Caddy как главный процесс
exec caddy run --config Caddyfile --adapter caddyfile
