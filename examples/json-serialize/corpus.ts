// Real API response payloads for benchmarking.
// FROZEN — do not modify during autoresearch.

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { Schema } from "./src/serialize.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8"));

export interface TestCase {
  name: string;
  schema: Schema;
  data: unknown[];
}

export function generateCorpus(): TestCase[] {
  return [
    // JSONPlaceholder posts — 100 items, medium body text
    {
      name: "posts (100)",
      schema: {
        type: "object",
        properties: {
          userId: { type: "integer" },
          id: { type: "integer" },
          title: { type: "string" },
          body: { type: "string" },
        },
      },
      data: fix("jsonplaceholder-posts.json"),
    },

    // JSONPlaceholder comments — 500 items, string-heavy
    {
      name: "comments (500)",
      schema: {
        type: "object",
        properties: {
          postId: { type: "integer" },
          id: { type: "integer" },
          name: { type: "string" },
          email: { type: "string" },
          body: { type: "string" },
        },
      },
      data: fix("jsonplaceholder-comments.json"),
    },

    // JSONPlaceholder users — 10 items, flat fields only
    {
      name: "users (10)",
      schema: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          username: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          website: { type: "string" },
        },
      },
      data: fix("jsonplaceholder-users.json"),
    },

    // GitHub React issues — 30 items, many string fields, long markdown bodies
    {
      name: "gh-issues (30)",
      schema: {
        type: "object",
        properties: {
          url: { type: "string" },
          repository_url: { type: "string" },
          labels_url: { type: "string" },
          comments_url: { type: "string" },
          events_url: { type: "string" },
          html_url: { type: "string" },
          id: { type: "integer" },
          node_id: { type: "string" },
          number: { type: "integer" },
          title: { type: "string" },
          state: { type: "string" },
          locked: { type: "boolean" },
          comments: { type: "integer" },
          created_at: { type: "string" },
          updated_at: { type: "string" },
          author_association: { type: "string" },
          body: { type: "string" },
        },
      },
      data: fix("github-issues.json"),
    },
  ];
}
