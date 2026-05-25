import { forwardRef } from 'react';

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  onCheckedChange?: (checked: boolean) => void;
};

const baseClasses =
  'h-4 w-4 rounded border border-slate-400 text-[#2e7d32] accent-[#2e7d32] transition';

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', onCheckedChange, onChange, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={`${baseClasses} ${className}`.trim()}
      onChange={(event) => {
        onChange?.(event);
        onCheckedChange?.(event.target.checked);
      }}
      {...props}
    />
  )
);

Checkbox.displayName = 'Checkbox';

export { Checkbox };
