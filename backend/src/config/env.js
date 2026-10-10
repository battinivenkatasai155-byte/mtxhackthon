const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional()
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    DATABASE_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().url().refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol), {
        message: 'DATABASE_URL must use the postgres or postgresql scheme.'
      }).optional()
    ),
    JWT_SECRET: optionalString,
    JWT_EXPIRES_IN: z.string().regex(/^[1-9][0-9]*(s|m|h|d|w)$/).default('1h'),
    CLASSIFICATION_PROVIDER_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().url().optional()
    ),
    CLASSIFICATION_PROVIDER_API_KEY: optionalString,
    CLUSTER_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.42),
    HIGH_PRIORITY_THRESHOLD: z.coerce.number().int().min(1).max(100).default(55),
    CRITICAL_PRIORITY_THRESHOLD: z.coerce.number().int().min(1).max(100).default(80),
    GRIEVANCE_DUE_HOURS: z.coerce.number().int().min(1).max(8760).default(72),
    ESCALATION_INTERVAL_MS: z.coerce.number().int().min(60000).max(604800000).default(900000),
    PGHOST: optionalString,
    PGPORT: z.coerce.number().int().min(1).max(65535).default(5432),
    PGUSER: optionalString,
    PGPASSWORD: optionalString,
    PGDATABASE: optionalString,
    PG_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10)
  })
  .superRefine((values, context) => {
    const providerUrl = values.CLASSIFICATION_PROVIDER_URL
      ? new URL(values.CLASSIFICATION_PROVIDER_URL)
      : null;
    if (
      providerUrl &&
      values.CLASSIFICATION_PROVIDER_API_KEY &&
      providerUrl.protocol !== 'https:' &&
      !['localhost', '127.0.0.1', '::1'].includes(providerUrl.hostname)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CLASSIFICATION_PROVIDER_URL'],
        message: 'An API key may only be sent to HTTPS providers (except localhost during development).'
      });
    }

    if (
      values.NODE_ENV === 'production' &&
      (!values.JWT_SECRET || values.JWT_SECRET.startsWith('replace_with_'))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'Set JWT_SECRET to a non-placeholder secret in production.'
      });
    }
    if (
      values.NODE_ENV === 'production' &&
      !(values.DATABASE_URL || (values.PGHOST && values.PGUSER && values.PGDATABASE))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'A PostgreSQL connection is required in production.'
      });
    }

    if (values.JWT_SECRET && values.JWT_SECRET.length < 32) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must contain at least 32 characters.'
      });
    }
    if (
      values.HIGH_PRIORITY_THRESHOLD >= values.CRITICAL_PRIORITY_THRESHOLD
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CRITICAL_PRIORITY_THRESHOLD'],
        message: 'CRITICAL_PRIORITY_THRESHOLD must exceed HIGH_PRIORITY_THRESHOLD.'
      });
    }

    const discreteValues = [
      values.PGHOST,
      values.PGUSER,
      values.PGPASSWORD,
      values.PGDATABASE
    ];
    const hasDiscreteConfig = discreteValues.some((value) => value !== undefined);

    if (values.DATABASE_URL && hasDiscreteConfig) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'Use DATABASE_URL or PG* settings, not both.'
      });
    }

    if (hasDiscreteConfig && (!values.PGHOST || !values.PGUSER || !values.PGDATABASE)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PGHOST'],
        message: 'PGHOST, PGUSER, and PGDATABASE are required together.'
      });
    }
  });

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const details = result.error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

const parsed = result.data;

module.exports = Object.freeze({
  ...parsed,
  corsOrigins: parsed.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  databaseConfigured: Boolean(parsed.DATABASE_URL || parsed.PGHOST)
});
