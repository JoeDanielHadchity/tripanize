/// <reference types="@cloudflare/workers-types" />
/// <reference types="vite/client" />
interface CloudflareEnv {
  ASSETS: Fetcher;
  APP: DurableObjectNamespace;
  ATTACHMENTS: R2Bucket;
  APP_URL: string;
  BETTER_AUTH_URL: string;
  WORKERS_DEV_URL?: string;
  OPENAI_API_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}
declare module "*.sql" { const sql: string; export default sql; }
