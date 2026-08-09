import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 select-none",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-muted text-muted-foreground hover:bg-muted/80",
        buy:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold",
        sell:
          "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold",
        hold:
          "border-border bg-muted/80 text-muted-foreground font-medium",
        bullish:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-bold",
        bearish:
          "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300 font-bold",
        paper:
          "border-border bg-muted text-foreground font-semibold",
        live:
          "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300 font-semibold animate-pulse",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  className?: string;
  children?: React.ReactNode;
}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

