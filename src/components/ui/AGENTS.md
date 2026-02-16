# БАЗА ЗНАНИЙ UI-ПРИМИТИВОВ

**Сгенерировано:** 2026-02-14 03:00 Europe/Moscow

## ОБЗОР
`src/components/ui/` — это заранее сгенерированный набор примитивов shadcn/Radix; файлы в основном являются framework-style обертками и должны оставаться переиспользуемыми и domain-agnostic.

## ГДЕ ИСКАТЬ
| Задача | Расположение | Примечание |
|------|----------|-------|
| Варианты/размеры кнопки | `src/components/ui/button.tsx` | Канонический паттерн `cva` + variants |
| Каркас полей формы | `src/components/ui/form.tsx` | Обертки React Hook Form и field context |
| Оверлеи dialog/sheet/drawer | `src/components/ui/dialog.tsx`, `sheet.tsx`, `drawer.tsx` | Примитивы оверлеев на Radix/Vaul |
| Примитивы таблиц/списков | `src/components/ui/table.tsx`, `chart.tsx`, `carousel.tsx` | Data UI wrappers с общими style conventions |
| Система sidebar | `src/components/ui/sidebar.tsx` | Самый большой файл: provider + hook + множество слотов |
| Отображение toast | `src/components/ui/toast.tsx`, `toaster.tsx`, `sonner.tsx` | В проекте присутствуют две toast-системы |

## СОГЛАШЕНИЯ
- Предпочитайте именованные экспорты в конце файла (`export { ... }`); default exports здесь не норма.
- Держите одно семейство примитивов на файл и сохраняйте текущее соответствие filename->component.
- Используйте `cn` из `@/lib/utils` для объединения классов и держите class strings в Tailwind-first стиле.
- Используйте `cva` только там, где variants входят в публичный API компонента.
- Сохраняйте composability-паттерны (`asChild`, slot wrappers, `data-slot` attributes), если они уже есть.
- Этот слой должен быть UI-generic; тексты приложения, API-вызовы и feature-логика должны жить вне этой директории.

## АНТИ-ПАТТЕРНЫ (UI)
- Не добавляйте продуктовую/доменную бизнес-логику в файлы примитивов.
- Не переводите существующие modules с именованных экспортов на default exports.
- Не ломайте публичные props/variant names примитивов без проверки всех импортов в `src/app`.
- Не вводите ad-hoc style helper'ы, когда уже есть паттерны `cn`/`cva`.

## ПРИМЕЧАНИЯ
- В этой директории высокая плотность экспортов (40+ export blocks), поэтому rename/refactor должен учитывать все импорты.
- `sidebar.tsx` — hotspot по сложности, меняйте его аккуратно.
