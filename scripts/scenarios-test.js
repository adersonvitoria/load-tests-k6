import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate = new Rate('errors');
const browsingDuration = new Trend('browsing_duration', true);
const apiCallDuration = new Trend('api_call_duration', true);
const totalRequests = new Counter('total_requests');

const BASE_URL = __ENV.K6_BASE_URL || __ENV.BASE_URL || 'https://reqres.in/api';
const RATE = parseInt(__ENV.K6_RATE) || 20;
const DURATION = __ENV.K6_DURATION || '3m';
const RAMP_UP = __ENV.K6_RAMP_UP || '1m';

const HEADERS = {
  'Content-Type': 'application/json',
  'x-api-key': __ENV.REQRES_API_KEY || '',
};

export const options = {
  scenarios: {
    constant_throughput: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.max(RATE * 2, 50),
      maxVUs: Math.max(RATE * 5, 200),
      exec: 'browsingFlow',
      tags: { scenario: 'constant_throughput' },
    },

    ramping_throughput: {
      executor: 'ramping-arrival-rate',
      startRate: Math.floor(RATE / 4),
      timeUnit: '1s',
      stages: [
        { duration: RAMP_UP, target: RATE },
        { duration: DURATION, target: RATE },
        { duration: RAMP_UP, target: RATE * 2 },
        { duration: '1m', target: RATE * 2 },
        { duration: '30s', target: 0 },
      ],
      preAllocatedVUs: Math.max(RATE * 3, 80),
      maxVUs: Math.max(RATE * 8, 400),
      exec: 'apiOperationsFlow',
      startTime: `${parseInt(DURATION) + parseInt(RAMP_UP) + 2}m`,
      tags: { scenario: 'ramping_throughput' },
    },

    soak_baseline: {
      executor: 'constant-arrival-rate',
      rate: Math.max(Math.floor(RATE / 5), 2),
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 20,
      maxVUs: 50,
      exec: 'browsingFlow',
      tags: { scenario: 'soak_baseline' },
    },
  },

  thresholds: {
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.10'],
    browsing_duration: ['p(95)<2500'],
    api_call_duration: ['p(95)<3000'],

    'http_req_duration{scenario:constant_throughput}': ['p(95)<2500'],
    'http_req_duration{scenario:ramping_throughput}': ['p(95)<3500'],
    'http_req_duration{scenario:soak_baseline}': ['p(95)<2000'],
  },

  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'count'],
};

export function browsingFlow() {
  group('Browsing - Listar Usuários', () => {
    const page = Math.floor(Math.random() * 2) + 1;
    const res = http.get(`${BASE_URL}/users?page=${page}`, { headers: HEADERS });

    totalRequests.add(1);
    browsingDuration.add(res.timings.duration);

    const success = check(res, {
      'browsing: status 200': (r) => r.status === 200,
      'browsing: body válido': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.data) && body.data.length > 0;
        } catch { return false; }
      },
      'browsing: resposta < 3s': (r) => r.timings.duration < 3000,
    });

    errorRate.add(!success);
  });

  sleep(Math.random() * 2 + 0.5);

  group('Browsing - Detalhe de Usuário', () => {
    const userId = Math.floor(Math.random() * 12) + 1;
    const res = http.get(`${BASE_URL}/users/${userId}`, { headers: HEADERS });

    totalRequests.add(1);
    browsingDuration.add(res.timings.duration);

    const success = check(res, {
      'detalhe: status 200': (r) => r.status === 200,
      'detalhe: resposta < 2s': (r) => r.timings.duration < 2000,
    });

    errorRate.add(!success);
  });
}

export function apiOperationsFlow() {
  group('API - Criar Recurso', () => {
    const payload = JSON.stringify({
      name: `ScenarioUser_${__VU}_${__ITER}`,
      job: 'Performance Tester',
    });

    const res = http.post(`${BASE_URL}/users`, payload, { headers: HEADERS });

    totalRequests.add(1);
    apiCallDuration.add(res.timings.duration);

    const success = check(res, {
      'create: status 201': (r) => r.status === 201,
      'create: body contém id': (r) => {
        try { return JSON.parse(r.body).id !== undefined; }
        catch { return false; }
      },
      'create: resposta < 3s': (r) => r.timings.duration < 3000,
    });

    errorRate.add(!success);
  });

  sleep(Math.random() + 0.3);

  group('API - Login', () => {
    const payload = JSON.stringify({
      email: 'eve.holt@reqres.in',
      password: 'cityslicka',
    });

    const res = http.post(`${BASE_URL}/login`, payload, { headers: HEADERS });

    totalRequests.add(1);
    apiCallDuration.add(res.timings.duration);

    const success = check(res, {
      'login: status 200': (r) => r.status === 200,
      'login: token presente': (r) => {
        try { return JSON.parse(r.body).token !== undefined; }
        catch { return false; }
      },
      'login: resposta < 2s': (r) => r.timings.duration < 2000,
    });

    errorRate.add(!success);
  });

  sleep(Math.random() + 0.3);

  group('API - Listar após operação', () => {
    const res = http.get(`${BASE_URL}/users?page=1`, { headers: HEADERS });

    totalRequests.add(1);
    apiCallDuration.add(res.timings.duration);

    const success = check(res, {
      'list after op: status 200': (r) => r.status === 200,
    });

    errorRate.add(!success);
  });
}

export function handleSummary(data) {
  return {
    'reports/scenarios-test-latest.json': JSON.stringify(data, null, 2),
  };
}
