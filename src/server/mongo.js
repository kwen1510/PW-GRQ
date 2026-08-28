'use strict';

const { MongoClient, ObjectId } = require('mongodb');

function id(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : value;
}

function createMongoStore(config, dependencies = {}) {
  const MongoClientCtor = dependencies.MongoClientCtor || MongoClient;
  let clientPromise;

  async function db() {
    if (!config.mongoUri) return null;
    if (!clientPromise) {
      const client = new MongoClientCtor(config.mongoUri, {
        maxPoolSize: 8,
        minPoolSize: 0,
        serverSelectionTimeoutMS: 8000
      });
      clientPromise = client.connect().catch((error) => {
        clientPromise = undefined;
        throw error;
      });
    }
    const client = await clientPromise;
    return client.db(config.mongoDbName);
  }

  async function prompts() {
    const database = await db();
    return database?.collection('prompts') || null;
  }

  async function consumeQuota(subject, operation, bucket, limit, expiresAt) {
    const database = await db();
    if (!database) throw Object.assign(new Error('Shared quota storage is unavailable'), { status: 503 });
    const quotas = database.collection('usage_quotas');
    await quotas.createIndex({ key: 1 }, { unique: true });
    await quotas.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    const key = `${subject}:${operation}:${bucket}`;
    try {
      const result = await quotas.findOneAndUpdate(
        { key, $or: [{ count: { $lt: limit } }, { count: { $exists: false } }] },
        {
          $inc: { count: 1 },
          $set: { updatedAt: new Date() },
          $setOnInsert: { key, subject, operation, bucket, createdAt: new Date(), expiresAt }
        },
        { upsert: true, returnDocument: 'after' }
      );
      if (!result) throw Object.assign(new Error('Daily provider quota reached'), { status: 429 });
      return result.count;
    } catch (error) {
      if (error.code === 11000) throw Object.assign(new Error('Daily provider quota reached'), { status: 429 });
      throw error;
    }
  }

  function consumeDailyQuota(subject, operation, limit) {
    const day = new Date().toISOString().slice(0, 10);
    return consumeQuota(subject, operation, day, limit, new Date(Date.now() + 8 * 24 * 60 * 60 * 1000));
  }

  function consumeWindowQuota(subject, operation, limit, windowMs) {
    const bucket = String(Math.floor(Date.now() / windowMs));
    return consumeQuota(subject, operation, bucket, limit, new Date(Date.now() + (windowMs * 2)));
  }

  return { db, prompts, consumeDailyQuota, consumeWindowQuota, id };
}

module.exports = { createMongoStore };
