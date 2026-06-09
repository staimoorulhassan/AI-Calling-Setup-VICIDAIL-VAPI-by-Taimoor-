import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  VAPI_API_KEY: z.string().min(1, 'VAPI_API_KEY is required'),
  VAPI_WEBHOOK_SECRET: z.string().min(1, 'VAPI_WEBHOOK_SECRET is required'),
  VAPI_SIP_HOST: z.string().default('sip.vapi.ai'),
  AVR_AMI_URL: z.string().url().default('http://localhost:6006'),
  AMI_HOST: z.string().optional(),
  AMI_PORT: z.coerce.number().default(5038),
  AMI_USER: z.string().optional(),
  AMI_PASSWORD: z.string().optional(),
  VICIDIAL_API_URL: z.string().url().optional(),
  VICIDIAL_API_USER: z.string().optional(),
  VICIDIAL_API_PASS: z.string().optional(),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Environment validation failed:\n${missing}`);
  }
  return result.data;
}

export const env = loadEnv();
