# Оптимизация производительности ML Dashboard без потери точности

## TL;DR

> **Quick Summary**: Ускоряем весь ML-пайплайн (API + Python + фронтенд) без изменения функционального поведения и качества прогнозирования. Главный рычаг скорости: переход с `spawn` Python на персистентный FastAPI-сервис + удаление лишних API round-trip.
>
> **Deliverables**:
> - Персистентный Python ML-service (FastAPI) с детерминированным поведением на каждый запрос
> - Консолидация ответа `runFullAnalysis` в один полный payload
> - Ускорение загрузки MOEX данных для больших диапазонов
> - Обновленный `route.ts` с fallback-механизмом и безопасным rollback
> - Фронтенд без лишних API-вызовов и с уменьшенной нагрузкой на localStorage
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 5 waves
> **Critical Path**: Task 1 -> Task 2 -> Task 3 -> Task 4 -> Task 5 -> Task 10

---

## Context

### Original Request
Пользователь запросил проработку оптимизации производительности по всему проекту, без урезания функционала, с сохранением точности анализа и прогнозирования, и с ускорением API на больших выборках.

### Interview Summary
**Key Discussions**:
- Переход `subprocess spawn` -> FastAPI подтвержден пользователем
- Консолидация API в один ответ `runFullAnalysis` подтверждена
- Фронтенд-оптимизации включены в scope
- Автотесты не добавляем; используем Agent-Executed QA

**Research Findings**:
- Текущий поток: `page.tsx` -> `src/lib/ml-api.ts` -> `src/app/api/ml/route.ts` -> `pythonExec()` -> `scripts/ml_backend.py`
- Самый тяжелый узкий участок: запуск Python + импорт TF на каждый запрос
- `runFullAnalysis` уже получает от Python `predictions/stationarity/forecast`, но не отдает их фронту напрямую
- `page.tsx` после `runFullAnalysis` делает лишние последовательные вызовы `makePredictions/getDataPreview/analyzeStationarity`

### Metis Review
**Identified Gaps** (addressed in this plan):
- Ложная гипотеза: batch LSTM predict невозможен в текущем autoregressive цикле -> исключено из scope
- Нужен guardrail: seed reset в FastAPI на каждый запрос, иначе детерминизм ломается
- Нужен guardrail: не менять walk-forward/ARIMA параметры для сохранения точности
- Нужен rollback: флаг `USE_FASTAPI_SERVICE` + fallback на `pythonExec`
- Нужно baseline-измерение до оптимизаций, иначе нельзя доказать прирост

---

## Work Objectives

### Core Objective
Снизить end-to-end latency анализа и ответа API без изменения бизнес-логики прогнозирования и без деградации точности/реалистичности прогнозов.

### Concrete Deliverables
- Персистентный FastAPI-сервис для операций `analyze/forecast/health`
- Обновленный `src/app/api/ml/route.ts` с поддержкой FastAPI и fallback
- Обновленный контракт `runFullAnalysis` (полный ответ за 1 вызов)
- Обновленные `src/lib/ml-api.ts` и `src/app/page.tsx` под новый контракт
- Оптимизированный `fetchMoexCandles()` с bounded concurrency и кешами
- Обновленные `.zscripts/build.sh` и `.zscripts/start.sh` под запуск ML-service
- Набор evidence-артефактов с performance-before/after и regression checks

### Definition of Done
- [ ] `POST /api/ml action=runFullAnalysis` возвращает полный payload за один вызов
- [ ] `page.tsx` больше не делает 3 лишних запроса после `runFullAnalysis`
- [ ] При равных входных параметрах метрики и прогнозы не деградируют (допуск epsilon)
- [ ] `forecastFuture` корректно работает для `days=30` и `days!=30`
- [ ] Если FastAPI недоступен, fallback работает по конфигу без падения всего API
- [ ] Профилирование показывает ускорение p50/p95 latency на целевом сценарии

### Must Have
- Сохранение текущей функциональности UI и API (ключи ответов, user flow)
- Сохранение качества прогноза: RMSE/MAE/MAPE/R2 без деградации выше допуска
- Детерминизм: фиксированные seed внутри каждого FastAPI запроса
- Сохранение текущей логики моделей и walk-forward подхода

