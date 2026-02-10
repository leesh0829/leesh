import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const DB_TIMEZONE = "Asia/Seoul";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is missing");

const pool =
  globalForPrisma.pgPool ??
  new Pool({
    connectionString,
  });

pool.on("connect", (client) => {
  void client.query(`SET TIME ZONE '${DB_TIMEZONE}'`).catch((err) => {
    console.error("Failed to set DB timezone:", err);
  });
});

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pool;
}
