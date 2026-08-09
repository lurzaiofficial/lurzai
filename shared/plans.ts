/**
 * Subscription plans for LURZ AI.
 *
 * Free is live today. Pro / Max are defined so the product and model tiers
 * are clear on the marketing site; billing unlocks them later.
 */

export type PlanId = 'free' | 'pro' | 'max';

export type PlanAvailability = 'available' | 'coming_soon';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  /** Monthly sticker price (USD). Null = custom / contact. */
  priceMonthly: number | null;
  /** Effective monthly price when billed annually (USD). */
  priceAnnual: number | null;
  availability: PlanAvailability;
  /** OpenRouter model id used for Analyse + chat on this plan. */
  aiModel: string;
  /** Short label shown in UI (not the raw model id). */
  aiModelLabel: string;
  aiTierNote: string;
  maxAnalysesPerDay: number;
  maxChatMessagesPerDay: number;
  maxActiveTracked: number;
  maxFavourites: number;
  canChangeModel: boolean;
  features: string[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Learn markets with a solid basic AI model',
    priceMonthly: 0,
    priceAnnual: 0,
    availability: 'available',
    aiModel: 'google/gemini-2.5-flash',
    aiModelLabel: 'Basic AI',
    aiTierNote: 'Fast general analysis — enough to learn the desk workflow.',
    maxAnalysesPerDay: 5,
    maxChatMessagesPerDay: 20,
    maxActiveTracked: 3,
    maxFavourites: 10,
    canChangeModel: false,
    features: [
      'Basic AI model for Analyse & chat',
      'Up to 5 analyses per day',
      'Up to 20 chat messages per day',
      'Follow up to 3 active signals',
      'Live charts across major markets',
      'Personal signal history',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'Near pro-level accuracy with a moderate model',
    priceMonthly: 29,
    priceAnnual: 24,
    availability: 'coming_soon',
    aiModel: 'openai/gpt-4o-mini',
    aiModelLabel: 'Moderate AI',
    aiTierNote: 'Stronger reasoning for clearer setups — below Max, above Free.',
    maxAnalysesPerDay: 40,
    maxChatMessagesPerDay: 200,
    maxActiveTracked: 25,
    maxFavourites: 50,
    canChangeModel: false,
    features: [
      'Moderate AI model (near pro-level)',
      'Up to 40 analyses per day',
      'Higher chat allowance',
      'Follow more active signals',
      'Priority analysis queue',
      'Full multi-market coverage',
    ],
  },
  max: {
    id: 'max',
    name: 'Max',
    tagline: 'Highest accuracy with the most powerful models',
    priceMonthly: 79,
    priceAnnual: 65,
    availability: 'coming_soon',
    aiModel: 'anthropic/claude-sonnet-4',
    aiModelLabel: 'Powerful AI',
    aiTierNote: 'Top-tier models for the most careful, detailed verdicts.',
    maxAnalysesPerDay: 150,
    maxChatMessagesPerDay: 1000,
    maxActiveTracked: 100,
    maxFavourites: 100,
    canChangeModel: true,
    features: [
      'Most powerful AI models',
      'Highest daily analysis limits',
      'Desk-scale chat & tracking',
      'Model choice when available',
      'Priority support',
      'Best accuracy among plans',
    ],
  },
};

/** Ordered for marketing / pricing UI. */
export const PLAN_ORDER: PlanId[] = ['free', 'pro', 'max'];

/** Everyone is on Free until billing ships. */
export const DEFAULT_PLAN_ID: PlanId = 'free';

export function getPlan(id: PlanId = DEFAULT_PLAN_ID): PlanDefinition {
  return PLANS[id] ?? PLANS.free;
}

/** Public snapshot returned by the API (no secrets). */
export interface UserPlanView {
  id: PlanId;
  name: string;
  availability: PlanAvailability;
  aiModel: string;
  aiModelLabel: string;
  aiTierNote: string;
  maxAnalysesPerDay: number;
  maxChatMessagesPerDay: number;
  maxActiveTracked: number;
  maxFavourites: number;
  canChangeModel: boolean;
  /** Analyses already used today (filled by API). */
  analysesUsedToday: number;
  /** Chat messages already used today (filled by API). */
  chatUsedToday: number;
  upgradeNote: string;
}

export function toUserPlanView(
  plan: PlanDefinition,
  usage: { analysesUsedToday: number; chatUsedToday: number }
): UserPlanView {
  return {
    id: plan.id,
    name: plan.name,
    availability: plan.availability,
    aiModel: plan.aiModel,
    aiModelLabel: plan.aiModelLabel,
    aiTierNote: plan.aiTierNote,
    maxAnalysesPerDay: plan.maxAnalysesPerDay,
    maxChatMessagesPerDay: plan.maxChatMessagesPerDay,
    maxActiveTracked: plan.maxActiveTracked,
    maxFavourites: plan.maxFavourites,
    canChangeModel: plan.canChangeModel,
    analysesUsedToday: usage.analysesUsedToday,
    chatUsedToday: usage.chatUsedToday,
    upgradeNote:
      plan.id === 'free'
        ? 'Pro and Max plans are coming soon for stronger AI models and higher limits.'
        : '',
  };
}