### Must NOT Have (Guardrails)
- Не добавлять новые ML-модели и не менять бизнес-логику прогнозирования
- Не менять candidate orders ARIMA: `[(1,1,1), (2,1,1), (1,1,2), (2,1,2), (0,1,1)]`
- Не уменьшать `max_origins`, `lstm_origins_target`, `lstm_epochs` для ускорения ценой качества
- Не переносить MOEX fetching в Python; MOEX остается в Node API слое
- Не публиковать FastAPI наружу через Caddy (только localhost/internal)
- Не вводить ручную верификацию пользователем в acceptance criteria

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> Все критерии верификации выполняются агентом командами и инструментами. Никаких шагов вида "пользователь проверяет вручную".

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None
- **Framework**: none

### Agent-Executed QA Scenarios (MANDATORY)
- UI: Playwright (запуск анализа, проверка табов, screenshot evidence)
- API: `curl`/Node scripts (сравнение payload, latency, fallback)
- Process: shell/tmux (`.zscripts` запуск, FastAPI health)

### Accuracy Regression Rules
- Допуск по RMSE/MAE/MAPE: не хуже baseline более чем на 1%
- Допуск по точечным значениям прогноза: abs diff <= `0.01` при фиксированных seeds
- `best_model` должен оставаться валидным и воспроизводимым

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Baseline First):
└── Task 1: Baseline latency + correctness snapshot

Wave 1 (Service Foundation):
├── Task 2: FastAPI ML-service wrapper
├── Task 7: Determinism/concurrency guardrails in service
└── Task 9: Build/start script integration

Wave 2 (API Core Path):
├── Task 3: route.ts FastAPI integration + fallback
├── Task 4: Consolidated runFullAnalysis response
└── Task 6: MOEX fetch acceleration + cache

Wave 3 (Frontend Consumption):
├── Task 5: ml-api/page.tsx contract migration
└── Task 8: localStorage debounce + tabs verification

