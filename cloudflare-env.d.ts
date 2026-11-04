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
  OPENAI_ADMIN_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_LIGHT_MODEL?: string;
  OPENAI_WEB_SEARCH?: string;
  OPENAI_MAX_SEARCHES?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  SUPPORT_EMAIL?: string;
  COMPANY_ADMIN_EMAIL?: string;
  PLAN_ACCESS_ENABLED?: string;
  CREDITS_ENABLED?: string;
  PADDLE_ENVIRONMENT?: "sandbox" | "live";
  PADDLE_API_KEY?: string;
  PADDLE_CLIENT_TOKEN?: string;
  PADDLE_WEBHOOK_SECRET?: string;
  PADDLE_CHECKOUT_ENABLED?: string;
  PADDLE_PRICE_900?: string;
  PADDLE_PRICE_1500?: string;
  PADDLE_PRICE_2500?: string;
  PADDLE_PRICE_600?: string;
  PADDLE_PRICE_1000?: string;
  PADDLE_PRICE_1600?: string;
  PADDLE_CREDITS_PRICE_500?: string;
  PADDLE_CREDITS_PRICE_1500?: string;
  PADDLE_CREDITS_PRICE_2500?: string;
  PADDLE_CREDITS_PRICE_5000?: string;
  PADDLE_SANDBOX_API_KEY?: string;
  PADDLE_SANDBOX_CLIENT_TOKEN?: string;
  PADDLE_SANDBOX_WEBHOOK_SECRET?: string;
  PADDLE_SANDBOX_PRICE_1500?: string;
  PADDLE_SANDBOX_CREDITS_PRICE_500?: string;
  PADDLE_SANDBOX_CREDITS_PRICE_1500?: string;
  PADDLE_SANDBOX_CREDITS_PRICE_2500?: string;
  PADDLE_SANDBOX_CREDITS_PRICE_5000?: string;
}
declare module "*.sql" { const sql: string; export default sql; }
