import { forwardRef } from 'react';

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const baseClasses =
  'w-full rounded-[11px] border border-slate-300 bg-white px-4 py-3 text-[13px] text-slate-900 shadow-sm transition focus-visible:border-[#4caf50] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4caf50]/20';

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', ...props }, ref) => (
    <textarea ref={ref} className={`${baseClasses} ${className}`.trim()} {...props} />
  )
);

Textarea.displayName = 'Textarea';

export { Textarea };
