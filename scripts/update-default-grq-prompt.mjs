import 'dotenv/config';
import { createRequire } from 'node:module';
import { MongoClient } from 'mongodb';

const require = createRequire(import.meta.url);
const { getConfig } = require('../src/server/config.js');

const PROMPT_NAME = '2025 GRQ Prompt_Final';
const PROMPT_TEXT = `Act as an experienced Project Work teacher reviewing a Group Response Question discussion.

For each question, evaluate only what is supported by the transcript. Identify the quality of the students' claims, reasoning, examples, evidence, consideration of stakeholders, feasibility, limitations and responses to alternative viewpoints. Distinguish clearly between what students actually said and what you infer. Do not invent quotations, sources, facts or contributions.

Give teachers a concise, constructive analysis that includes:
1. an overall assessment;
2. strengths supported by transcript evidence;
3. areas that could be strengthened;
4. useful content students could research or include, such as missing perspectives, stakeholders, examples, evidence, counterarguments, implementation considerations and limitations;
5. student-specific feedback only where the speaker evidence supports it;
6. follow-up questions a teacher could ask; and
7. any evidence limitations or areas requiring factual verification.

Frame suggested content as research directions or possibilities, not verified facts. Use clear professional language suitable for a teacher and avoid assigning grades unless the teacher explicitly asks for them.`;

const config = getConfig();
if (!config.mongoUri) throw new Error('MongoDB is not configured');

const client = new MongoClient(config.mongoUri, { maxPoolSize: 1, serverSelectionTimeoutMS: 8000 });
try {
  await client.connect();
  const database = client.db(config.mongoDbName);
  const prompt = await database.collection('prompts').findOne({ name: PROMPT_NAME }, { projection: { _id: 1, name: 1, text: 1 } });
  if (!prompt) throw new Error(`Prompt not found: ${PROMPT_NAME}`);
  if (process.argv.includes('--dry-run')) {
    const setting = await database.collection('app_settings').findOne({ key: 'default-prompt' }, { projection: { promptId: 1 } });
    console.log(JSON.stringify({ mode: 'dry-run', promptId: String(prompt._id), name: prompt.name, textLength: PROMPT_TEXT.length, textMatches: prompt.text === PROMPT_TEXT, isDefault: String(setting?.promptId) === String(prompt._id) }));
  } else {
    const updatedAt = new Date().toISOString();
    await database.collection('prompts').updateOne({ _id: prompt._id }, { $set: { text: PROMPT_TEXT, updatedAt, updatedBy: 'release:2.2.0' } });
    await database.collection('app_settings').updateOne(
      { key: 'default-prompt' },
      { $set: { promptId: prompt._id, promptName: prompt.name, updatedAt, updatedBy: 'release:2.2.0' } },
      { upsert: true }
    );
    console.log(JSON.stringify({ mode: 'updated', promptId: String(prompt._id), name: prompt.name, textLength: PROMPT_TEXT.length }));
  }
} finally {
  await client.close();
}
