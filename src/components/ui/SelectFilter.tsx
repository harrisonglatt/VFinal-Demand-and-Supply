'use client';

interface SelectFilterProps {
  id: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
}

export default function SelectFilter({ id, options, value, onChange, allLabel = 'All' }: SelectFilterProps) {
  const sorted = [...new Set(options.filter(Boolean))].sort();

  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allLabel}</option>
      {sorted.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
