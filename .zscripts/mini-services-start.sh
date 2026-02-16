#!/bin/sh

# Параметры
DIST_DIR="./mini-services-dist"

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
}

main() {
    echo "🚀 Запуск всех mini-services..."

    # Проверка существования каталога dist
    if [ ! -d "$DIST_DIR" ]; then
        echo "ℹ️  Каталог $DIST_DIR не найден"
        return
    fi

    # Поиск файлов mini-service-*.js
    service_files=""
    for file in "$DIST_DIR"/mini-service-*.js; do
        if [ -f "$file" ]; then
            if [ -z "$service_files" ]; then
                service_files="$file"
            else
                service_files="$service_files $file"
            fi
        fi
    done

    # Подсчет количества сервисов
    service_count=0
    for file in $service_files; do
        service_count=$((service_count + 1))
    done

    if [ $service_count -eq 0 ]; then
        echo "ℹ️  Файлы mini-service не найдены"
        return
    fi

    echo "📦 Найдено сервисов: $service_count. Начинаем запуск..."
    echo ""

    # Запуск каждого сервиса
    for file in $service_files; do
        service_name=$(basename "$file" .js | sed 's/mini-service-//')
        echo "▶️  Запуск сервиса: $service_name..."

        # Запуск в фоне через bun
        bun "$file" &
        pid=$!
        if [ -z "$pids" ]; then
            pids="$pid"
        else
            pids="$pids $pid"
        fi

        # Небольшая пауза и проверка старта
        sleep 0.5
        if ! kill -0 "$pid" 2>/dev/null; then
            echo "❌ Не удалось запустить $service_name"
            # Удаляем неуспешный PID из строки
            pids=$(echo "$pids" | sed "s/\b$pid\b//" | sed 's/  */ /g' | sed 's/^ *//' | sed 's/ *$//')
        else
            echo "✅ $service_name запущен (PID: $pid)"
        fi
    done

    # Подсчет реально работающих сервисов
    running_count=0
    for pid in $pids; do
        if kill -0 "$pid" 2>/dev/null; then
            running_count=$((running_count + 1))
        fi
    done

    echo ""
    echo "🎉 Все сервисы запущены! Работает: $running_count"
    echo ""
    echo "💡 Нажмите Ctrl+C, чтобы остановить все сервисы"
    echo ""

    # Ожидание завершения фоновых процессов
    wait
}

main
