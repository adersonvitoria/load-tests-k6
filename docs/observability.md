# Observabilidade - k6 + Dashboards

Guia para exportar métricas dos testes k6 para sistemas de observabilidade e montar dashboards em tempo real.

## Opções de Exportação

### 1. InfluxDB + Grafana (Self-hosted)

A forma mais comum e nativa do k6 para visualizar métricas em tempo real.

**Pré-requisitos:**
- Docker e Docker Compose instalados

**docker-compose.yml (InfluxDB + Grafana):**

```yaml
version: '3.8'
services:
  influxdb:
    image: influxdb:1.8
    ports:
      - "8086:8086"
    environment:
      - INFLUXDB_DB=k6
    volumes:
      - influxdb-data:/var/lib/influxdb

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
    volumes:
      - grafana-data:/var/lib/grafana
    depends_on:
      - influxdb

volumes:
  influxdb-data:
  grafana-data:
```

**Iniciar:**

```bash
docker-compose up -d
```

**Executar k6 com output para InfluxDB:**

```bash
# Load test com métricas sendo enviadas ao InfluxDB
k6 run --out influxdb=http://localhost:8086/k6 \
  -e REQRES_API_KEY=sua_key \
  scripts/load-test.js
```

**Configurar Grafana:**

1. Acesse `http://localhost:3000`
2. Vá em **Configuration > Data Sources > Add data source**
3. Selecione **InfluxDB**
4. Configure:
   - URL: `http://influxdb:8086`
   - Database: `k6`
5. Clique em **Save & Test**
6. Importe o dashboard oficial k6:
   - Vá em **Dashboards > Import**
   - Cole o ID: `2587` (ou busque por "k6 Load Testing Results")
   - Selecione o data source InfluxDB
   - Clique em **Import**

**Dashboard inclui:**
- Virtual Users ao longo do tempo
- Tempo de resposta (avg, p95, p99)
- Taxa de requisições (req/s)
- Taxa de erros
- Checks aprovados/reprovados
- Métricas por grupo/endpoint

---

### 2. Prometheus Remote Write + Grafana

Para ambientes que já utilizam Prometheus como stack de observabilidade.

**Pré-requisitos:**
- Prometheus com remote-write-receiver habilitado

**prometheus.yml (habilitar remote write receiver):**

```yaml
global:
  scrape_interval: 15s

# Habilitar remote write receiver
# Inicie o Prometheus com a flag: --web.enable-remote-write-receiver
```

**Executar k6 com output Prometheus:**

```bash
k6 run --out experimental-prometheus-rw \
  -e K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
  -e K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM=true \
  -e REQRES_API_KEY=sua_key \
  scripts/load-test.js
```

**Métricas disponíveis no Prometheus:**
- `k6_http_req_duration_seconds` (histogram)
- `k6_http_reqs_total` (counter)
- `k6_http_req_failed_total` (counter)
- `k6_vus` (gauge)
- `k6_iterations_total` (counter)
- Todas as métricas customizadas (`k6_errors`, `k6_list_users_duration`, etc.)

**Configurar Dashboard Grafana:**
1. Adicione Prometheus como data source
2. Importe o dashboard ID: `19665` (k6 Prometheus)
3. Crie queries PromQL customizadas:

```promql
# Tempo médio de resposta
rate(k6_http_req_duration_seconds_sum[1m]) / rate(k6_http_req_duration_seconds_count[1m])

# p95 de tempo de resposta
histogram_quantile(0.95, rate(k6_http_req_duration_seconds_bucket[1m]))

# Taxa de requisições por segundo
rate(k6_http_reqs_total[1m])

# Taxa de erros
rate(k6_http_req_failed_total[1m]) / rate(k6_http_reqs_total[1m])

# VUs ativos
k6_vus
```

---

### 3. Grafana Cloud (SaaS)

Sem infraestrutura local. Ideal para times distribuídos.

