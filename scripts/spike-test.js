import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const spikeResponseTime = new Trend('spike_response_time', true);

// Spike test: simular pico repentino de tráfego
export const options = {
  stages: [
    { duration: '30s', target: 10 },      // Tráfego normal baixo
    { duration: '10s', target: 500 },     // Spike repentino para 500 VUs
    { duration: '1m', target: 500 },      // Manter pico por 1 minuto
    { duration: '10s', target: 10 },      // Queda para normalidade
    { duration: '30s', target: 10 },      // Recuperação
    { duration: '10s', target: 0 },       // Encerramento
  ],

  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.10'],
  },

  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'count'],
};

const BASE_URL = 'https://reqres.in/api';
const HEADERS = {
  'Content-Type': 'application/json',
  'x-api-key': __ENV.REQRES_API_KEY || '',
};

export default function () {
  const res = http.get(`${BASE_URL}/users?page=1`, { headers: HEADERS });

  spikeResponseTime.add(res.timings.duration);

  const success = check(res, {
    'status é 200': (r) => r.status === 200,
    'resposta em menos de 5s': (r) => r.timings.duration < 5000,
    'body contém dados': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && body.data.length > 0;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);

  sleep(0.5);
}

export function handleSummary(data) {
  return {
    'reports/spike-test-latest.json': JSON.stringify(data, null, 2),
  };
}
