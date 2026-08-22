export const config = {
  port: Number(process.env.PORT || 10000),
  databaseUrl: process.env.DATABASE_URL || null,
  nodeEnv: process.env.NODE_ENV || "production"
};
