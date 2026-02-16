# БАЗА ЗНАНИЙ ПРОЕКТА

**Сгенерировано:** 2026-02-14 03:00 Europe/Moscow
**Коммит:** n/a (не git-репозиторий)
**Ветка:** n/a (не git-репозиторий)

## ОБЗОР
Шаблон Next.js 16 App Router с TypeScript, Tailwind v4, Prisma (SQLite) и большим заранее сгенерированным набором компонентов shadcn/ui.
Основная логика приложения сейчас находится на одной dashboard-странице для ML-аналитики.

## СТРУКТУРА
```text
./
|- .zscripts/           # Скрипты оркестрации сборки/деплоя (bun + caddy + mini-services)
|- examples/websocket/  # Небольшой пример websocket (frontend.tsx + server.ts)
|- prisma/              # Схема SQLite (User/Post)
|- src/
|  |- app/              # Точки входа App Router и API-маршрут
|  |- components/ui/    # Большой набор сгенерированных UI-примитивов в стиле shadcn
|  |- hooks/            # Локальные утилитарные хуки (toast state, mobile breakpoint)
|  `- lib/              # Общие утилиты (cn helper, Prisma client)
`- Caddyfile            # Маршрутизация reverse proxy для :81 -> сервис(ы) приложения
```

## ГДЕ ИСКАТЬ
| Задача | Расположение | Примечание |
|------|----------|-------|
| Поведение главной UI-страницы | `src/app/page.tsx` | Одна большая клиентская страница (~875 строк) |
| Оболочка/метаданные приложения | `src/app/layout.tsx` | Глобальные шрифты, метаданные, mount toaster |
| Паттерн API-маршрута | `src/app/api/route.ts` | Минимальный JSON-обработчик на NextResponse |
| Общие UI-примитивы | `src/components/ui/*.tsx` | Сгенерированный набор компонентов |
| Поведение toast | `src/hooks/use-toast.ts` + `src/components/ui/toaster.tsx` | In-memory reducer + presenter |
| DB-клиент и схема | `src/lib/db.ts` + `prisma/schema.prisma` | Prisma singleton + SQLite-модели |
| Команды сборки/запуска | `package.json` + `.zscripts/*.sh` | Скрипты приложения и деплоя |

## КАРТА КОДА
TypeScript LSP недоступен в текущем окружении; карта собрана по AST/grep.

| Символ | Тип | Расположение | Ссылки | Роль |
|--------|------|----------|------|------|
| `Dashboard` | функциональный компонент | `src/app/page.tsx` | entry | Главный пользовательский workflow dashboard |
| `RootLayout` | функциональный компонент | `src/app/layout.tsx` | app entry | Глобальная оболочка и метаданные |
| `db` | экспортируемая константа | `src/lib/db.ts` | низкая | Singleton Prisma client |
| `useToast` | функция | `src/hooks/use-toast.ts` | низкая | API хука для toast-состояния |
| `reducer` | экспортируемая константа | `src/hooks/use-toast.ts` | internal | Переходы состояния toast |
| `Button` | компонент | `src/components/ui/button.tsx` | средняя | Канонический стиль экспорта UI-примитивов |
| `useSidebar` | экспорт хука | `src/components/ui/sidebar.tsx` | local | Утилита sidebar из сгенерированного набора |

## СОГЛАШЕНИЯ
- Проверки TypeScript/lint намеренно мягкие: в `next.config.ts` включено `typescript.ignoreBuildErrors=true`; в `eslint.config.mjs` отключено много строгих правил.
- Алиас путей `@/*` указывает на `src/*` (`tsconfig.json`) и используется повсеместно.
- UI-примитивы следуют сгенерированным паттернам shadcn (обертки Radix, `cva`, именованные экспорты, `cn` helper).
- Runtime-скрипты в `.zscripts/*.sh` рассчитаны на наличие bun и Linux-подобные пути.

## АНТИ-ПАТТЕРНЫ (ЭТОТ ПРОЕКТ)
Локальные policy-файлы с жесткими правилами `DO NOT`/`NEVER` не обнаружены.
Наблюдаемые операционные риски:
- Не предполагать, что `bun run build` гарантирует корректность TypeScript (сборка игнорирует TS-ошибки).
- Не предполагать, что lint поймает все небезопасные паттерны (многие eslint-правила отключены).

## УНИКАЛЬНЫЕ ОСОБЕННОСТИ
- Смешанные языки комментариев/сообщений в файлах (английский, русский, китайский).
- Большой объем сгенерированных компонентов в `src/components/ui` и длинные блоки экспортов.
- Shell-скрипты ориентированы на деплой-пакетирование и оркестрацию сервисов, а не только на локальную разработку.

## КОМАНДЫ
```bash
bun install
bun run dev
bun run build
bun start
bun run lint
bun run db:push
bun run db:generate
bun run db:migrate
bun run db:reset
sh .zscripts/build.sh
sh .zscripts/start.sh
```

## ПРИМЕЧАНИЯ
- Тестовые файлы и конфигурация тест-раннера не обнаружены.
- Импорт в `src/app/page.tsx` ссылается на `@/lib/ml-api`, но соответствующего файла в дереве нет.
- LSP code-intel станет доступен после установки `typescript-language-server`.
