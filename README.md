# Load Tests - k6

Projeto de testes de carga e performance utilizando [k6](https://k6.io/) para avaliação de desempenho de APIs REST, com geração de relatórios [Allure](https://allurereport.org/).

## Descrição

Este projeto contém scripts de teste de carga para validar a performance de APIs sob diferentes condições de tráfego:

- **Load Test**: Teste de carga com 500 usuários simultâneos por 5 minutos
- **Stress Test**: Teste de estresse para encontrar o ponto de ruptura (até 2000 VUs)
- **Spike Test**: Teste de pico para avaliar comportamento sob surtos repentinos de tráfego
- **Allure Reports**: Conversão automática dos resultados k6 para relatórios Allure com métricas detalhadas

API alvo: [Reqres.in](https://reqres.in) (API pública de mock)

## Arquitetura / Estrutura de Pastas

```
load-tests-k6/
├── scripts/
│   ├── load-test.js                # Teste de carga (500 VUs, 5 min)
│   ├── stress-test.js              # Teste de estresse (até 2000 VUs)
│   ├── spike-test.js               # Teste de pico (spike de 10→500 VUs)
│   └── generate-allure-report.js   # Conversor k6 → Allure Results
├── reports/                        # Relatórios JSON do k6 (gitignored)
├── allure-results/                 # Resultados Allure gerados (gitignored)
├── allure-report/                  # Relatório Allure HTML (gitignored)
├── package.json                    # Dependências para Allure
├── .env                            # API key (gitignored)
├── .env.example                    # Exemplo de configuração
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

## Como Executar os Testes

### Configurar API Key

Configure a chave de API no arquivo `.env`:

```bash
cp .env.example .env
# Editar .env com sua API key
```

Ou passe como variável de ambiente:

```bash
# Windows (PowerShell)
$env:REQRES_API_KEY="sua_api_key_aqui"

# Linux/macOS
export REQRES_API_KEY="sua_api_key_aqui"
```

### Teste de Carga (principal)

```bash
k6 run -e REQRES_API_KEY=sua_api_key scripts/load-test.js
```

Simula **500 usuários simultâneos** por **5 minutos** com ramp-up e ramp-down graduais.

Fases:
| Fase      | Duração | VUs  | Descrição           |
|-----------|---------|------|---------------------|
| Ramp-up 1 | 30s     | 100  | Aquecimento         |
| Ramp-up 2 | 30s     | 250  | Crescimento         |
| Ramp-up 3 | 30s     | 500  | Atingindo pico      |
| Sustain   | 3m      | 500  | Carga sustentada    |
| Ramp-down | 1m      | 0    | Encerramento        |

### Teste de Estresse

```bash
k6 run -e REQRES_API_KEY=sua_api_key scripts/stress-test.js
```

Escala progressivamente de 100 até **2000 VUs** para identificar o ponto de ruptura.

### Teste de Pico (Spike)

```bash
k6 run -e REQRES_API_KEY=sua_api_key scripts/spike-test.js
```

Simula um surto repentino de tráfego (10 → 500 VUs em 10 segundos).

## Allure Reports

### Fluxo completo

```bash
# 1. Executar o teste (gera JSON em reports/)
k6 run -e REQRES_API_KEY=sua_api_key scripts/load-test.js

# 2. Converter resultados para Allure + gerar relatório HTML
npm run allure:generate

# 3. Visualizar relatório
npm run allure:open
```

### Servir relatório temporário

```bash
npm run allure:serve
```

### O que é gerado no Allure Report

Para cada tipo de teste (load, stress, spike), o conversor gera os seguintes test cases no Allure:

| Test Case | Descrição | Severidade |
|-----------|-----------|------------|
| Validação de Thresholds | Verifica se todos os critérios de aprovação foram atingidos | critical |
| Métricas de Performance HTTP | Análise de tempos de resposta (avg, med, p90, p95, p99, max) | blocker |
| Taxa de Erros | Taxa de requisições com falha e erros customizados | critical |
| Throughput e Capacidade | Total de requisições, req/s, iterações e VUs | normal |
| Checks por Grupo | Validações funcionais executadas durante o teste | normal |
| Métricas por Endpoint | Performance detalhada de cada endpoint testado | normal |

### Anotações Allure

Cada test case inclui:

- **Epic**: "Testes de Carga"
- **Feature**: Nome do teste (ex: "Load Test - 500 VUs")
- **Story**: Aspecto específico (ex: "Validação de Thresholds")
- **Severity**: Blocker, Critical ou Normal
- **Owner**: "QA Team"
- **Tags**: Performance, LoadTest, k6
- **Steps**: Cada métrica e check como um step com status passed/failed
- **Description**: Descrição em Markdown com tabelas de métricas

## Métricas Monitoradas

### Thresholds (Critérios de Aprovação)

| Métrica              | Critério                        |
|----------------------|---------------------------------|
| http_req_duration    | p(95) < 2s, p(99) < 5s         |
| http_req_failed      | Taxa de falha < 5%              |
| errors               | Taxa de erro customizada < 10%  |
| list_users_duration  | p(95) < 3s                      |
| single_user_duration | p(95) < 2s                      |
| create_user_duration | p(95) < 3s                      |
| login_duration       | p(95) < 2s                      |

### Métricas Customizadas

- **errors**: Taxa de erros por check
- **list_users_duration**: Tempo de resposta do endpoint de listagem
- **single_user_duration**: Tempo de resposta do endpoint de usuário único
- **create_user_duration**: Tempo de resposta do endpoint de criação
- **login_duration**: Tempo de resposta do endpoint de login
- **total_requests**: Contador total de requisições

## Endpoints Testados

| Método | Endpoint         | Descrição                |
|--------|------------------|--------------------------|
| GET    | /api/users       | Listagem de usuários     |
| GET    | /api/users/:id   | Busca de usuário por ID  |
| POST   | /api/users       | Criação de usuário       |
| POST   | /api/login       | Autenticação             |

## Análise de Resultados

Após a execução, o k6 apresenta um resumo com:

- **http_req_duration**: Distribuição dos tempos de resposta (avg, med, p90, p95, p99, max)
- **http_reqs**: Total de requisições e taxa (req/s)
- **http_req_failed**: Percentual de requisições com falha
- **iterations**: Total de iterações completadas
- **vus**: Número de Virtual Users ao longo do tempo
- **checks**: Taxa de verificações aprovadas/reprovadas

### Possíveis Gargalos Identificáveis

1. **Aumento de latência sob carga**: Se p95 > 2s, indica saturação do servidor
2. **Taxa de erro crescente**: Se erros > 5%, o servidor não suporta a carga
3. **Timeout**: Requisições que excedem o timeout indicam indisponibilidade
4. **Degradação progressiva**: Comparar tempos do ramp-up vs sustain indica se há acúmulo de conexões

## Boas Práticas Aplicadas

- **Ramp-up gradual**: Evita sobrecarga repentina, simulando crescimento natural
- **Métricas customizadas**: Monitoramento granular por endpoint
- **Thresholds definidos**: Critérios objetivos de aprovação/reprovação
- **Checks por grupo**: Validação funcional durante o teste de carga
- **Sleep entre requests**: Simula think time realista do usuário
- **Múltiplos cenários**: Load, Stress e Spike para cobertura completa
- **Allure Reports**: Visualização rica dos resultados com steps, severidades e descrições
- **handleSummary**: Exportação automática de JSON para processamento posterior
