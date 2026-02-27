const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const RESULTS_DIR = path.resolve(__dirname, '..', 'allure-results');
const REPORTS_DIR = path.resolve(__dirname, '..', 'reports');

const SUMMARY_FILES = [
  { file: 'load-test-latest.json', name: 'Load Test', epic: 'Testes de Carga', feature: 'Load Test - 500 VUs' },
  { file: 'stress-test-latest.json', name: 'Stress Test', epic: 'Testes de Carga', feature: 'Stress Test - 2000 VUs' },
  { file: 'spike-test-latest.json', name: 'Spike Test', epic: 'Testes de Carga', feature: 'Spike Test - Pico Repentino' },
];

if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function getMetricValue(metrics, name, stat = 'avg') {
  const metric = metrics[name];
  if (!metric) return null;
  if (metric.values) return metric.values[stat] ?? metric.values.value ?? null;
  if (metric.value !== undefined) return metric.value;
  return null;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function createTestResult({ name, fullName, status, statusDetails, start, stop, labels, steps, parameters, description }) {
  return {
    uuid: randomUUID(),
    historyId: randomUUID(),
    name,
    fullName: fullName || name,
    status,
    statusDetails: statusDetails || {},
    stage: 'finished',
    start: start || Date.now(),
    stop: stop || Date.now(),
    labels: labels || [],
    parameters: parameters || [],
    steps: steps || [],
    attachments: [],
    description: description || '',
  };
}

function createStep(name, status, start, stop, parameters) {
  return {
    name,
    status,
    stage: 'finished',
    start: start || Date.now(),
    stop: stop || Date.now(),
    parameters: parameters || [],
    steps: [],
    attachments: [],
  };
}

function processK6Summary(summaryData, config) {
  const results = [];
  const metrics = summaryData.metrics || {};
  const rootGroup = summaryData.root_group || {};
  const now = Date.now();

  const baseLabels = [
    { name: 'epic', value: config.epic },
    { name: 'feature', value: config.feature },
    { name: 'owner', value: 'QA Team' },
    { name: 'framework', value: 'k6' },
    { name: 'tag', value: 'Performance' },
    { name: 'tag', value: 'LoadTest' },
    { name: 'tag', value: 'k6' },
  ];

  // --- Teste 1: Thresholds ---
  const thresholds = summaryData.thresholds || {};
  const thresholdSteps = [];
  let allThresholdsPassed = true;

  for (const [name, threshold] of Object.entries(thresholds)) {
    const passed = threshold.ok !== false;
    if (!passed) allThresholdsPassed = false;

    thresholdSteps.push(createStep(
      `Threshold: ${name} → ${passed ? 'APROVADO' : 'REPROVADO'}`,
      passed ? 'passed' : 'failed',
      now - 1000,
      now,
    ));
  }

  results.push(createTestResult({
    name: `${config.name} - Validação de Thresholds`,
    fullName: `${config.epic} > ${config.feature} > Thresholds`,
    status: allThresholdsPassed ? 'passed' : 'failed',
    statusDetails: allThresholdsPassed ? {} : { message: 'Um ou mais thresholds foram reprovados' },
    start: now - 5000,
    stop: now,
    labels: [
      ...baseLabels,
      { name: 'story', value: 'Validação de Thresholds' },
      { name: 'severity', value: 'critical' },
    ],
    steps: thresholdSteps,
    description:
      `Validação de todos os thresholds (critérios de aprovação) definidos no teste de carga.\n\n` +
      `**Total de thresholds:** ${Object.keys(thresholds).length}\n` +
      `**Aprovados:** ${thresholdSteps.filter(s => s.status === 'passed').length}\n` +
      `**Reprovados:** ${thresholdSteps.filter(s => s.status === 'failed').length}`,
  }));

  // --- Teste 2: Métricas de Performance ---
  const httpDuration = metrics['http_req_duration'];
  const perfSteps = [];

  if (httpDuration?.values) {
    const v = httpDuration.values;
    perfSteps.push(createStep(`Tempo médio de resposta: ${formatDuration(v.avg)}`, 'passed', now - 1000, now));
    perfSteps.push(createStep(`Mediana (p50): ${formatDuration(v.med)}`, 'passed', now - 1000, now));
    perfSteps.push(createStep(`Percentil 90: ${formatDuration(v['p(90)'])}`, 'passed', now - 1000, now));
    perfSteps.push(createStep(`Percentil 95: ${formatDuration(v['p(95)'])}`, v['p(95)'] < 5000 ? 'passed' : 'failed', now - 1000, now));
    perfSteps.push(createStep(`Percentil 99: ${formatDuration(v['p(99)'])}`, 'passed', now - 1000, now));
    perfSteps.push(createStep(`Tempo máximo: ${formatDuration(v.max)}`, 'passed', now - 1000, now));
    perfSteps.push(createStep(`Tempo mínimo: ${formatDuration(v.min)}`, 'passed', now - 1000, now));
  }

  const p95 = httpDuration?.values?.['p(95)'] || 0;
  results.push(createTestResult({
    name: `${config.name} - Métricas de Performance HTTP`,
    fullName: `${config.epic} > ${config.feature} > Performance HTTP`,
    status: p95 < 5000 ? 'passed' : 'failed',
    start: now - 4000,
    stop: now,
    labels: [
      ...baseLabels,
      { name: 'story', value: 'Métricas de Performance HTTP' },
      { name: 'severity', value: 'blocker' },
    ],
    steps: perfSteps,
    description:
      `Análise das métricas de tempo de resposta HTTP coletadas durante o teste de carga.\n\n` +
      `**Critério:** p(95) < 5000ms\n` +
      `**Resultado p(95):** ${formatDuration(p95)}`,
  }));

  // --- Teste 3: Taxa de Erro ---
  const httpFailed = metrics['http_req_failed'];
  const failRate = httpFailed?.values?.rate || httpFailed?.value || 0;
  const failPercent = (failRate * 100).toFixed(2);
  const errorPassed = failRate < 0.05;

  const errorSteps = [
    createStep(`Taxa de requisições com falha: ${failPercent}%`, errorPassed ? 'passed' : 'failed', now - 1000, now),
    createStep(`Critério: taxa de erro < 5%`, 'passed', now - 1000, now),
  ];

  const customErrors = metrics['errors'];
  if (customErrors) {
    const customRate = (customErrors.values?.rate || 0) * 100;
    errorSteps.push(createStep(`Taxa de erros customizados: ${customRate.toFixed(2)}%`, customRate < 10 ? 'passed' : 'failed', now - 1000, now));
  }

  results.push(createTestResult({
    name: `${config.name} - Taxa de Erros`,
    fullName: `${config.epic} > ${config.feature} > Taxa de Erros`,
    status: errorPassed ? 'passed' : 'failed',
    start: now - 3000,
    stop: now,
    labels: [
      ...baseLabels,
      { name: 'story', value: 'Taxa de Erros' },
      { name: 'severity', value: 'critical' },
    ],
    steps: errorSteps,
    description:
      `Análise da taxa de erros durante o teste de carga.\n\n` +
      `**Taxa de falha HTTP:** ${failPercent}%\n` +
      `**Critério:** < 5%\n` +
      `**Status:** ${errorPassed ? 'APROVADO' : 'REPROVADO'}`,
  }));

  // --- Teste 4: Throughput ---
  const httpReqs = metrics['http_reqs'];
  const totalReqs = httpReqs?.values?.count || httpReqs?.count || 0;
  const reqsPerSec = httpReqs?.values?.rate || 0;

  const throughputSteps = [
    createStep(`Total de requisições: ${totalReqs}`, 'passed', now - 1000, now),
    createStep(`Taxa: ${reqsPerSec.toFixed(2)} req/s`, 'passed', now - 1000, now),
  ];

  const iterations = metrics['iterations'];
  if (iterations) {
    throughputSteps.push(createStep(`Total de iterações: ${iterations.values?.count || 0}`, 'passed', now - 1000, now));
    throughputSteps.push(createStep(`Iterações/s: ${(iterations.values?.rate || 0).toFixed(2)}`, 'passed', now - 1000, now));
  }

  const vus = metrics['vus'];
  if (vus) {
    throughputSteps.push(createStep(`VUs máximo: ${vus.values?.max || 0}`, 'passed', now - 1000, now));
  }

  results.push(createTestResult({
    name: `${config.name} - Throughput e Capacidade`,
    fullName: `${config.epic} > ${config.feature} > Throughput`,
    status: 'passed',
    start: now - 2000,
    stop: now,
    labels: [
      ...baseLabels,
      { name: 'story', value: 'Throughput e Capacidade' },
      { name: 'severity', value: 'normal' },
    ],
    steps: throughputSteps,
    description:
      `Análise de throughput e capacidade de processamento da API sob carga.\n\n` +
      `**Total de requisições:** ${totalReqs}\n` +
      `**Throughput:** ${reqsPerSec.toFixed(2)} req/s`,
  }));

  // --- Teste 5: Checks por Grupo ---
  const groups = rootGroup.groups || {};
  for (const [groupName, groupData] of Object.entries(groups)) {
    const checks = groupData.checks || {};
    const checkSteps = [];
    let allChecksPassed = true;

    for (const [checkName, checkData] of Object.entries(checks)) {
      const passes = checkData.passes || 0;
      const fails = checkData.fails || 0;
      const total = passes + fails;
      const passed = fails === 0;
      if (!passed) allChecksPassed = false;

      checkSteps.push(createStep(
        `${checkName}: ${passes}/${total} (${passed ? '100%' : ((passes / total) * 100).toFixed(1) + '%'})`,
        passed ? 'passed' : 'failed',
        now - 1000,
        now,
      ));
    }

    if (checkSteps.length > 0) {
      results.push(createTestResult({
        name: `${config.name} - Checks: ${groupName}`,
        fullName: `${config.epic} > ${config.feature} > Checks > ${groupName}`,
        status: allChecksPassed ? 'passed' : 'failed',
        start: now - 1000,
        stop: now,
        labels: [
          ...baseLabels,
          { name: 'story', value: `Checks - ${groupName}` },
          { name: 'severity', value: 'normal' },
        ],
        steps: checkSteps,
        description:
          `Validação dos checks funcionais do grupo "${groupName}" durante o teste de carga.\n\n` +
          `**Total de checks:** ${checkSteps.length}\n` +
          `**Aprovados:** ${checkSteps.filter(s => s.status === 'passed').length}\n` +
          `**Reprovados:** ${checkSteps.filter(s => s.status === 'failed').length}`,
      }));
    }
  }

  // --- Teste 6: Métricas Customizadas por Endpoint ---
  const customMetrics = [
    { key: 'list_users_duration', name: 'GET /users - Listagem', endpoint: 'GET /api/users' },
    { key: 'single_user_duration', name: 'GET /users/:id - Único', endpoint: 'GET /api/users/:id' },
    { key: 'create_user_duration', name: 'POST /users - Criação', endpoint: 'POST /api/users' },
    { key: 'login_duration', name: 'POST /login - Login', endpoint: 'POST /api/login' },
    { key: 'response_duration', name: 'Tempo de resposta geral', endpoint: 'Multiple endpoints' },
    { key: 'spike_response_time', name: 'Spike - Tempo de resposta', endpoint: 'GET /api/users' },
  ];

  for (const cm of customMetrics) {
    const metric = metrics[cm.key];
    if (!metric?.values) continue;

    const v = metric.values;
    const metricSteps = [
      createStep(`Tempo médio: ${formatDuration(v.avg)}`, 'passed', now - 1000, now),
      createStep(`Mediana: ${formatDuration(v.med)}`, 'passed', now - 1000, now),
      createStep(`p(90): ${formatDuration(v['p(90)'])}`, 'passed', now - 1000, now),
      createStep(`p(95): ${formatDuration(v['p(95)'])}`, v['p(95)'] < 3000 ? 'passed' : 'failed', now - 1000, now),
      createStep(`p(99): ${formatDuration(v['p(99)'])}`, 'passed', now - 1000, now),
      createStep(`Max: ${formatDuration(v.max)}`, 'passed', now - 1000, now),
      createStep(`Total de amostras: ${v.count || 0}`, 'passed', now - 1000, now),
    ];

    results.push(createTestResult({
      name: `${config.name} - ${cm.name}`,
      fullName: `${config.epic} > ${config.feature} > Endpoints > ${cm.name}`,
      status: v['p(95)'] < 3000 ? 'passed' : 'failed',
      start: now - 1000,
      stop: now,
      labels: [
        ...baseLabels,
        { name: 'story', value: `Endpoint - ${cm.endpoint}` },
        { name: 'severity', value: 'normal' },
      ],
      steps: metricSteps,
      description:
        `Métricas detalhadas de performance para o endpoint ${cm.endpoint}.\n\n` +
        `| Métrica | Valor |\n|---------|-------|\n` +
        `| Avg | ${formatDuration(v.avg)} |\n` +
        `| Med | ${formatDuration(v.med)} |\n` +
        `| p(90) | ${formatDuration(v['p(90)'])} |\n` +
        `| p(95) | ${formatDuration(v['p(95)'])} |\n` +
        `| p(99) | ${formatDuration(v['p(99)'])} |\n` +
        `| Max | ${formatDuration(v.max)} |`,
    }));
  }

  return results;
}

function writeEnvironmentInfo() {
  const envInfo = [
    'Framework=k6',
    'API_Base_URL=https://reqres.in',
    'Test_Type=Performance / Load Testing',
    `OS=${process.platform}`,
    `Node.js=${process.version}`,
    `Execution_Date=${new Date().toLocaleString('pt-BR')}`,
  ].join('\n');

  fs.writeFileSync(path.join(RESULTS_DIR, 'environment.properties'), envInfo);
}

function writeCategoriesJson() {
  const categories = [
    {
      name: 'Thresholds Reprovados',
      matchedStatuses: ['failed'],
      messageRegex: '.*threshold.*',
    },
    {
      name: 'Performance Degradada',
      matchedStatuses: ['failed'],
      messageRegex: '.*p\\(95\\).*',
    },
    {
      name: 'Taxa de Erro Elevada',
      matchedStatuses: ['failed'],
      messageRegex: '.*erro.*',
    },
  ];

  fs.writeFileSync(path.join(RESULTS_DIR, 'categories.json'), JSON.stringify(categories, null, 2));
}

// --- Main ---
let totalResults = 0;

for (const config of SUMMARY_FILES) {
  const filePath = path.join(REPORTS_DIR, config.file);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠ Arquivo não encontrado: ${config.file} (ignorando)`);
    continue;
  }

  console.log(`✔ Processando: ${config.file}`);
  const summaryData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const results = processK6Summary(summaryData, config);

  for (const result of results) {
    const filename = `${result.uuid}-result.json`;
    fs.writeFileSync(path.join(RESULTS_DIR, filename), JSON.stringify(result, null, 2));
    totalResults++;
  }
}

if (totalResults > 0) {
  writeEnvironmentInfo();
  writeCategoriesJson();
  console.log(`\n✔ ${totalResults} resultados Allure gerados em: ${RESULTS_DIR}`);
  console.log('  Execute: npm run allure:generate && npm run allure:open');
} else {
  console.log('\n⚠ Nenhum arquivo de sumário encontrado.');
  console.log('  Execute os testes k6 primeiro:');
  console.log('  k6 run scripts/load-test.js --summary-export=reports/load-test-latest.json');
}
