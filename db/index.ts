import postgres from "postgres";

const globalForSql = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
};

const sql =
  globalForSql.sql ?? postgres(process.env.DATABASE_URL!, { ssl: "require" });

if (process.env.NODE_ENV !== "production") globalForSql.sql = sql;

export default sql;