require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const subscriptionKey =
  process.env.MTN_SUBSCRIPTION_KEY ||
  process.env['MTN-Primary-key'] ||
  process.env['Primary-key'] ||
  '';

const providerCallbackHostRaw =
  process.env.MTN_PROVIDER_CALLBACK_HOST ||
  process.env.MTN_CALLBACK_URL ||
  process.env.FRONTEND_URL ||
  '';

const baseUrl =
  process.env.MTN_API_BASE_URL ||
  'https://sandbox.momodeveloper.mtn.co.rw';

function getProviderCallbackHost(value) {
  if (!value) return '';
  try {
    return new URL(value).host;
  } catch {
    return String(value).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
}

async function createApiUser({ referenceId, providerCallbackHost }) {
  const response = await axios.post(
    `${baseUrl}/v1_0/apiuser`,
    { providerCallbackHost },
    {
      headers: {
        'X-Reference-Id': referenceId,
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'Content-Type': 'application/json',
      },
      validateStatus: () => true,
      timeout: 30000,
    }
  );

  if (response.status !== 201) {
    throw new Error(`API user creation failed (${response.status}): ${JSON.stringify(response.data)}`);
  }
}

async function createApiKey(referenceId) {
  const response = await axios.post(
    `${baseUrl}/v1_0/apiuser/${referenceId}/apikey`,
    {},
    {
      headers: {
        'Ocp-Apim-Subscription-Key': subscriptionKey,
      },
      validateStatus: () => true,
      timeout: 30000,
    }
  );

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`API key creation failed (${response.status}): ${JSON.stringify(response.data)}`);
  }

  const apiKey = response.data?.apiKey;
  if (!apiKey) {
    throw new Error(`API key response missing apiKey: ${JSON.stringify(response.data)}`);
  }

  return apiKey;
}

async function main() {
  if (!subscriptionKey) {
    throw new Error('Missing MTN subscription key. Set MTN_SUBSCRIPTION_KEY or MTN-Primary-key in .env.');
  }

  const providerCallbackHost = getProviderCallbackHost(providerCallbackHostRaw);
  if (!providerCallbackHost) {
    throw new Error('Missing callback host. Set MTN_PROVIDER_CALLBACK_HOST, MTN_CALLBACK_URL, or FRONTEND_URL in .env.');
  }

  const referenceId = crypto.randomUUID();

  console.log('Creating MTN Collection API user...');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Reference ID / API User: ${referenceId}`);
  console.log(`Callback host: ${providerCallbackHost}`);

  await createApiUser({ referenceId, providerCallbackHost });

  console.log('Creating MTN Collection API key...');
  const apiKey = await createApiKey(referenceId);

  console.log('\nMTN credentials created successfully.\n');
  console.log('Add these to your .env:');
  console.log(`MTN_API_USER=${referenceId}`);
  console.log(`MTN_API_KEY=${apiKey}`);
  console.log(`MTN_SUBSCRIPTION_KEY=${subscriptionKey}`);
}

main().catch((error) => {
  console.error('\nFailed to set up MTN Collection credentials.');
  console.error(error.message || error);
  process.exit(1);
});
