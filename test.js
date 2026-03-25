import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const TEST_EMAIL = __ENV.TEST_EMAIL || '';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || '';
const TEST_COMPANY = __ENV.TEST_COMPANY || '';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
  },
};

function buildHeaders(token = '') {
  return token
    ? {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    : {
        'Content-Type': 'application/json',
      };
}

function runGetCheck(name, url, params = {}) {
  const res = http.get(url, params);
  check(res, {
    [`${name} status ok`]: (r) => r.status >= 200 && r.status < 300,
    [`${name} response time OK`]: (r) => r.timings.duration < 800,
  });
  return res;
}

export function setup() {
  const context = {
    token: '',
    user: null,
    authEnabled: Boolean(TEST_EMAIL && TEST_PASSWORD),
  };

  if (!context.authEnabled) {
    console.log('No TEST_EMAIL/TEST_PASSWORD provided. Running public endpoint checks only.');
    return context;
  }

  const payload = JSON.stringify({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    ...(TEST_COMPANY ? { companyName: TEST_COMPANY } : {}),
  });

  const loginRes = http.post(`${BASE_URL}/api/auth/login`, payload, {
    headers: buildHeaders(),
  });

  const loginOk = check(loginRes, {
    'setup login status ok': (r) => r.status >= 200 && r.status < 300,
    'setup login token present': (r) => {
      try {
        const body = r.json();
        return Boolean(body?.token);
      } catch (err) {
        return false;
      }
    },
  });

  if (!loginOk) {
    console.log(`Login failed during setup: ${loginRes.status} ${loginRes.body || ''}`);
    return { ...context, authEnabled: false };
  }

  const body = loginRes.json();
  context.token = body.token || '';
  context.user = body.user || null;
  return context;
}

export default function (data) {
  group('public endpoints', () => {
    runGetCheck('health', `${BASE_URL}/api/health`);
    runGetCheck('root', `${BASE_URL}/`);
  });

  if (data?.authEnabled && data?.token) {
    const authParams = { headers: buildHeaders(data.token) };

    group('authenticated dashboard endpoints', () => {
      runGetCheck('users', `${BASE_URL}/api/users`, authParams);
      runGetCheck('issues', `${BASE_URL}/api/issues`, authParams);
      runGetCheck('properties', `${BASE_URL}/api/properties`, authParams);
      runGetCheck('assets', `${BASE_URL}/api/assets`, authParams);
      runGetCheck('notifications', `${BASE_URL}/api/notifications`, authParams);
    });

    group('authenticated support endpoints', () => {
      runGetCheck('private notes', `${BASE_URL}/api/private-notes/me`, authParams);
      runGetCheck('material requests', `${BASE_URL}/api/material-requests`, authParams);
    });
  }

  sleep(1);
}