Wave 4 (Final Verification):
└── Task 10: End-to-end regression + perf report
```

Critical Path: Task 1 -> Task 2 -> Task 3 -> Task 4 -> Task 5 -> Task 10
Parallel Speedup: ~35-45% vs strictly sequential execution.

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|----------------------|
| 1 | None | 2,3,4,5,10 | None |
| 2 | 1 | 3,7,10 | 9 |
| 3 | 2 | 4,5,10 | 6 |
| 4 | 3 | 5,10 | 6 |
| 5 | 4 | 10 | 8 |
| 6 | 1 | 10 | 3,4 |
| 7 | 2 | 10 | 9 |
| 8 | 5 | 10 | None |
| 9 | 1 | 10 | 2,7 |
| 10 | 3,4,5,6,7,8,9 | None | None |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 0 | 1 | `task(category="quick", load_skills=[])` |
| 1 | 2,7,9 | `task(category="unspecified-high", load_skills=[])` |
| 2 | 3,4,6 | `task(category="unspecified-high", load_skills=[])` |
| 3 | 5,8 | `task(category="quick", load_skills=["frontend-ui-ux"])` |
| 4 | 10 | `task(category="deep", load_skills=["playwright"])` |

---

## TODOs

- [ ] 1. Собрать baseline производительности и корректности (до изменений)

  **What to do**:
  - Зафиксировать baseline latency для `runFullAnalysis`, `forecastFuture(30)`, `forecastFuture(90)`
  - Сохранить baseline payload для сравнения (метрики, прогнозы, stationarity, walk_forward, realism_metrics)
  - Подготовить machine-readable отчет в `.sisyphus/evidence/`

  **Must NOT do**:
  - Не менять код моделей и API до завершения baseline

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: измерение и фиксация состояния без сложного рефакторинга
  - **Skills**: `[]`
    - базовые shell/API проверки достаточно
  - **Skills Evaluated but Omitted**:
    - `playwright`: UI не нужен для baseline API метрик

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 0
  - **Blocks**: 2,3,4,5,10
  - **Blocked By**: None

  **References**:
  - `src/app/api/ml/route.ts:259` - текущая входная точка `runFullAnalysis`
  - `src/app/api/ml/route.ts:326` - текущая ветка `forecastFuture`
  - `src/app/page.tsx:290` - клиентский workflow анализа
  - `src/lib/ml-api.ts:100` - контракт `runFullAnalysis`

  **Acceptance Criteria**:
  - [ ] Создан файл `.sisyphus/evidence/perf-baseline.json` с p50/p95/avg latency
  - [ ] Создан файл `.sisyphus/evidence/baseline-runfullanalysis.json`
  - [ ] Создан файл `.sisyphus/evidence/baseline-forecast30.json`

  **Agent-Executed QA Scenarios**:

  ```text
  Scenario: Baseline runFullAnalysis timing snapshot
    Tool: Bash (curl + node)
    Preconditions: Dev server running on localhost:3000
    Steps:
      1. POST /api/ml with action=runFullAnalysis and fixed params/date range
      2. Repeat request 5 times with same payload
      3. Capture each duration in milliseconds
      4. Save response body of first successful call to baseline-runfullanalysis.json
      5. Compute p50/p95/avg and save to perf-baseline.json
    Expected Result: Baseline metrics file exists with numeric values
    Failure Indicators: status != 200, missing response keys, non-numeric timings
    Evidence: .sisyphus/evidence/perf-baseline.json

  Scenario: Invalid action error contract
    Tool: Bash (curl)
    Preconditions: Dev server running
    Steps:
      1. POST /api/ml with action="unknownAction"
      2. Assert HTTP status is 400 or 500 with success=false
      3. Assert response.error is non-empty string
    Expected Result: Error contract preserved
    Evidence: .sisyphus/evidence/baseline-invalid-action.json
  ```

  **Commit**: NO

---

- [ ] 2. Ввести FastAPI ML-service как персистентный Python слой

  **What to do**:
  - Добавить минимальный FastAPI сервис с эндпоинтами `/health`, `/analyze`, `/forecast`
  - Вынести запуск `analyze()` из stdin/main в импортируемый путь, сохраняя текущую бизнес-логику
  - Подготовить `requirements.txt` для ML-service

  **Must NOT do**:
  - Не переписывать математические функции в `scripts/ml_backend.py`
  - Не менять формулы и веса модели

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: архитектурное изменение рантайма Python сервиса
  - **Skills**: `[]`
    - требуется backend/system work без спец UI навыков
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: не относится к Python service

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with 7,9)
  - **Blocks**: 3,10
  - **Blocked By**: 1

  **References**:
  - `scripts/ml_backend.py:1033` - функция `analyze(payload)` как основной entrypoint
  - `scripts/ml_backend.py:1211` - текущий `main()` stdin workflow
  - `src/app/api/ml/route.ts:175` - текущий `pythonExec` вызов
  - External: `https://fastapi.tiangolo.com/tutorial/first-steps/`
  - External: `https://www.uvicorn.org/settings/`

  **Acceptance Criteria**:
  - [ ] FastAPI сервис стартует локально и отвечает `GET /health` -> `{status:"ok"}`
  - [ ] `POST /analyze` возвращает payload с ключами `success,data_info,comparison_table,best_model,predictions,stationarity,forecast`
  - [ ] `POST /forecast` возвращает `{success:true,forecast:{...}}`

  **Agent-Executed QA Scenarios**:

  ```text
  Scenario: FastAPI service health and analyze path
    Tool: Bash (uvicorn + curl)
    Preconditions: Python dependencies installed for service
    Steps:
      1. Start FastAPI on localhost:8000
      2. GET http://localhost:8000/health
      3. Assert status=200 and json.status="ok"
      4. POST /analyze with known close[]+dates[] payload
      5. Assert success=true and required keys exist
      6. Save response to .sisyphus/evidence/task-2-analyze.json
    Expected Result: Service responds correctly without Next.js route
    Evidence: .sisyphus/evidence/task-2-analyze.json

  Scenario: Forecast endpoint input validation
    Tool: Bash (curl)
    Preconditions: Service running
    Steps:
      1. POST /forecast with malformed payload (missing close)
      2. Assert HTTP status 400/422 with structured error
      3. POST /forecast with valid payload
      4. Assert success=true
    Expected Result: Validation failures are explicit; valid call succeeds
    Evidence: .sisyphus/evidence/task-2-forecast-validation.json
  ```

  **Commit**: NO

