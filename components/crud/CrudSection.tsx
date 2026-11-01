import SearchBar from "@/components/SearchBar";
import { DeleteRow, RowForm } from "@/components/crud/RowForm";
import { formatDateTime, type Supabase } from "@/lib/admin";
import { entity, type Values } from "@/lib/crud";

type Row = Values & { id: string; created_at: string; updated_at?: string };

function show(value: Values[string], options?: [string, string][]) {
  if (value === null || value === undefined || value === "") return <span className="text-muted">—</span>;
  if (typeof value === "boolean") return value ? "Yes" : <span className="text-muted">No</span>;
  const label = options?.find(([v]) => v === value)?.[1];
  return label ?? String(value);
}

// One table from lib/crud.ts: an add form, then every row with edit/delete.
export default async function CrudSection({
  supabase,
  entityKey,
  q = "",
  searchable = true,
  heading: Heading = "h1",
}: {
  supabase: Supabase;
  entityKey: string;
  q?: string;
  searchable?: boolean;
  heading?: "h1" | "h2";
}) {
  const e = entity(entityKey);

  // Options for selects that point at other tables (e.g. a model's provider).
  const options: Record<string, [string, string][]> = {};
  for (const f of e.fields) {
    if (!f.optionsFrom) continue;
    const { data } = await supabase.from(f.optionsFrom.table).select(`id, ${f.optionsFrom.label}`).order(f.optionsFrom.order);
    options[f.name] = ((data ?? []) as unknown as Record<string, string>[]).map((r) => [r.id, r[f.optionsFrom!.label]]);
  }

  let query = supabase.from(e.table).select("*").order(e.order.column, { ascending: e.order.ascending });
  const term = q.replace(/[%,()*]/g, " ").trim();
  if (term && e.search) query = query.or(e.search.map((c) => `${c}.ilike.%${term}%`).join(","));
  const { data, error } = await query.limit(500);
  const rows = (data ?? []) as Row[];
  const listed = e.fields.filter((f) => f.list !== false);

  return (
    <section className="space-y-4">
      <div>
        <Heading className={Heading === "h1" ? "text-2xl font-semibold" : "text-lg font-semibold"}>{e.title}</Heading>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">{e.about}</p>
      </div>

      <details className="rounded-xl border border-line bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium">+ Add a {e.singular}</summary>
        <div className="mt-4">
          <RowForm entityKey={entityKey} options={options} />
        </div>
      </details>

      {searchable && e.search && <SearchBar placeholder={`Search ${e.title.toLowerCase()}`} q={q} />}

      {error ? (
        <p role="alert" className="text-sm text-critical">Couldn’t load {e.title.toLowerCase()}: {error.message}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-muted">{term ? "Nothing matches." : `No ${e.title.toLowerCase()} yet.`}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-2">
              <tr>
                {listed.map((f) => (
                  <th key={f.name} scope="col" className="px-3 py-2 font-medium">
                    {f.label}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 font-medium">Updated</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line align-top last:border-0">
                  {listed.map((f) => (
                    <td key={f.name} className={`px-3 py-2 ${f.kind === "textarea" ? "min-w-56 max-w-md" : "whitespace-nowrap"} ${f.kind === "number" ? "tabular-nums" : ""}`}>
                      {show(row[f.name], f.options ?? options[f.name])}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{formatDateTime(row.updated_at ?? row.created_at)}</td>
                  <td className="px-3 py-2">
                    <details className="group">
                      <summary className="cursor-pointer list-none text-sm text-ink-2 hover:text-ink">Edit</summary>
                      <div className="mt-3 w-[min(36rem,80vw)] space-y-3 rounded-lg border border-line bg-page p-3">
                        <RowForm entityKey={entityKey} row={row} options={options} />
                        <DeleteRow entityKey={entityKey} id={row.id} label={`this ${e.singular}`} />
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">{rows.length} {rows.length === 1 ? e.singular : e.title.toLowerCase()}</p>
    </section>
  );
}
