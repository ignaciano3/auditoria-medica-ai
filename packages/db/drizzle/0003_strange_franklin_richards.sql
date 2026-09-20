CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"llm_provider" text NOT NULL,
	"llm_model" text NOT NULL,
	"ocr_provider" text NOT NULL,
	"ocr_model" text NOT NULL,
	"openai_api_key_enc" text,
	"deepseek_api_key_enc" text,
	"dashscope_api_key_enc" text,
	"opencode_api_key_enc" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
