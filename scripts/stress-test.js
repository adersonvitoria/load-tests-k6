import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const responseDuration = new Trend('response_duration', true);

// Stress test: encontrar o ponto de ruptura da API
export const options = {
  stages: [
    { duration: '1m', target: 100 },     // Warm-up
    { duration: '2m', target: 500 },     // Carga normal
    { duration: '2m', target: 1000 },    // Carga alta
    { duration: '2m', target: 1500 },    // Carga extrema
    { duration: '2m', target: 2000 },    // Ponto de ruptura
    { duration: '1m', target: 0 },       // Ramp-down
  ],

  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.15'],
    errors: ['rate<0.2'],
  },

  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'count'],
};

const BASE_URL = 'https://reqres.in/api';
const HEADERS = {
  'Content-Type': 'application/json',
  'x-api-key': __ENV.REQRES_API_KEY || '',
};

export default function () {
  group('Stress - Leitura intensiva', () => {
    const res = http.get(`${BASE_URL}/users?page=1`, { headers: HEADERS });

    responseDuration.add(res.timings.duration);

    const success = check(res, {
      'status é 200': (r) => r.status === 200,
      'resposta em menos de 5s': (r) => r.timings.duration < 5000,
    });

    errorRate.add(!success);
  });

  sleep(0.3);

  group('Stress - Escrita intensiva', () => {
    const payload = JSON.stringify({
      name: `StressUser_${__VU}`,
      job: 'Tester',
    });

    const res = http.post(`${BASE_URL}/users`, payload, { headers: HEADERS });

    responseDuration.add(res.timings.duration);

    const success = check(res, {
      'status é 201': (r) => r.status === 201,
      'resposta em menos de 5s': (r) => r.timings.duration < 5000,
    });

    errorRate.add(!success);
  });

  sleep(0.3);
}

export function handleSummary(data) {
  return {
    'reports/stress-test-latest.json': JSON.stringify(data, null, 2),
  };
}
