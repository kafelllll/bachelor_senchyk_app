import { forwardRef } from 'react';

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const baseClasses =
  'w-full rounded-[11px] border border-slate-300 bg-white px-4 text-[13px] text-slate-900 shadow-sm transition focus-visible:border-[#4caf50] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4caf50]/20';

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={`${baseClasses} ${className}`.trim()}
      {...props}
    />
  )
);

Input.displayName = 'Input';

export { Input };
