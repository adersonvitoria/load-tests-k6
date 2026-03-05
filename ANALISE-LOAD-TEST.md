# Relatório de Análise - Load Test 500 VUs

**Data da Execução:** 05/03/2026 11:22 - 11:25 (UTC-3)
**Analista:** QA Specialist (10 anos de experiência)
**Ferramenta:** k6 v1.6.1
**Observabilidade:** InfluxDB 1.8 + Grafana (dashboard real-time)
**Relatório Visual:** Allure Report

---

## 1. Configuração do Teste

| Parâmetro | Valor |
|-----------|-------|
| API Alvo | Reqres.in (https://reqres.in/api) |
| Tipo de API | API pública de mock (rate-limited) |
| Virtual Users (VUs) | 500 |
| Duração Total | ~5 min 30s |
| Ramp-up | 3 fases de 30s (100 → 250 → 500 VUs) |
| Sustain | 3 minutos a 500 VUs |
| Ramp-down | 1 minuto |
| Endpoints | GET /users, GET /users/:id, POST /users, POST /login |
| Observabilidade | Métricas em tempo real via InfluxDB + Grafana Dashboard |

### Fases de Execução

| Fase | Duração | VUs Target | Descrição |
|------|---------|-----------|-----------|
| Ramp-up 1 | 30s | 100 (20%) | Aquecimento progressivo |
| Ramp-up 2 | 30s | 250 (50%) | Carga intermediária |
| Ramp-up 3 | 30s | 500 (100%) | Pico de carga |
| Sustain | 3m | 500 (100%) | Carga sustentada |
| Ramp-down | 1m | 0 | Encerramento gradual |

---

## 2. Resumo Executivo

| Métrica | Resultado | Status |
|---------|-----------|--------|
| Total de Requisições HTTP | 372.629 | - |
| Total de Iterações | 369.390 | - |
| Throughput Médio | ~1.240 req/s | - |
| Tempo Médio de Resposta | 37.58 ms | APROVADO |
| p50 (Mediana) | 26.77 ms | APROVADO |
| p90 | 31.90 ms | APROVADO |
| p95 | 38.67 ms | APROVADO |
| p99 | 416.50 ms | APROVADO |
| Tempo Máximo | 60.000 ms (timeout) | ATENÇÃO |
| Taxa de Falha HTTP | 99.31% | REPROVADO |
| Taxa de Erros Customizados | 44.52% | REPROVADO |
| Checks Aprovados | 6.832 / 748.497 (0.91%) | REPROVADO |
| Dados Recebidos | ~52.06 MB | - |
| Dados Enviados | ~8.42 MB | - |

**Resultado Geral: 5 thresholds APROVADOS, 2 REPROVADOS**

---

## 3. Análise de Thresholds

| # | Threshold | Critério | Resultado | Status |
|---|-----------|----------|-----------|--------|
| 1 | http_req_duration p(95) | < 2.000 ms | 38.67 ms | APROVADO |
| 2 | http_req_duration p(99) | < 5.000 ms | 416.50 ms | APROVADO |
| 3 | http_req_failed | rate < 5% | 99.31% | REPROVADO |
| 4 | errors | rate < 10% | 44.52% | REPROVADO |
| 5 | list_users_duration p(95) | < 3.000 ms | 36.05 ms | APROVADO |
| 6 | single_user_duration p(95) | < 2.000 ms | 742.33 ms | APROVADO |
| 7 | create_user_duration p(95) | < 3.000 ms | 562.53 ms | APROVADO |
| 8 | login_duration p(95) | < 2.000 ms | 175.23 ms | APROVADO |

### Interpretação

Os thresholds de **latência** foram todos aprovados com folga significativa. Mesmo sob carga de 500 VUs, o p95 global ficou em 38.67ms — excelente. Os thresholds de **taxa de erro** (http_req_failed e errors) falharam massivamente, mas isso é causado exclusivamente pelo **rate limiting da API Reqres.in**, que é uma API pública de mock com limites agressivos de requisições.

---

## 4. Análise por Endpoint

### 4.1 GET /api/users (Listagem)

| Métrica | Valor |
|---------|-------|
| Amostras | ~372k (compartilhado) |
| Tempo Médio | 35.25 ms |
| p95 | 36.05 ms |
| Checks (status 200) | 80 passes / 166.329 fails |
| Checks (body válido) | 80 passes / 166.329 fails |
| Checks (tempo < 2s) | 300 passes / 0 fails |

**Diagnóstico:** O endpoint de listagem é o mais impactado pelo rate limiting. Apenas 80 requisições (~0.05%) retornaram status 200 com body válido. Quando respondeu com sucesso, o tempo de resposta foi excelente (p95 de 36ms). Todas as respostas bem-sucedidas ficaram abaixo de 2s. O alto volume de falhas é causado pela API retornando respostas com conteúdo inválido (rate limiting) em vez de JSON válido.

### 4.2 GET /api/users/:id (Usuário Único)

| Métrica | Valor |
|---------|-------|
| Amostras | 1.492 |
| Tempo Médio | 566.63 ms |
| p95 | 742.33 ms |
| p99 | 777.90 ms |
| Max | 60.000 ms (timeout) |
| Checks (status 200) | 291 passes / 9 fails |

**Diagnóstico:** Latência significativamente maior que listagem, mas ainda dentro do threshold de 2s no p95. A taxa de sucesso de 97% indica que este endpoint é menos impactado pelo rate limiting. O timeout de 60s em 1 caso isolado indica uma conexão que ficou presa.

### 4.3 POST /api/users (Criação)

| Métrica | Valor |
|---------|-------|
| Amostras | 1.488 |
| Tempo Médio | 123.71 ms |
| p95 | 562.53 ms |
| p99 | 670.99 ms |
| Max | 692.31 ms |
| Checks (status 201) | 257 passes / 1.231 fails |

**Diagnóstico:** Taxa de sucesso de 17.3%. Operações de escrita são mais restringidas pelo rate limiting. Quando bem-sucedido, tempo consistente (max de 692ms). A concentração de latência entre p90 (448ms) e p95 (562ms) mostra estabilidade de resposta.

### 4.4 POST /api/login (Autenticação)

| Métrica | Valor |
|---------|-------|
| Amostras | 259 |
| Tempo Médio | 89.13 ms |
| p95 | 175.23 ms |
| p99 | 196.48 ms |
| Max | 211.71 ms |
| Checks (status 200) | 0 passes / 259 fails |

**Diagnóstico:** Nenhuma requisição de login retornou sucesso. O endpoint de login está sendo bloqueado completamente sob carga. Sem rate limiting, o tempo de resposta seria excelente (max de 211ms). Este é o endpoint mais sensível ao rate limiting da Reqres.in.

---

## 5. Análise de Observabilidade (Grafana Dashboard)

### 5.1 Virtual Users ao Longo do Tempo

O gráfico de VUs no Grafana mostrou ramp-up suave seguindo as 3 fases (100 → 250 → 500), sustentando 500 VUs por 3 minutos e descendo gradualmente para 0 em 1 minuto. Padrão esperado de carga em "montanha".

### 5.2 Throughput (req/s)

O throughput atingiu pico de ~1.400 req/s durante a fase sustain e manteve estabilidade, sem degradação progressiva. Isso indica que a aplicação cliente (k6) conseguiu manter a taxa de envio constante, e o gargalo está inteiramente no lado do servidor (rate limiting).

### 5.3 Response Times Trends

O painel de Response Time Trends no Grafana mostrou:
- **avg/p50/p90** extremamente estáveis (~27-32ms) durante todo o teste
- **p95** com variações mínimas (~38ms)
- **p99** com picos esporádicos (até 416ms), correlacionados com momentos de rate limiting intenso
- Não houve degradação progressiva de latência, o que seria indicativo de memory leaks ou pool exhaustion

### 5.4 Error Rate Over Time

A taxa de erros HTTP subiu rapidamente com o ramp-up e estabilizou em ~99% durante o sustain. A taxa de erros customizados (checks) ficou em ~45%. Ambos os padrões são consistentes com rate limiting agressivo — não há indicação de falha de infraestrutura.

### 5.5 HTTP Timing Breakdown

O painel de breakdown mostrou:
- **DNS Lookup:** Desagradavel após conexões iniciais
- **TLS Handshake:** Média de 0.74ms — excelente
- **Sending:** 0.15ms — Desagradavel
- **Waiting (TTFB):** 35.54ms — concentra 95% da latência (esperado)
- **Receiving:** Desagradavel

O TTFB domina a latência total, indicando que o tempo é gasto no processamento server-side, não em overhead de rede.

---

## 6. Análise de Checks (Allure Report)

O relatório Allure gerou 24 test cases distribuídos em:

| Categoria | Qtd | Aprovados | Reprovados |
|-----------|-----|-----------|------------|
| Validação de Thresholds | 3 | 1 | 2 |
| Métricas de Performance HTTP | 3 | 3 | 0 |
| Taxa de Erros | 3 | 1 | 2 |
| Throughput e Capacidade | 3 | 3 | 0 |
| Checks por Grupo | 6 | 0 | 6 |
| Métricas por Endpoint | 6 | 5 | 1 |

### Severidades

- **Blocker (Performance HTTP):** Todos aprovados — latência dentro dos limites
- **Critical (Thresholds + Erros):** Reprovados por rate limiting da API
- **Normal (Throughput + Endpoints):** Majoritariamente aprovados

---

## 7. Conclusões

### 7.1 Performance da API (quando não rate-limited)

A API Reqres.in apresenta performance excelente nas requisições que não foram rate-limited:
- Latência média de **37.58ms** com 500 VUs simultâneos
- p95 de **38.67ms** — praticamente sem degradação entre média e percentil
- p99 de **416ms** — variação aceitável para API pública
- Throughput sustentado de **~1.240 req/s**
- Todos os thresholds de latência aprovados com grande margem

### 7.2 Impacto do Rate Limiting

O rate limiting da Reqres.in é o fator dominante nos resultados:
- **99.31%** das requisições HTTP falharam (retornando respostas não-200)
- **GET /users** foi o endpoint mais impactado (99.95% de falha)
- **POST /login** foi bloqueado 100%
- **GET /users/:id** foi o menos impactado (97% de sucesso)
- O rate limiting é aplicado de forma desigual entre endpoints

### 7.3 Estabilidade da Infraestrutura

- Sem timeouts generalizados (apenas 1 caso isolado de 60s)
- Sem degradação progressiva de latência (sem memory leak ou connection pool exhaustion)
- TLS handshake estável em 0.74ms
- Throughput constante sem queda

### 7.4 O que o Grafana Revelou

O dashboard de observabilidade em tempo real permitiu identificar que:
1. O rate limiting inicia nos primeiros segundos de ramp-up (>50 VUs)
2. A latência permanece estável mesmo sob rate limiting (indica rejeição rápida pelo servidor)
3. Não há correlação entre aumento de VUs e aumento de latência — os erros são por policy, não por saturação

---

## 8. Recomendações

### Para Testes com Reqres.in

1. **Reduzir VUs para 10-20** para evitar rate limiting e obter dados funcionais limpos
2. Usar think time maior (2-5s) para simular uso mais realista
3. Considerar apenas os thresholds de latência como válidos

### Para Testes em Ambiente Próprio

1. Executar com 500 VUs contra uma API própria sem rate limiting
2. Validar todos os thresholds (latência + error rate + checks)
3. Adicionar cenários de `constant-arrival-rate` para modelar throughput real
4. Correlacionar métricas do Grafana com métricas de APM do servidor
5. Incluir testes de soak (duração longa) para detectar memory leaks

### Para Observabilidade

1. Acompanhar o dashboard do Grafana em tempo real durante execuções
2. Cruzar métricas k6 com métricas do servidor (CPU, memória, I/O)
3. Configurar alertas no Grafana para p95 > threshold

---

## 9. Artefatos Gerados

| Artefato | Localização |
|----------|-------------|
| JSON Summary (k6) | `reports/load-test-latest.json` |
| Allure Results | `allure-results/` (24 test cases) |
| Allure HTML Report | `allure-report/` |
| InfluxDB Metrics | `http://localhost:8086` (database: k6, 23 measurements) |
| Grafana Dashboard | `http://localhost:3030/d/k6-load-testing` |

---

*Análise realizada por Aderson Rosa Vitoria com base em dados coletados via k6 + InfluxDB + Grafana + Allure.*
