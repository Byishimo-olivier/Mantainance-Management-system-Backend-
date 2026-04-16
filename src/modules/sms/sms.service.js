let cachedTwilioClient = null;

const getTwilioConfig = () => ({
  accountSid: String(process.env.TWILIO_ACCOUNT_SID || '').trim(),
  authToken: String(process.env.TWILIO_AUTH_TOKEN || '').trim(),
  from: String(process.env.TWILIO_PHONE_NUMBER || '').trim(),
  defaultCountryCode: String(process.env.TWILIO_DEFAULT_COUNTRY_CODE || '').trim(),
});

const isConfigured = () => {
  const config = getTwilioConfig();
  return Boolean(config.accountSid && config.authToken && config.from);
};

const normalizePhoneNumber = (phone) => {
  const raw = String(phone || '').trim();
  if (!raw) return '';

  if (raw.startsWith('+')) {
    return `+${raw.slice(1).replace(/\D/g, '')}`;
  }

  if (raw.startsWith('00')) {
    return `+${raw.slice(2).replace(/\D/g, '')}`;
  }

  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  const { defaultCountryCode } = getTwilioConfig();
  if (defaultCountryCode) {
    const countryDigits = defaultCountryCode.replace(/\D/g, '');
    if (!countryDigits) return digits;
    if (digits.startsWith(countryDigits)) return `+${digits}`;
    return `+${countryDigits}${digits}`;
  }

  return digits;
};

const getTwilioClient = () => {
  if (cachedTwilioClient) return cachedTwilioClient;

  let twilioFactory;
  try {
    twilioFactory = require('twilio');
  } catch (error) {
    console.warn('[sms] Twilio package is not installed yet. Run npm install in the backend to enable SMS.');
    return null;
  }

  const { accountSid, authToken } = getTwilioConfig();
  if (!accountSid || !authToken) return null;

  cachedTwilioClient = twilioFactory(accountSid, authToken);
  return cachedTwilioClient;
};

const sendSms = async ({ to, body }) => {
  const messageBody = String(body || '').trim();
  const recipient = normalizePhoneNumber(to);

  if (!messageBody || !recipient) {
    return { skipped: true, reason: 'Missing SMS body or recipient.' };
  }

  if (!isConfigured()) {
    return { skipped: true, reason: 'Twilio SMS is not configured.' };
  }

  const client = getTwilioClient();
  if (!client) {
    return { skipped: true, reason: 'Twilio client is unavailable.' };
  }

  const { from } = getTwilioConfig();
  return client.messages.create({
    body: messageBody,
    from,
    to: recipient,
  });
};

const sendBulkSms = async ({ recipients = [], body }) => {
  const uniqueRecipients = Array.from(new Set(
    (Array.isArray(recipients) ? recipients : [])
      .map(normalizePhoneNumber)
      .filter(Boolean)
  ));

  if (!uniqueRecipients.length) return [];

  return Promise.allSettled(
    uniqueRecipients.map((recipient) => sendSms({ to: recipient, body }))
  );
};

module.exports = {
  isConfigured,
  normalizePhoneNumber,
  sendSms,
  sendBulkSms,
};
