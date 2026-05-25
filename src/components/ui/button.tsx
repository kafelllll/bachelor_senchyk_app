import { forwardRef } from 'react';

type ButtonVariant = 'default' | 'outline';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const baseClasses =
  'inline-flex items-center justify-center gap-2 text-[14px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4caf50]/30 disabled:cursor-not-allowed disabled:opacity-60';

const variantClasses: Record<ButtonVariant, string> = {
  default:
    'bg-gradient-to-r from-[#2e7d32] to-[#49b04d] text-white shadow-[0_8px_18px_rgba(76,175,80,0.25)] hover:opacity-95',
  outline:
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`.trim()}
      {...props}
    />
  )
);

Button.displayName = 'Button';

export { Button };
