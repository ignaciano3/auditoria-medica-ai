import type { DocumentStatus, PageDocType, PageStatus } from "@audit/domain";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  originalFilename: text("original_filename").notNull(),
  originalKey: text("original_key").notNull(),
  status: text("status").$type<DocumentStatus>().notNull().default("uploaded"),
  pageCount: integer("page_count"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const documentPages = pgTable(
  "document_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    text: text("text").notNull().default(""),
    imageKey: text("image_key"),
    docType: text("doc_type").$type<PageDocType>().notNull().default("other"),
    handwritten: boolean("handwritten").notNull().default(false),
    dataBearing: boolean("data_bearing").notNull().default(true),
    status: text("status").$type<PageStatus>().notNull().default("pending"),
    skipReason: text("skip_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("document_pages_doc_page_idx").on(
      table.documentId,
      table.pageNumber,
    ),
  ],
);

export const clinicalRecords = pgTable("clinical_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  record: jsonb("record").notNull(),
  findings: jsonb("findings").notNull().default([]),
  patientName: text("patient_name"),
  admissionDate: text("admission_date"),
  dischargeDate: text("discharge_date"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const findingsReview = pgTable("findings_review", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  findingId: text("finding_id").notNull(),
  status: text("status").notNull().default("pending"),
  note: text("note"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  citedPages: jsonb("cited_pages").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accessLog = pgTable("access_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor"),
  action: text("action").notNull(),
  documentId: uuid("document_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