---

- [ ] 3. Интегрировать FastAPI в `route.ts` с fallback-режимом

  **What to do**:
  - Добавить клиент вызова FastAPI из `src/app/api/ml/route.ts`
  - Ввести `USE_FASTAPI_SERVICE`/`ML_SERVICE_URL` и fallback на `pythonExec`
  - Сохранить существующий JSON error contract `{success:false,error:string}`

  **Must NOT do**:
  - Не удалять `pythonExec()` до завершения полной верификации
  - Не ломать текущие action-ветки (`healthCheck/getDataPreview/...`)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: критический API gateway change с rollback-механикой
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `git-master`: commit-операции не требуются

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with 4,6)
  - **Blocks**: 4,5,10
  - **Blocked By**: 2

  **References**:
  - `src/app/api/ml/route.ts:175` - реализация `pythonExec`
  - `src/app/api/ml/route.ts:222` - общий POST handler
  - `src/app/api/ml/route.ts:259` - ветка `runFullAnalysis`
  - `src/app/api/ml/route.ts:334` - ветка `forecastFuture` для `days!=30`

  **Acceptance Criteria**:
  - [ ] При `USE_FASTAPI_SERVICE=true` route использует FastAPI
  - [ ] При недоступном FastAPI и `USE_FASTAPI_SERVICE=true` + `ALLOW_PYTHON_FALLBACK=true` выполняется fallback
  - [ ] При выключенном fallback возвращается понятная ошибка, не падение процесса

  **Agent-Executed QA Scenarios**:

  ```text
  Scenario: Primary FastAPI path from Next route
    Tool: Bash (curl)
    Preconditions: Next.js + FastAPI running; USE_FASTAPI_SERVICE=true
    Steps:
      1. POST /api/ml action=runFullAnalysis
      2. Assert success=true and response contains walk_forward
      3. Confirm route latency is below baseline p95 target
    Expected Result: Route uses FastAPI path successfully
    Evidence: .sisyphus/evidence/task-3-fastapi-path.json

  Scenario: Fallback behavior when FastAPI unavailable
    Tool: Bash (curl)
    Preconditions: Next.js running; FastAPI stopped
    Steps:
      1. Set ALLOW_PYTHON_FALLBACK=true
      2. POST /api/ml action=runFullAnalysis
      3. Assert request still succeeds via pythonExec
      4. Set ALLOW_PYTHON_FALLBACK=false
      5. Repeat request and assert success=false with explicit error message
    Expected Result: Controlled fallback and controlled failure both work
    Evidence: .sisyphus/evidence/task-3-fallback.json
  ```

  **Commit**: NO

---

- [ ] 4. Консолидировать ответ `runFullAnalysis` (один запрос вместо четырех)

  **What to do**:
  - Из `runFullAnalysis` возвращать сразу: `predictions`, `stationarity`, `forecast`, `dates`, `close`, `avg_price`
  - Устранить необходимость в немедленных `makePredictions/getDataPreview/analyzeStationarity`
  - Сохранить backward-safe поведение отдельных action endpoints

  **Must NOT do**:
  - Не менять смысл полей `comparison_table`, `best_model`, `forecast`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: точечное расширение API контракта
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: изменения backend-контракта

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with 3,6)
  - **Blocks**: 5,10
  - **Blocked By**: 3

  **References**:
  - `src/app/api/ml/route.ts:301` - текущий неполный ответ
  - `src/app/api/ml/route.ts:318` - where predictions are served from cache
  - `src/app/api/ml/route.ts:322` - where stationarity is served from cache
  - `src/app/api/ml/route.ts:243` - existing `getDataPreview` payload format
  - `scripts/ml_backend.py:1188` - полный python response

  **Acceptance Criteria**:
  - [ ] `runFullAnalysis` response содержит ключи: `predictions,stationarity,forecast,dates,close,avg_price`
  - [ ] Поля имеют совместимые типы с `ml-api.ts` и `page.tsx`
  - [ ] Старые отдельные action endpoint продолжают работать

  **Agent-Executed QA Scenarios**:

  ```text
  Scenario: Consolidated payload shape
    Tool: Bash (curl + jq)
    Preconditions: Next API route updated
    Steps:
      1. POST /api/ml action=runFullAnalysis
      2. Assert keys exist: data_info, comparison_table, best_model, predictions, stationarity, forecast, dates, close, avg_price
      3. Assert arrays dates/close/avg_price are same length
    Expected Result: One call returns all data needed by dashboard
    Evidence: .sisyphus/evidence/task-4-payload-shape.json

  Scenario: Legacy action compatibility
    Tool: Bash (curl)
    Preconditions: runFullAnalysis already executed once
    Steps:
      1. POST /api/ml action=makePredictions
      2. POST /api/ml action=analyzeStationarity
      3. Assert both return success=true with expected keys
    Expected Result: Legacy actions remain functional
    Evidence: .sisyphus/evidence/task-4-legacy-actions.json
  ```

  **Commit**: NO

