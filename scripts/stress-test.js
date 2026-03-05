import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const responseDuration = new Trend('response_duration', true);

const MAX_VUS = parseInt(__ENV.K6_VUS) || 2000;

export const options = {
  stages: [
    { duration: '1m', target: Math.floor(MAX_VUS * 0.05) },
    { duration: '2m', target: Math.floor(MAX_VUS * 0.25) },
    { duration: '2m', target: Math.floor(MAX_VUS * 0.5) },
    { duration: '2m', target: Math.floor(MAX_VUS * 0.75) },
    { duration: '2m', target: MAX_VUS },
    { duration: '1m', target: 0 },
  ],

  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.15'],
    errors: ['rate<0.2'],
  },

  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'count'],
};

const BASE_URL = __ENV.K6_BASE_URL || __ENV.BASE_URL || 'https://reqres.in/api';
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
