import { cn } from "@/lib/utils";
import {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  forwardRef,
  useId,
} from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-ink mb-1.5"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "w-full h-11 px-3 rounded-lg border border-line bg-surface text-sm text-ink placeholder:text-ink-muted/70",
            "focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent",
            "disabled:bg-canvas disabled:text-ink-muted disabled:cursor-not-allowed",
            error && "border-danger focus:ring-danger",
            className
          )}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
        {hint && !error && (
          <p className="mt-1 text-sm text-ink-muted">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, placeholder, id, ...props }, ref) => {
    const autoId = useId();
    const selectId = id ?? autoId;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-ink mb-1.5"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            "w-full h-11 px-3 rounded-lg border border-line bg-surface text-sm text-ink",
            "focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent",
            "disabled:bg-canvas disabled:text-ink-muted disabled:cursor-not-allowed",
            error && "border-danger focus:ring-danger",
            className
          )}
          aria-invalid={error ? true : undefined}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const autoId = useId();
    const areaId = id ?? autoId;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={areaId}
            className="block text-sm font-medium text-ink mb-1.5"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={areaId}
          className={cn(
            "w-full min-h-[100px] px-3 py-2 rounded-lg border border-line bg-surface text-sm text-ink placeholder:text-ink-muted/70",
            "focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent",
            "disabled:bg-canvas disabled:text-ink-muted disabled:cursor-not-allowed",
            error && "border-danger focus:ring-danger",
            className
          )}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
