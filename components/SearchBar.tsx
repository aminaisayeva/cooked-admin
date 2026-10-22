// A GET form, so filters live in the URL and survive reloads.
export default function SearchBar({
  placeholder,
  q,
  children,
}: {
  placeholder: string;
  q: string;
  children?: React.ReactNode;
}) {
  return (
    <form className="flex flex-wrap items-center gap-2">
      <input
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-axis sm:max-w-xs"
      />
      {children}
      <button className="rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-wash">Apply</button>
    </form>
  );
}

export function Select({ name, value, options }: { name: string; value: string; options: [string, string][] }) {
  return (
    <select name={name} defaultValue={value} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}
