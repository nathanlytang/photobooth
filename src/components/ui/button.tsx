import * as React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variants = {
      default: 'bg-zinc-900 text-white hover:bg-zinc-800',
      outline: 'border border-zinc-200 bg-white hover:bg-zinc-50',
      ghost: 'hover:bg-zinc-100',
      destructive: 'bg-red-600 text-white hover:bg-red-700',
    };
    const sizes = {
      default: 'h-9 px-4 py-2',
      sm: 'h-8 px-3 text-sm',
      lg: 'h-11 px-8',
    };
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex cursor-pointer items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-50',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button };