---

- [ ] 5. Обновить клиент `ml-api.ts` и `page.tsx` под consolidated contract

  **What to do**:
  - Обновить типы/контракты в `src/lib/ml-api.ts`
  - В `handleRunAnalysis` использовать один `runFullAnalysis` для заполнения всего state
  - Удалить последовательные дополнительные вызовы из `page.tsx`

  **Must NOT do**:
  - Не менять UX flow кнопок и статусов
  - Не ломать `forecastFuture` кнопку и рендер future tab

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: локальный рефакторинг фронтенд-клиента без редизайна
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: аккуратная правка крупного клиентского компонента без UX-регрессий
  - **Skills Evaluated but Omitted**:
    - `playwright`: нужен на QA этапе, не на самой правке

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with 8)
  - **Blocks**: 10
  - **Blocked By**: 4

  **References**:
  - `src/app/page.tsx:290` - `handleRunAnalysis` current sequence
  - `src/app/page.tsx:327` - current call to `makePredictions`
  - `src/app/page.tsx:334` - current call to `getDataPreview`
  - `src/app/page.tsx:348` - current call to `analyzeStationarity`
  - `src/lib/ml-api.ts:100` - existing runFullAnalysis type

  **Acceptance Criteria**:
  - [ ] После клика "Запустить анализ" выполняется один API вызов для основного набора данных
  - [ ] `predictions`, `priceData`, `stationarity`, `futureForecast` корректно заполняются из одного ответа
  - [ ] UI после анализа визуально и функционально эквивалентен baseline

  **Agent-Executed QA Scenarios**:

  ```text
  Scenario: Single-request analysis flow in UI
    Tool: Playwright
    Preconditions: Dev server running; ML service available
    Steps:
      1. Open http://localhost:3000
      2. Click button with text "Запустить анализ"
      3. Wait until status text contains "Анализ завершён!"
      4. Collect network requests and count /api/ml calls during analysis flow
      5. Assert no immediate extra calls for makePredictions/getDataPreview/analyzeStationarity
      6. Screenshot dashboard after completion
    Expected Result: Analysis completes with reduced request count and same visible data blocks
    Evidence: .sisyphus/evidence/task-5-ui-single-flow.png

  Scenario: Error message preservation
    Tool: Playwright
    Preconditions: Temporarily force API failure (invalid ML endpoint config)
    Steps:
      1. Trigger analysis
      2. Wait for alert variant="destructive"
      3. Assert error text present and button re-enabled
    Expected Result: Error UX preserved
    Evidence: .sisyphus/evidence/task-5-ui-error.png
  ```

  **Commit**: NO

---

