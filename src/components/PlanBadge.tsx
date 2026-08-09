import { Crown, Sparkles, Zap } from 'lucide-react';
import type { PlanId, UserPlanView } from '../../shared/plans';
import { cn } from '../lib/utils';

const PLAN_STYLE: Record<
  PlanId,
  { icon: typeof Zap; chip: string; label: string }
> = {
  free: {
    icon: Zap,
    chip: 'border-border bg-muted text-foreground',
    label: 'Free plan',
  },
  pro: {
    icon: Sparkles,
    chip: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    label: 'Pro plan',
  },
  max: {
    icon: Crown,
    chip: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-400',
    label: 'Max plan',
  },
};

interface PlanBadgeProps {
  plan: UserPlanView | null;
  /** Show usage counts under the chip. */
  showUsage?: boolean;
  className?: string;
  compact?: boolean;
}

/** Visible Free / Pro / Max marker used in the dashboard chrome. */
export function PlanBadge({
  plan,
  showUsage = false,
  className,
  compact = false,
}: PlanBadgeProps) {
  if (!plan) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground',
          className
        )}
      >
        Loading plan…
      </span>
    );
  }

  const style = PLAN_STYLE[plan.id];
  const Icon = style.icon;
  const analysesLeft = Math.max(0, plan.maxAnalysesPerDay - plan.analysesUsedToday);
  const chatLeft = Math.max(0, plan.maxChatMessagesPerDay - plan.chatUsedToday);

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider',
          style.chip
        )}
        title={`${style.label} · ${plan.aiModelLabel}`}
      >
        <Icon className="h-3 w-3 shrink-0" />
        {compact ? plan.name : style.label}
        {!compact && (
          <span className="font-normal opacity-70 normal-case tracking-normal">
            · {plan.aiModelLabel}
          </span>
        )}
      </span>
      {showUsage && !compact && (
        <span className="text-[10px] text-muted-foreground font-mono pl-1">
          {analysesLeft}/{plan.maxAnalysesPerDay} analyses · {chatLeft}/
          {plan.maxChatMessagesPerDay} chat left today
        </span>
      )}
    </div>
  );
}

export function planLimitReachedMessage(
  plan: UserPlanView,
  kind: 'analyses' | 'chat' | 'tracked' | 'favourites'
): string {
  const upgrade =
    plan.id === 'free'
      ? ' Pro and Max plans with stronger models are coming soon.'
      : '';

  switch (kind) {
    case 'analyses':
      return `${plan.name} plan limit reached: ${plan.maxAnalysesPerDay} analyses per day.${upgrade}`;
    case 'chat':
      return `${plan.name} plan limit reached: ${plan.maxChatMessagesPerDay} chat messages per day.${upgrade}`;
    case 'tracked':
      return `${plan.name} plan limit reached: follow up to ${plan.maxActiveTracked} active signals.${upgrade}`;
    case 'favourites':
      return `${plan.name} plan limit reached: ${plan.maxFavourites} favourites.${upgrade}`;
  }
}
