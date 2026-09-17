ALTER TABLE "clinical_records" ADD COLUMN "extraction_incomplete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clinical_records" ADD COLUMN "failed_chunk_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "clinical_records_document_id_idx" ON "clinical_records" USING btree ("document_id");