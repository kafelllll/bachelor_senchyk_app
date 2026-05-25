import { Label } from './ui/label';

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

type OptionGroupProps<T extends string> = {
  label: string;
  helper?: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (next: T) => void;
};

export default function OptionGroup<T extends string>({
  label,
  helper,
  options,
  value,
  onChange,
}: OptionGroupProps<T>) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="!text-[14px] font-semibold text-slate-900">{label}</Label>
        {helper ? <p className="text-sm text-slate-600">{helper}</p> : null}
      </div>

      <div className="flex flex-wrap gap-2.5">
        {options.map((option) => {
          const active = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                'max-w-full min-w-[110px] rounded-xl border px-4 py-2 text-center text-sm font-semibold leading-5 whitespace-normal break-words transition-all',
                active
                  ? 'border-green-600 bg-gradient-to-r from-[#2e7d32] to-[#49b04d] text-white shadow-sm'
                  : 'border-gray-300 bg-white text-slate-600 hover:border-green-300 hover:bg-green-50 hover:text-green-700'
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
