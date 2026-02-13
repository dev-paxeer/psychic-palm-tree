import { pgTable, serial, text, integer, timestamp, varchar, jsonb } from 'drizzle-orm/pg-core';

/** Competition submissions */
export const submissions = pgTable('submissions', {
  id: serial('id').primaryKey(),
  walletAddress: varchar('wallet_address', { length: 42 }).notNull(),
  projectName: varchar('project_name', { length: 255 }).notNull(),
  description: text('description').notNull(),
  repoUrl: text('repo_url').notNull(),
  demoUrl: text('demo_url'),
  category: varchar('category', { length: 50 }).notNull(),
  votes: integer('votes').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/** Developer profiles */
export const profiles = pgTable('profiles', {
  id: serial('id').primaryKey(),
  walletAddress: varchar('wallet_address', { length: 42 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }),
  bio: text('bio'),
  twitter: varchar('twitter', { length: 100 }),
  github: varchar('github', { length: 100 }),
  website: text('website'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/** Scaffold generation logs */
export const scaffoldLogs = pgTable('scaffold_logs', {
  id: serial('id').primaryKey(),
  /** Template category: 'contract' | 'dapp' | 'fullstack' */
  scaffoldType: varchar('scaffold_type', { length: 20 }).notNull(),
  template: varchar('template', { length: 80 }).notNull(),
  projectName: varchar('project_name', { length: 255 }).notNull(),
  walletAddress: varchar('wallet_address', { length: 42 }),
  /** Variables used for generation */
  variables: jsonb('variables'),
  /** S3 key for the generated archive */
  s3Key: text('s3_key'),
  /** Download count */
  downloads: integer('downloads').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
