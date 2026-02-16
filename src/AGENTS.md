# БАЗА ЗНАНИЙ SRC

**Сгенерировано:** 2026-02-14 03:00 Europe/Moscow

## ОБЗОР
`src/` содержит весь прикладной код: точки входа Next.js App Router в `app/`, крупный сгенерированный набор примитивов в `components/ui/` и небольшие общие хелперы в `hooks/` и `lib/`.

## ГДЕ ИСКАТЬ
| Задача | Расположение | Примечание |
|------|----------|-------|
| Обновить UX/поведение страницы | `src/app/page.tsx` | Крупный клиентский компонент со state аналитического workflow |
| Изменить глобальную оболочку/мета | `src/app/layout.tsx` | Настройка шрифтов, метаданные, mount toaster |
| Добавить/изменить API endpoint | `src/app/api/route.ts` | Route-handler стиль для App Router |
| Изменить примитивные компоненты | `src/components/ui/*.tsx` | Сгенерированные building-block'и Radix/shadcn |
| Настроить поведение toast | `src/hooks/use-toast.ts` + `src/components/ui/toaster.tsx` | In-memory toast state + renderer |
| Обновить общие helper'ы | `src/lib/utils.ts` / `src/lib/db.ts` | `cn` helper и Prisma singleton |

## СОГЛАШЕНИЯ
- Используйте alias-импорты (`@/...`) вместо длинных относительных путей.
- Держите route handlers в `src/app/api/**/route.ts` и возвращайте `NextResponse`.
- Держите UI-примитивы в `src/components/ui` с именованными экспортами и общим helper'ом `cn`.
- В `src/hooks` сейчас лежат легковесные локальные хуки (mobile breakpoint, toast state), а не глобальные сторы.
- UI-строки в приложении исторически смешанные (русский + английский), поэтому стиль локализации неоднороден.

## АНТИ-ПАТТЕРНЫ (SRC)
- Не размещайте бизнес-логику приложения внутри `src/components/ui`; примитивы должны оставаться переиспользуемыми.
- Не добавляйте новые глубокие относительные импорты (`../../..`), когда доступен alias `@/...`.
- Не расширяйте ML-dashboard workflow без устранения нерешенных зависимостей модулей (сейчас `@/lib/ml-api`).

## ПРИМЕЧАНИЯ
- `src/app/page.tsx` импортирует `@/lib/ml-api`, но соответствующий файл в `src/lib/` сейчас может отсутствовать.
- Две самые сложные зоны: `src/app/page.tsx` и `src/components/ui/sidebar.tsx`.
