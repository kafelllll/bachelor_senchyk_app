import { forwardRef } from 'react';

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

const baseClasses = 'text-[12px] font-semibold text-slate-900';

const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className = '', ...props }, ref) => (
    <label ref={ref} className={`${baseClasses} ${className}`.trim()} {...props} />
  )
);

Label.displayName = 'Label';

export { Label };
