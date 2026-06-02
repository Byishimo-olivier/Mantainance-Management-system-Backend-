require('dotenv').config();

const OpenAI = require('openai');

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Add it to .env before running this script.');
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5.5',
    input: 'Write a one-sentence bedtime story about a unicorn.',
  });

  console.log(response.output_text || JSON.stringify(response, null, 2));
}

main().catch((error) => {
  console.error('[OpenAI test] Failed:', error.message);
  process.exit(1);
});