- [ ] 6. Оптимизировать загрузку MOEX и кешировать частые запросы

  **What to do**:
  - Реализовать bounded-concurrency пагинацию в `fetchMoexCandles()`
  - Добавить in-memory TTL cache:
    - health-check cache (например 5 минут)
    - data-preview cache по ключу `(from,till)` (например 60-120 сек)
  - Сохранить dedupe+sort поведение по дате

  **Must NOT do**:
  - Не менять итоговые значения `dates/close`
  - Не нарушить порядок дат и фильтрацию выходных

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: сетевой/perf рефакторинг с риском subtle data bugs
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `dev-browser`: не требуется браузерная автоматизация

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with 3,4)
  - **Blocks**: 10
  - **Blocked By**: 1

  **References**:
  - `src/app/api/ml/route.ts:101` - текущий `fetchMoexCandles`
  - `src/app/api/ml/route.ts:110` - последовательная pagination loop
  - `src/app/api/ml/route.ts:234` - healthCheck calling MOEX directly
  - External: `https://iss.moex.com/iss/reference/`

  **Acceptance Criteria**:
  - [ ] Для диапазона 2021-01-01..today latency `getDataPreview` снижен относительно baseline
  - [ ] Массивы `dates/close` идентичны baseline по length и значениям
  - [ ] Повторный healthCheck в TTL окне не делает лишний MOEX fetch

  **Agent-Executed QA Scenarios**:

  ```text
  Scenario: Large-range preview acceleration
    Tool: Bash (curl + timing)
    Preconditions: API route updated with optimized MOEX fetch
    Steps:
      1. POST /api/ml action=getDataPreview start_date=2021-01-01
      2. Measure response time for first request
      3. Repeat request with same params
      4. Measure second response time and verify it is faster (cache hit expected)
      5. Compare dates/close arrays with baseline snapshot
    Expected Result: Faster repeated call, identical data content
    Evidence: .sisyphus/evidence/task-6-moex-cache.json

  Scenario: Cache miss on new date range
    Tool: Bash (curl)
    Preconditions: Existing cache for one range
    Steps:
      1. Request a different date range
      2. Assert returned data differs by range and still sorted by date ascending
      3. Assert success=true
    Expected Result: Keyed cache works correctly per range
    Evidence: .sisyphus/evidence/task-6-cache-keying.json
  ```

  **Commit**: NO

---

- [ ] 7. Зафиксировать детерминизм и concurrency guardrails в ML-service

  **What to do**:
  - Seed reset (`random`, `numpy`, `tf`) на каждый запрос `/analyze` и `/forecast`
  - Сохранить `tf.keras.backend.clear_session()` перед обучением
  - Добавить защиту от параллельных TF вычислений (`asyncio.Lock` или single worker)

  **Must NOT do**:
  - Не менять содержимое функций оценки точности, walk-forward и realism metrics

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: correctness-critical changes under performance refactor
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: не относится к backend determinism

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with 2,9)
  - **Blocks**: 10
  - **Blocked By**: 2

  **References**:
  - `scripts/ml_backend.py:1212` - текущая seed инициализация в `main()`
  - `scripts/ml_backend.py:242` - `tf.keras.backend.clear_session()`
  - `scripts/ml_backend.py:608` - walk-forward weight selection block
  - External: `https://www.tensorflow.org/api_docs/python/tf/random/set_seed`
  - External: `https://docs.python.org/3/library/asyncio-sync.html#lock`

  **Acceptance Criteria**:
  - [ ] Два одинаковых запроса подряд дают идентичный результат в допуске
  - [ ] Параллельные запросы не вызывают race/crash и возвращают корректные ответы
  - [ ] Нет роста ошибок/NaN в ответах после нескольких последовательных запусков

  **Agent-Executed QA Scenarios**:

  ```text
  Scenario: Deterministic repeated analyze
    Tool: Bash (curl + python compare)
    Preconditions: FastAPI service running with per-request seed reset
    Steps:
      1. Send analyze payload A twice
      2. Save both responses
      3. Compare key metrics and predictions with epsilon <= 0.01
    Expected Result: Responses are deterministic within tolerance
    Evidence: .sisyphus/evidence/task-7-determinism.txt

  Scenario: Concurrent analyze requests
    Tool: Bash (parallel curl)
    Preconditions: Service running with lock/serialization strategy
    Steps:
      1. Fire 2-3 analyze requests concurrently
      2. Wait for all responses
      3. Assert each response success=true and valid JSON
      4. Assert no service crash in logs
    Expected Result: Stable behavior under concurrency
    Evidence: .sisyphus/evidence/task-7-concurrency.txt
  ```

  **Commit**: NO

---