**Pré-requisitos:**
- Conta no [Grafana Cloud](https://grafana.com/products/cloud/) (free tier disponível)

**Configurar:**

1. Crie uma conta em grafana.com
2. No Grafana Cloud, vá em **Connections > Add new connection > Prometheus**
3. Copie a URL do remote write e o token de autenticação

**Executar k6 com Grafana Cloud:**

```bash
k6 run --out experimental-prometheus-rw \
  -e K6_PROMETHEUS_RW_SERVER_URL=https://prometheus-prod-xx.grafana.net/api/prom/push \
  -e K6_PROMETHEUS_RW_USERNAME=seu_user_id \
  -e K6_PROMETHEUS_RW_PASSWORD=seu_api_token \
  -e K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM=true \
  -e REQRES_API_KEY=sua_key \
  scripts/load-test.js
```

**Variáveis de ambiente (`.env`):**

```bash
K6_PROMETHEUS_RW_SERVER_URL=https://prometheus-prod-xx.grafana.net/api/prom/push
K6_PROMETHEUS_RW_USERNAME=123456
K6_PROMETHEUS_RW_PASSWORD=glc_xxxxx
K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM=true
```

---

### 4. Integração com GitHub Actions

Na pipeline CI, basta adicionar o `--out` flag ao comando k6:

```yaml
- name: Run Load Test with metrics export
  run: |
    k6 run --out influxdb=${{ secrets.INFLUXDB_URL }} \
      -e REQRES_API_KEY=${{ secrets.REQRES_API_KEY }} \
      scripts/load-test.js
  env:
    K6_INFLUXDB_ORGANIZATION: my-org
    K6_INFLUXDB_BUCKET: k6-results
    K6_INFLUXDB_TOKEN: ${{ secrets.INFLUXDB_TOKEN }}
```

Ou com Prometheus Remote Write:

```yaml
- name: Run Load Test with Prometheus
  run: |
    k6 run --out experimental-prometheus-rw \
      -e REQRES_API_KEY=${{ secrets.REQRES_API_KEY }} \
      scripts/load-test.js
  env:
    K6_PROMETHEUS_RW_SERVER_URL: ${{ secrets.PROMETHEUS_RW_URL }}
    K6_PROMETHEUS_RW_USERNAME: ${{ secrets.PROMETHEUS_USERNAME }}
    K6_PROMETHEUS_RW_PASSWORD: ${{ secrets.PROMETHEUS_PASSWORD }}
```

---

## Variáveis de Ambiente para Observabilidade

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `K6_INFLUXDB_URL` | URL do InfluxDB | `http://localhost:8086/k6` |
| `K6_PROMETHEUS_RW_SERVER_URL` | URL do Prometheus remote write | `http://localhost:9090/api/v1/write` |
| `K6_PROMETHEUS_RW_USERNAME` | Username (Grafana Cloud) | `123456` |
| `K6_PROMETHEUS_RW_PASSWORD` | Token/password (Grafana Cloud) | `glc_xxxxx` |
| `K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM` | Histogramas nativos | `true` |

## Resumo de Dashboards

| Stack | Dashboard ID | Descrição |
|-------|-------------|-----------|
| InfluxDB + Grafana | `2587` | k6 Load Testing Results (oficial) |
| Prometheus + Grafana | `19665` | k6 Prometheus Dashboard |
| Grafana Cloud | Pré-configurado | Dashboard nativo ao usar Grafana Cloud k6 |

## Métricas Chave para Monitorar

| Métrica | Tipo | Significado |
|---------|------|-------------|
| `http_req_duration` | Trend | Latência das requisições HTTP |
| `http_reqs` | Counter | Total de requisições realizadas |
| `http_req_failed` | Rate | Taxa de requisições com falha |
| `vus` | Gauge | Virtual Users ativos |
| `iterations` | Counter | Iterações completadas |
| `errors` | Rate | Taxa de erros customizada |
| `data_sent` | Counter | Bytes enviados |
| `data_received` | Counter | Bytes recebidos |
