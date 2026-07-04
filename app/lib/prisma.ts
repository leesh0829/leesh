import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const DB_TIMEZONE = "Asia/Seoul";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaProxy?: PrismaClient;
  pgPool?: Pool;
};

function getConnectionString() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is missing");
  return connectionString;
}

function getPool() {
  if (globalForPrisma.pgPool) return globalForPrisma.pgPool;

  const pool = new Pool({
    connectionString: getConnectionString(),
  });

  pool.on("connect", (client) => {
    void client
      .query("SELECT set_config('TimeZone', $1, false)", [DB_TIMEZONE])
      .catch((err) => {
        console.error("Failed to set DB timezone:", err);
      });
  });

  globalForPrisma.pgPool = pool;

  return pool;
}

export function getPrisma() {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const adapter = new PrismaPg(getPool());
  const client = new PrismaClient({
    adapter,
    log: ["error"],
  });

  globalForPrisma.prisma = client;

  return client;
}

export const prisma =
  globalForPrisma.prismaProxy ??
  new Proxy({} as PrismaClient, {
    get(_target, prop, receiver) {
      const value = Reflect.get(getPrisma(), prop, receiver);
      return typeof value === "function" ? value.bind(getPrisma()) : value;
    },
  });

globalForPrisma.prismaProxy = prisma;
