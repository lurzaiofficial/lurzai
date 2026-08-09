/**
 * Resolves the caller's subscription plan and applies Free-tier guardrails.
 *
 * Billing is not wired yet — every session is treated as Free. Pro / Max
 * definitions live in shared/plans for the marketing site and future unlocks.
 */

import {
  DEFAULT_PLAN_ID,
  getPlan,
  toUserPlanView,
  type PlanDefinition,
  type PlanId,
  type UserPlanView,
} from '../../shared/plans';
import type { ServerSettings } from '../../shared/types';
import { store } from './store';

export function resolvePlanId(_userId: string): PlanId {
  // Paid plans ship later. Until then everyone is Free.
  return DEFAULT_PLAN_ID;
}

export function resolvePlan(userId: string): PlanDefinition {
  return getPlan(resolvePlanId(userId));
}

export function buildUserPlanView(userId: string, analysesUsedToday: number): UserPlanView {
  const plan = resolvePlan(userId);
  return toUserPlanView(plan, {
    analysesUsedToday,
    chatUsedToday: store.getChatUsageToday(userId),
  });
}

/** Force Free/Pro/Max ceilings onto settings the client sees and the desk uses. */
export function applyPlanToSettings(settings: ServerSettings, plan: PlanDefinition): ServerSettings {
  return {
    ...settings,
    aiModel: plan.canChangeModel ? settings.aiModel || plan.aiModel : plan.aiModel,
    maxSignalsPerDay: Math.min(settings.maxSignalsPerDay, plan.maxAnalysesPerDay),
    favourites: settings.favourites.slice(0, plan.maxFavourites),
  };
}

export function planModelForRequest(userId: string, settings: ServerSettings): string {
  const plan = resolvePlan(userId);
  if (plan.canChangeModel && settings.aiModel.trim()) return settings.aiModel.trim();
  return plan.aiModel;
}
