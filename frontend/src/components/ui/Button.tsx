import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";

    const variants = {
      primary:
        "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500",
      secondary:
        "bg-slate-100 text-slate-900 hover:bg-slate-200 focus-visible:ring-slate-500",
      outline:
        "border border-slate-300 bg-transparent text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-500",
      ghost:
        "bg-transparent text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-500",
      danger:
        "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
    };

    const sizes = {
      sm: "h-8 px-3 text-sm",
      md: "h-10 px-4 text-sm",
      lg: "h-12 px-6 text-base",
    };

    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          fullWidth && "w-full",
          className
        )}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
