'use client';

interface ButtonGroupProps {
  options: { value: string; label: string }[];
  active: string;
  onChange: (value: string) => void;
}

export default function ButtonGroup({ options, active, onChange }: ButtonGroupProps) {
  return (
    <div className="bg">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`btn${opt.value === active ? ' on' : ''}`}
          onClick={() => onChange(opt.value)}
          type="button"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
