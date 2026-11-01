// The simple create/read/update/delete tables, described once. The generic
// page (components/crud) and Server Actions (app/actions/crud.ts) read these;
// the database checks and row level security have the final say.
import { STYLE_EMOJI } from "@/lib/voices";

export type Field = {
  name: string;
  label: string;
  kind: "text" | "textarea" | "number" | "boolean" | "select";
  required?: boolean;
  max?: number; // characters (text) or largest value (number)
  min?: number;
  step?: number;
  pattern?: RegExp;
  patternHint?: string;
  lowercase?: boolean;
  placeholder?: string;
  help?: string;
  // select: fixed options, or rows of another table.
  options?: [string, string][];
  optionsFrom?: { table: string; label: string; order: string };
  defaultValue?: string | number | boolean;
  // Shown in the list. Defaults to true.
  list?: boolean;
};

export type Entity = {
  key: string;
  table: string;
  path: string;
  title: string;
  singular: string;
  about: string;
  order: { column: string; ascending: boolean };
  search?: string[];
  fields: Field[];
};

const ENTITIES: Entity[] = [
  {
    key: "terms",
    table: "terms",
    path: "/terms",
    title: "Terms",
    singular: "term",
    about: "Campus glossary pasted into every caption prompt as {{terms}}, so the voices get Columbia references right.",
    order: { column: "term", ascending: true },
    search: ["term", "definition"],
    fields: [
      { name: "term", label: "Term", kind: "text", required: true, max: 60, placeholder: "Butler" },
      { name: "definition", label: "Definition", kind: "textarea", required: true, max: 300 },
      { name: "example", label: "Example", kind: "textarea", max: 300, help: "Optional. Not sent to the model." },
    ],
  },
  {
    key: "examples",
    table: "generation_examples",
    path: "/examples",
    title: "AI generation examples",
    singular: "example",
    about: "Example captions for each voice, pasted into the caption prompt as {{examples}} (few-shot). Inactive ones are left out.",
    order: { column: "created_at", ascending: false },
    search: ["caption", "photo_description"],
    fields: [
      { name: "voice", label: "Voice", kind: "select", required: true, options: Object.entries(STYLE_EMOJI).map(([v, e]) => [v, `${e} ${v}`]) },
      { name: "photo_description", label: "Photo", kind: "textarea", required: true, max: 300, placeholder: "What's in the photo" },
      { name: "caption", label: "Caption", kind: "textarea", required: true, max: 280 },
      { name: "is_active", label: "Active", kind: "boolean", defaultValue: true },
    ],
  },
  {
    key: "models",
    table: "llm_models",
    path: "/models",
    title: "LLM models",
    singular: "model",
    about: "Models the caption pipeline tries, lowest priority first, moving on when one is overloaded. A chain step can pin a model. Only Google models are called; others are skipped.",
    order: { column: "priority", ascending: true },
    search: ["name", "api_model_id"],
    fields: [
      { name: "provider_id", label: "Provider", kind: "select", required: true, optionsFrom: { table: "llm_providers", label: "name", order: "name" } },
      { name: "name", label: "Name", kind: "text", required: true, max: 80, placeholder: "Gemini Flash (latest)" },
      { name: "api_model_id", label: "API model id", kind: "text", required: true, max: 120, placeholder: "gemini-flash-latest" },
      { name: "priority", label: "Priority", kind: "number", required: true, min: 0, max: 1000, step: 1, defaultValue: 100 },
      { name: "temperature", label: "Temperature", kind: "number", required: true, min: 0, max: 2, step: 0.05, defaultValue: 1 },
      { name: "max_output_tokens", label: "Max output tokens", kind: "number", required: true, min: 64, max: 32000, step: 1, defaultValue: 2000 },
      { name: "is_active", label: "Active", kind: "boolean", defaultValue: true },
    ],
  },
  {
    key: "providers",
    table: "llm_providers",
    path: "/providers",
    title: "LLM providers",
    singular: "provider",
    about: "Companies whose models can answer. The key itself lives in a server environment variable; only its name is stored here. A provider can't be deleted while it has models.",
    order: { column: "name", ascending: true },
    search: ["name", "slug"],
    fields: [
      { name: "name", label: "Name", kind: "text", required: true, max: 60, placeholder: "Google Gemini" },
      { name: "slug", label: "Slug", kind: "text", required: true, max: 40, lowercase: true, pattern: /^[a-z0-9-]{2,40}$/, patternHint: "lowercase letters, numbers and -", placeholder: "google" },
      { name: "api_base_url", label: "API base URL", kind: "text", max: 300, pattern: /^https:\/\//, patternHint: "an https:// URL" },
      { name: "api_key_env", label: "Key env var", kind: "text", max: 64, pattern: /^[A-Z][A-Z0-9_]{1,63}$/, patternHint: "an env var name like GEMINI_API_KEY", placeholder: "GEMINI_API_KEY" },
      { name: "is_active", label: "Active", kind: "boolean", defaultValue: true },
    ],
  },
  {
    key: "domains",
    table: "allowed_signup_domains",
    path: "/signups",
    title: "Allowed sign-up domains",
    singular: "domain",
    about: "New cooked.ai accounts (email or Google) need an address at one of these domains or on the whitelist. With no domains listed, anyone can sign up. Existing accounts are never affected.",
    order: { column: "domain", ascending: true },
    search: ["domain"],
    fields: [
      { name: "domain", label: "Domain", kind: "text", required: true, max: 120, lowercase: true, pattern: /^[a-z0-9-]+(\.[a-z0-9-]+)+$/, patternHint: "a domain like columbia.edu (no @)", placeholder: "columbia.edu" },
    ],
  },
  {
    key: "whitelist",
    table: "whitelisted_emails",
    path: "/signups",
    title: "Whitelisted email addresses",
    singular: "email address",
    about: "These addresses can sign up even when their domain isn't allowed.",
    order: { column: "email", ascending: true },
    search: ["email", "note"],
    fields: [
      { name: "email", label: "Email", kind: "text", required: true, max: 254, lowercase: true, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, patternHint: "an email address", placeholder: "friend@gmail.com" },
      { name: "note", label: "Note", kind: "text", max: 200, placeholder: "Who this is" },
    ],
  },
];

export function entity(key: string): Entity {
  const e = ENTITIES.find((x) => x.key === key);
  if (!e) throw new Error(`Unknown table ${key}`);
  return e;
}

export type Values = Record<string, string | number | boolean | null>;

// Form data -> column values, or what's wrong with it.
export function parseForm(e: Entity, form: FormData): { values: Values } | { error: string } {
  const values: Values = {};
  for (const f of e.fields) {
    const raw = form.get(f.name);
    if (f.kind === "boolean") {
      values[f.name] = raw === "on";
      continue;
    }
    let text = typeof raw === "string" ? raw.trim() : "";
    if (f.lowercase) text = text.toLowerCase();
    if (!text) {
      if (f.required) return { error: `${f.label} is required.` };
      values[f.name] = null;
      continue;
    }
    if (f.kind === "number") {
      const n = Number(text);
      if (!Number.isFinite(n)) return { error: `${f.label} must be a number.` };
      if (f.step === 1 && !Number.isInteger(n)) return { error: `${f.label} must be a whole number.` };
      if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) return { error: `${f.label} must be between ${f.min} and ${f.max}.` };
      values[f.name] = n;
      continue;
    }
    if (f.max && text.length > f.max) return { error: `${f.label} can be at most ${f.max} characters.` };
    if (f.pattern && !f.pattern.test(text)) return { error: `${f.label} must be ${f.patternHint}.` };
    if (f.options && !f.options.some(([v]) => v === text)) return { error: `Pick a ${f.label.toLowerCase()}.` };
    values[f.name] = text;
  }
  return { values };
}
