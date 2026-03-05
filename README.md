# Load Tests - k6

Projeto de testes de carga e performance utilizando [k6](https://k6.io/) para avaliação de desempenho de APIs REST, com geração de relatórios [Allure](https://allurereport.org/), CI/CD via GitHub Actions e integração com stacks de observabilidade.

## Descrição

Este projeto contém scripts de teste de carga para validar a performance de APIs sob diferentes condições de tráfego:

- **Load Test**: Teste de carga com VUs configuráveis (default 500) por duração parametrizável
- **Stress Test**: Teste de estresse para encontrar o ponto de ruptura (default até 2000 VUs)
- **Spike Test**: Teste de pico para avaliar comportamento sob surtos repentinos de tráfego
- **Scenarios Test**: Cenários realistas com `constant-arrival-rate` e `ramping-arrival-rate` para modelar throughput
- **Allure Reports**: Conversão automática dos resultados k6 para relatórios Allure
- **GitHub Actions**: Pipeline com execução manual, agendada e quality gate por thresholds
- **Observabilidade**: Integração com InfluxDB, Prometheus e Grafana Cloud

API alvo: [Reqres.in](https://reqres.in) (API pública de mock)

## Arquitetura / Estrutura de Pastas

```
load-tests-k6/
├── .github/
│   └── workflows/
│       └── load-tests.yml             # Pipeline CI/CD (manual + nightly)
├── scripts/
│   ├── load-test.js                   # Teste de carga (VU-based, parametrizável)
│   ├── stress-test.js                 # Teste de estresse (escalonamento progressivo)
│   ├── spike-test.js                  # Teste de pico (spike repentino)
│   ├── scenarios-test.js              # Cenários arrival-rate (throughput-based)
│   └── generate-allure-report.js      # Conversor k6 → Allure Results
├── docs/
│   └── observability.md               # Guia InfluxDB/Prometheus/Grafana
├── reports/                           # Relatórios JSON do k6 (gitignored)
├── allure-results/                    # Resultados Allure gerados (gitignored)
├── allure-report/                     # Relatório Allure HTML (gitignored)
├── package.json
├── .env.example                       # Variáveis de configuração
├── .gitignore
└── README.md
```

## Versões Utilizadas

| Tecnologia | Versão  |
|------------|---------|
| k6         | >= 0.50 |
| Node.js    | >= 20.x |
| Allure CLI | >= 2.x  |

## Pré-requisitos

- [k6](https://k6.io/docs/get-started/installation/) instalado no sistema
- [Node.js](https://nodejs.org/) versão 20+ (para geração de Allure Reports)
- Java Runtime (JRE) 8+ para o Allure CLI

### Instalação do k6

**Windows (Chocolatey):**
```bash
choco install k6
```

**Windows (winget):**
```bash
winget install k6 --source winget
```

**macOS:**
```bash
brew install k6
```

**Linux (Debian/Ubuntu):**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### Instalação das dependências Node.js

```bash
npm install
```

## Parametrização via Variáveis de Ambiente

Todos os scripts suportam parametrização via variáveis de ambiente, permitindo ajustar o workload sem alterar código:

| Variável | Descrição | Default | Scripts |
|----------|-----------|---------|---------|
| `K6_BASE_URL` | URL base da API alvo | `https://reqres.in/api` | Todos |
| `K6_VUS` | Número de Virtual Users | Varia por script | load, stress, spike |
| `K6_DURATION` | Duração do teste | Varia por script | Todos |
| `K6_RAMP_UP` | Duração do ramp-up | `30s` | load, scenarios |
| `K6_RATE` | Taxa req/s (arrival-rate) | `20` | scenarios |
| `REQRES_API_KEY` | API key da Reqres.in | - | Todos |

**Exemplo de uso:**

```bash
# Load test com 200 VUs por 2 minutos apontando para outra API
k6 run -e K6_VUS=200 -e K6_DURATION=2m -e K6_BASE_URL=https://minha-api.com/api \
  -e REQRES_API_KEY=reqres_7b4880206ffa4e6b8429a7291998c7c5 scripts/load-test.js

# Scenarios test com throughput de 50 req/s
k6 run -e K6_RATE=50 -e K6_DURATION=5m \
  -e REQRES_API_KEY=reqres_7b4880206ffa4e6b8429a7291998c7c5 scripts/scenarios-test.js
```

## Como Executar os Testes

### Configurar API Key

```bash
cp .env.example .env
```

Ou passe como variável de ambiente:

```bash
# Windows (PowerShell)
$env:REQRES_API_KEY="reqres_7b4880206ffa4e6b8429a7291998c7c5"

# Linux/macOS
export REQRES_API_KEY="reqres_7b4880206ffa4e6b8429a7291998c7c5"
```

### Teste de Carga (VU-based)

```bash
k6 run -e REQRES_API_KEY=reqres_7b4880206ffa4e6b8429a7291998c7c5 scripts/load-test.js
```

Default: **500 VUs** por **3 minutos** com ramp-up gradual.

| Fase | Duração | VUs | Descrição |
|------|---------|-----|-----------|
| Ramp-up 1 | 30s | 20% do total | Aquecimento |
| Ramp-up 2 | 30s | 50% do total | Crescimento |
| Ramp-up 3 | 30s | 100% | Atingindo pico |
| Sustain | 3m | 100% | Carga sustentada |
| Ramp-down | 1m | 0 | Encerramento |

### Teste de Estresse

```bash
k6 run -e REQRES_API_KEY=reqres_7b4880206ffa4e6b8429a7291998c7c5 scripts/stress-test.js
```

Escala progressivamente de 5% até **100%** do `K6_VUS` (default 2000) para encontrar o ponto de ruptura.

### Teste de Pico (Spike)

```bash
k6 run -e REQRES_API_KEY=reqres_7b4880206ffa4e6b8429a7291998c7c5 scripts/spike-test.js
```

Simula um surto repentino de tráfego de baseline para pico (default 500 VUs em 10 segundos).

### Teste de Cenários (Arrival-Rate)

```bash
k6 run -e REQRES_API_KEY=reqres_7b4880206ffa4e6b8429a7291998c7c5 scripts/scenarios-test.js
```

Utiliza executors avançados do k6 para modelar **throughput real** em vez de apenas VUs:

| Cenário | Executor | Descrição |
|---------|----------|-----------|
| `constant_throughput` | `constant-arrival-rate` | Taxa fixa de req/s durante todo o teste |
| `ramping_throughput` | `ramping-arrival-rate` | Taxa crescente de req/s com estágios |
| `soak_baseline` | `constant-arrival-rate` | Carga baixa contínua (soak/baseline) |

### Executar todos os testes

```bash
npm run test:all
```

## GitHub Actions (CI/CD)

### Execução Manual (workflow_dispatch)

1. Vá em **Actions > Performance Tests (k6)** no repositório
2. Clique em **Run workflow**
3. Configure os parâmetros:
   - **Cenário**: load, stress, spike, scenarios ou all
   - **VUs**: Número de Virtual Users (opcional)
   - **Duration**: Duração do teste (opcional)
   - **Base URL**: URL da API alvo (opcional)
   - **Ramp-up**: Duração do ramp-up (opcional)
   - **Rate**: Taxa req/s para arrival-rate (opcional)

### Execução Agendada (Nightly)

A pipeline executa automaticamente de segunda a sexta às 03:00 UTC com o cenário `load` e configurações default.

### Quality Gate (Threshold Gating)

Se qualquer threshold do k6 falhar, o step do k6 retorna exit code != 0, quebrando a pipeline automaticamente. Isso garante que builds com performance degradada não passem.

### Artefatos Gerados

| Artefato | Conteúdo | Retenção |
|----------|----------|----------|
| `k6-json-reports-{run}` | JSONs raw do k6 com todas as métricas | 30 dias |
| `allure-results-{run}` | Resultados Allure para histórico | 30 dias |
| `allure-report-{run}` | Relatório HTML completo | 30 dias |

### Secrets Necessários

| Secret | Descrição |
|--------|-----------|
| `REQRES_API_KEY` | API key da Reqres.in |
| `INFLUXDB_URL` | URL do InfluxDB (opcional, para observabilidade) |
| `PROMETHEUS_RW_URL` | URL do Prometheus remote write (opcional) |

## Allure Reports

### Fluxo completo

```bash
# 1. Executar o teste
k6 run -e REQRES_API_KEY=reqres_7b4880206ffa4e6b8429a7291998c7c5 scripts/load-test.js

# 2. Converter resultados para Allure + gerar relatório HTML
npm run allure:generate

# 3. Visualizar relatório
npm run allure:open
```

### O que é gerado no Allure Report

Para cada tipo de teste, o conversor gera os seguintes test cases:

| Test Case | Descrição | Severidade |
|-----------|-----------|------------|
| Validação de Thresholds | Verifica se todos os critérios de aprovação foram atingidos | critical |
| Métricas de Performance HTTP | Análise de tempos de resposta (avg, med, p90, p95, p99, max) | blocker |
| Taxa de Erros | Taxa de requisições com falha e erros customizados | critical |
| Throughput e Capacidade | Total de requisições, req/s, iterações e VUs | normal |
| Checks por Grupo | Validações funcionais executadas durante o teste | normal |
| Métricas por Endpoint | Performance detalhada de cada endpoint testado | normal |

## Observabilidade

O projeto suporta exportação de métricas em tempo real para dashboards. Veja o guia completo em [`docs/observability.md`](docs/observability.md).

### Resumo rápido

**InfluxDB + Grafana (local):**
```bash
k6 run --out influxdb=http://localhost:8086/k6 \
  -e REQRES_API_KEY=reqres_7b4880206ffa4e6b8429a7291998c7c5 scripts/load-test.js
```

**Prometheus Remote Write:**
```bash
k6 run --out experimental-prometheus-rw \
  -e K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
  -e REQRES_API_KEY=reqres_7b4880206ffa4e6b8429a7291998c7c5 scripts/load-test.js
```

**Grafana Cloud:**
```bash
k6 run --out experimental-prometheus-rw \
  -e K6_PROMETHEUS_RW_SERVER_URL=https://prometheus-prod-xx.grafana.net/api/prom/push \
  -e K6_PROMETHEUS_RW_USERNAME=seu_user_id \
  -e K6_PROMETHEUS_RW_PASSWORD=seu_token \
  -e REQRES_API_KEY=reqres_7b4880206ffa4e6b8429a7291998c7c5 scripts/load-test.js
```

## Métricas Monitoradas

### Thresholds (Critérios de Aprovação)

| Métrica | Critério |
|---------|----------|
| http_req_duration | p(95) < 2s, p(99) < 5s |
| http_req_failed | Taxa de falha < 5% |
| errors | Taxa de erro customizada < 10% |
| list_users_duration | p(95) < 3s |
| single_user_duration | p(95) < 2s |
| create_user_duration | p(95) < 3s |
| login_duration | p(95) < 2s |
| browsing_duration | p(95) < 2.5s (scenarios) |
| api_call_duration | p(95) < 3s (scenarios) |

### Thresholds por Cenário (scenarios-test)

| Cenário | Métrica | Critério |
|---------|---------|----------|
| constant_throughput | http_req_duration | p(95) < 2.5s |
| ramping_throughput | http_req_duration | p(95) < 3.5s |
| soak_baseline | http_req_duration | p(95) < 2s |

## Endpoints Testados

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | /api/users | Listagem de usuários |
| GET | /api/users/:id | Busca de usuário por ID |
| POST | /api/users | Criação de usuário |
| POST | /api/login | Autenticação |

## Scripts NPM

| Comando | Descrição |
|---------|-----------|
| `npm run test:load` | Executa teste de carga |
| `npm run test:stress` | Executa teste de estresse |
| `npm run test:spike` | Executa teste de pico |
| `npm run test:scenarios` | Executa teste de cenários (arrival-rate) |
| `npm run test:all` | Executa todos os testes sequencialmente |
| `npm run allure:generate` | Gera relatório Allure a partir dos JSONs |
| `npm run allure:open` | Abre relatório Allure no navegador |
| `npm run allure:serve` | Serve relatório Allure temporário |

## Boas Práticas Aplicadas

- **Ramp-up gradual**: Evita sobrecarga repentina, simulando crescimento natural
- **Parametrização via env**: Workload configurável sem alterar código
- **Arrival-rate scenarios**: Modela throughput real, não apenas VUs
- **Threshold gating**: Pipeline quebra se critérios de performance não forem atingidos
- **Métricas customizadas**: Monitoramento granular por endpoint
- **Múltiplos cenários**: Load, Stress, Spike e Arrival-rate para cobertura completa
- **Observabilidade**: Integração com InfluxDB, Prometheus e Grafana Cloud
- **Allure Reports**: Visualização rica dos resultados
- **CI/CD**: Execução automatizada com artifacts e quality gates
