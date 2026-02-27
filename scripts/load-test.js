import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Métricas customizadas
const errorRate = new Rate('errors');
const listUsersDuration = new Trend('list_users_duration', true);
const singleUserDuration = new Trend('single_user_duration', true);
const createUserDuration = new Trend('create_user_duration', true);
const loginDuration = new Trend('login_duration', true);
const totalRequests = new Counter('total_requests');

// Configuração: 500 usuários simultâneos por 5 minutos
export const options = {
  stages: [
    { duration: '30s', target: 100 },   // Ramp-up gradual
    { duration: '30s', target: 250 },   // Subindo para metade
    { duration: '30s', target: 500 },   // Atingindo pico
    { duration: '3m', target: 500 },    // Sustentando 500 VUs por 3 min
    { duration: '1m', target: 0 },      // Ramp-down
  ],

  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],  // 95% < 2s, 99% < 5s
    http_req_failed: ['rate<0.05'],                     // Taxa de erro < 5%
    errors: ['rate<0.1'],                                // Erros customizados < 10%
    list_users_duration: ['p(95)<3000'],
    single_user_duration: ['p(95)<2000'],
    create_user_duration: ['p(95)<3000'],
    login_duration: ['p(95)<2000'],
  },

  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'count'],
};

const BASE_URL = 'https://reqres.in/api';
const HEADERS = {
  'Content-Type': 'application/json',
  'x-api-key': __ENV.REQRES_API_KEY || '',
};

export default function () {
  group('GET - Listar Usuários', () => {
    const page = Math.floor(Math.random() * 2) + 1;
    const res = http.get(`${BASE_URL}/users?page=${page}`, { headers: HEADERS });

    totalRequests.add(1);
    listUsersDuration.add(res.timings.duration);

    const success = check(res, {
      'GET /users - status 200': (r) => r.status === 200,
      'GET /users - body contém data': (r) => {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data) && body.data.length > 0;
      },
      'GET /users - tempo de resposta < 2s': (r) => r.timings.duration < 2000,
    });

    errorRate.add(!success);
  });

  sleep(0.5);

  group('GET - Usuário Único', () => {
    const userId = Math.floor(Math.random() * 12) + 1;
    const res = http.get(`${BASE_URL}/users/${userId}`, { headers: HEADERS });

    totalRequests.add(1);
    singleUserDuration.add(res.timings.duration);

    const success = check(res, {
      'GET /users/:id - status 200': (r) => r.status === 200,
      'GET /users/:id - body contém dados do usuário': (r) => {
        const body = JSON.parse(r.body);
        return body.data && body.data.id === userId;
      },
      'GET /users/:id - tempo de resposta < 1.5s': (r) => r.timings.duration < 1500,
    });

    errorRate.add(!success);
  });

  sleep(0.5);

  group('POST - Criar Usuário', () => {
    const payload = JSON.stringify({
      name: `User_${__VU}_${__ITER}`,
      job: 'QA Engineer',
    });

    const res = http.post(`${BASE_URL}/users`, payload, { headers: HEADERS });

    totalRequests.add(1);
    createUserDuration.add(res.timings.duration);

    const success = check(res, {
      'POST /users - status 201': (r) => r.status === 201,
      'POST /users - body contém id': (r) => {
        const body = JSON.parse(r.body);
        return body.id !== undefined;
      },
      'POST /users - tempo de resposta < 2s': (r) => r.timings.duration < 2000,
    });

    errorRate.add(!success);
  });

  sleep(0.5);

  group('POST - Login', () => {
    const payload = JSON.stringify({
      email: 'eve.holt@reqres.in',
      password: 'cityslicka',
    });

    const res = http.post(`${BASE_URL}/login`, payload, { headers: HEADERS });

    totalRequests.add(1);
    loginDuration.add(res.timings.duration);

    const success = check(res, {
      'POST /login - status 200': (r) => r.status === 200,
      'POST /login - body contém token': (r) => {
        const body = JSON.parse(r.body);
        return body.token !== undefined && body.token.length > 0;
      },
      'POST /login - tempo de resposta < 1.5s': (r) => r.timings.duration < 1500,
    });

    errorRate.add(!success);
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    'reports/load-test-latest.json': JSON.stringify(data, null, 2),
  };
}