- [ ] 8. Фронтенд micro-оптимизации без изменения UX

  **What to do**:
  - Debounce запись snapshot в localStorage
  - Проверить поведение tabs mount/unmount; если оптимизация no-op, зафиксировать это и не делать лишних правок
  - Сохранить текущий UI/таблицы/графики без визуальных изменений

  **Must NOT do**:
  - Не менять контент карточек, графиков и вкладок
  - Не добавлять редизайн

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: точечные perf-правки клиентского runtime
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: аккуратное изменение client-side поведения без UI regressions
  - **Skills Evaluated but Omitted**:
    - `playwright`: применяется только для проверки после правок

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with 5)
  - **Blocks**: 10
  - **Blocked By**: 5

  **References**:
  - `src/app/page.tsx:232` - localStorage snapshot effect
  - `src/app/page.tsx:816` - Tabs usage in dashboard
  - `src/components/ui/tabs.tsx:53` - `TabsContent` wrapper over Radix

  **Acceptance Criteria**:
  - [ ] Частота localStorage writes снижена (подтверждено метрикой в QA сценарии)
  - [ ] Переключение вкладок и графики работают как до изменений
  - [ ] Если tabs lazy уже встроен, это явно задокументировано в evidence

  **Agent-Executed QA Scenarios**:

  ```text
  Scenario: localStorage write reduction
    Tool: Playwright + browser evaluate
    Preconditions: Dashboard app running
    Steps:
      1. Open dashboard and monkey-patch localStorage.setItem counter in page context
      2. Trigger full analysis
      3. Wait for completion
      4. Read counter value and compare with baseline run
    Expected Result: Fewer write operations than baseline
    Evidence: .sisyphus/evidence/task-8-localstorage-count.json

  Scenario: Tabs behavior validation
    Tool: Playwright
    Preconditions: Analysis data loaded
    Steps:
      1. Switch through all tabs (forecast/comparison/analysis/future)
      2. Assert chart containers render without errors
      3. Capture console and ensure no new runtime errors
    Expected Result: UX unchanged; no regressions
    Evidence: .sisyphus/evidence/task-8-tabs.png
  ```

  **Commit**: NO

---

- [ ] 9. Интегрировать запуск/сборку FastAPI в существующие скрипты

  **What to do**:
  - Обновить `.zscripts/start.sh` для запуска FastAPI вместе с Next.js
  - Обновить `.zscripts/build.sh` для упаковки ML-service артефактов
  - Убедиться, что stop/cleanup корректно завершает и FastAPI процесс

  **Must NOT do**:
  - Не ломать запуск mini-services/Caddy
  - Не менять внешнюю сеть Caddy (FastAPI не должен быть публичным)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: deployment/runtime orchestration with multi-process lifecycle
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `playwright`: не нужен для shell orchestration

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with 2,7)
  - **Blocks**: 10
  - **Blocked By**: 1

  **References**:
  - `.zscripts/start.sh:62` - запуск Next.js процесса
  - `.zscripts/start.sh:13` - cleanup lifecycle
  - `.zscripts/build.sh:55` - сбор артефактов
  - `Caddyfile:15` - публичный reverse proxy маршрут
  - `scripts/start-standalone.mjs:44` - standalone запуск сервера

  **Acceptance Criteria**:
  - [ ] `start.sh` поднимает Next + FastAPI + Caddy без ручных шагов
  - [ ] `Ctrl+C`/cleanup останавливает оба процесса
  - [ ] build artifact включает ML-service файлы для production старта

  **Agent-Executed QA Scenarios**:

  ```text
  Scenario: Multi-process startup and shutdown
    Tool: interactive_bash (tmux)
    Preconditions: Updated start script available
    Steps:
      1. Run sh .zscripts/start.sh
      2. Assert Next.js responds on port 3000
      3. Assert FastAPI health endpoint responds on localhost internal port
      4. Send Ctrl+C
      5. Assert both processes terminated
    Expected Result: Clean lifecycle management
    Evidence: .sisyphus/evidence/task-9-start-stop.txt

  Scenario: Build artifact includes ML-service
    Tool: Bash
    Preconditions: Updated build script
    Steps:
      1. Run sh .zscripts/build.sh
      2. Inspect produced tar.gz content
      3. Assert ML-service files and startup hooks are present
    Expected Result: Production package contains all required components
    Evidence: .sisyphus/evidence/task-9-build-artifact.txt
  ```

  **Commit**: NO

---

