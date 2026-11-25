import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let memoryReplSet: MongoMemoryReplSet | null = null;
let connectionMode: 'atlas' | 'memory-replset' | 'disconnected' = 'disconnected';
let transactionSupported = true;

export async function connectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  const uri = process.env.MONGODB_URI?.trim();

  if (uri) {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    connectionMode = 'atlas';
    // Verify replica set capability for transactions (Atlas M0+ supports transactions)
    try {
      const admin = mongoose.connection.db?.admin();
      const info = await admin?.command({ hello: 1 });
      transactionSupported = Boolean(info?.setName || info?.msg === 'isdbgrid');
    } catch {
      transactionSupported = false;
    }
    console.log(`[DB] Connected to MongoDB (${connectionMode}, transactions=${transactionSupported})`);
    return;
  }

  // Fallback for preview sandbox before MONGODB_URI is configured:
  // Boots an in-process MongoDB Replica Set so Mongoose schemas, indexes,
  // aggregations, and ACID transactions run against a real MongoDB engine.
  memoryReplSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const memUri = memoryReplSet.getUri('khayre_wms');
  await mongoose.connect(memUri);
  connectionMode = 'memory-replset';
  transactionSupported = true;
  console.log('[DB] Connected to local MongoDB Replica Set (transactions=true)');
}

export async function runInTransaction<T>(
  work: (session: mongoose.ClientSession | null) => Promise<T>
): Promise<T> {
  if (!transactionSupported) {
    return work(null);
  }

  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export function getDatabaseStatus() {
  const states: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return {
    state: states[mongoose.connection.readyState] || 'unknown',
    mode: connectionMode,
    transactions: transactionSupported,
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null,
  };
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  if (memoryReplSet) {
    await memoryReplSet.stop();
    memoryReplSet = null;
  }
  connectionMode = 'disconnected';
}