- [ ] 10. Финальная регрессия и performance report (before/after)

  **What to do**:
  - Выполнить полный regression прогон: API + UI + fallback + large-range
  - Сравнить before/after latency и accuracy
  - Сформировать финальный отчет в `.sisyphus/evidence/perf-final-report.md`

  **Must NOT do**:
  - Не закрывать задачу без evidence-файлов и численного сравнения

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: комплексная верификация + синтез метрик
  - **Skills**: [`playwright`]
    - `playwright`: end-to-end UI verification и evidence screenshot
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: не требуется дизайн-правки

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: 3,4,5,6,7,8,9

  **References**:
  - `.sisyphus/evidence/perf-baseline.json` - baseline для сравнения
  - `src/app/page.tsx:367` - future forecast flow
  - `src/app/api/ml/route.ts:350` - final error handler contract
  - `scripts/ml_backend.py:1091` - analyze pipeline

  **Acceptance Criteria**:
  - [ ] Создан `.sisyphus/evidence/perf-final-report.md` с before/after таблицей
  - [ ] p95 `runFullAnalysis` улучшен относительно baseline
  - [ ] Accuracy regression checks в пределах допуска
  - [ ] UI smoke тесты и API negative тесты пройдены

  **Agent-Executed QA Scenarios**:

  ```text
  Scenario: End-to-end dashboard flow after optimization
    Tool: Playwright
    Preconditions: Full stack running with optimized path
    Steps:
      1. Open dashboard
      2. Trigger run analysis
      3. Wait for completion
      4. Open each tab and assert core data blocks present
      5. Trigger future forecast button and assert chart + table updates
      6. Capture screenshots and console logs
    Expected Result: User-visible behavior unchanged
    Evidence: .sisyphus/evidence/task-10-e2e.png

  Scenario: API performance + correctness final comparison
    Tool: Bash (curl + node/python compare)
    Preconditions: Baseline evidence exists
    Steps:
      1. Re-run timed API suite (same payloads as baseline)
      2. Compare p50/p95/avg against baseline
      3. Compare key metric fields and forecast arrays in tolerance
      4. Save markdown report with numbers and pass/fail markers
    Expected Result: Faster API with preserved correctness
    Evidence: .sisyphus/evidence/perf-final-report.md
  ```

  **Commit**: NO

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 2+7 | `refactor(ml): introduce persistent fastapi service runtime` | ml service files + python wrappers | FastAPI health + analyze scenario |
| 3+4 | `refactor(api): route through fastapi and consolidate analysis payload` | `src/app/api/ml/route.ts` | curl contract checks |
| 5+8 | `perf(frontend): consume single analysis response and reduce local overhead` | `src/lib/ml-api.ts`, `src/app/page.tsx` | Playwright smoke + network assertions |
| 6 | `perf(data): optimize moex pagination and cache hot paths` | `src/app/api/ml/route.ts` | large-range timing + data equivalence |
| 9 | `chore(runtime): wire ml service into build and start scripts` | `.zscripts/*` | start/stop/build artifact checks |
| 10 | `docs(perf): add before-after report and evidence index` | `.sisyphus/evidence/*` | report consistency checks |

> If repository stays non-git for this session: keep commit actions as `NO-OP` and retain the grouping as logical checkpoints.

---

## Success Criteria

### Verification Commands

```bash
# API health
curl -s http://localhost:3000/api/ml -X POST -H "Content-Type: application/json" -d '{"action":"healthCheck"}'

# Run analysis (fixed payload)
curl -s http://localhost:3000/api/ml -X POST -H "Content-Type: application/json" -d '{"action":"runFullAnalysis","params":{"start_date":"2023-01-01","end_date":"2024-01-01","look_back":60,"lstm_units":[50,50],"epochs":30,"batch_size":32}}'

# Forecast non-30 path
curl -s http://localhost:3000/api/ml -X POST -H "Content-Type: application/json" -d '{"action":"forecastFuture","params":{"days":90}}'

# Build verification
bun run build
```

### Final Checklist
- [ ] Все Must Have выполнены
- [ ] Все Must NOT Have соблюдены
- [ ] Evidence-файлы собраны для всех ключевых сценариев
- [ ] Нет human-only acceptance criteria
- [ ] Зафиксировано измеримое ускорение API
- [ ] Зафиксировано отсутствие существенной accuracy деградации
