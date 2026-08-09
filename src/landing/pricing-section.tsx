import { useState } from 'react';
import { ArrowRight, Check, Clock } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { PLAN_ORDER, PLANS, type PlanId } from '../../shared/plans';

export function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(true);
  const { openAuth } = useAuth();

  return (
    <section id="pricing" className="relative py-32 lg:py-40 border-t border-foreground/10">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="max-w-3xl mb-20">
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase block mb-6">
            Pricing
          </span>
          <h2 className="font-display text-5xl md:text-6xl lg:text-7xl tracking-tight text-foreground mb-6">
            Plans by
            <br />
            <span className="text-stroke">AI power</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl">
            Free uses a basic model with daily limits. Pro and Max unlock stronger models for more
            accurate analysis — coming soon.
          </p>
        </div>

        <div className="flex items-center gap-4 mb-16">
          <span
            className={`text-sm transition-colors ${
              !isAnnual ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            Monthly
          </span>
          <button
            type="button"
            onClick={() => setIsAnnual(!isAnnual)}
            className="relative w-14 h-7 bg-foreground/10 rounded-full p-1 transition-colors hover:bg-foreground/20"
            aria-label="Toggle annual billing"
          >
            <div
              className={`w-5 h-5 bg-foreground rounded-full transition-transform duration-300 ${
                isAnnual ? 'translate-x-7' : 'translate-x-0'
              }`}
            />
          </button>
          <span
            className={`text-sm transition-colors ${
              isAnnual ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            Annual
          </span>
          {isAnnual && (
            <span className="ml-2 px-2 py-1 bg-foreground text-primary-foreground text-xs font-mono">
              Save on Pro & Max
            </span>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-px bg-foreground/10">
          {PLAN_ORDER.map((id, idx) => {
            const plan = PLANS[id as PlanId];
            const comingSoon = plan.availability === 'coming_soon';
            const popular = plan.id === 'pro';
            const price = isAnnual ? plan.priceAnnual : plan.priceMonthly;

            return (
              <div
                key={plan.id}
                className={`relative p-8 lg:p-12 bg-background ${
                  popular ? 'md:-my-4 md:py-12 lg:py-16 border-2 border-foreground' : ''
                } ${comingSoon ? 'opacity-95' : ''}`}
              >
                {popular && (
                  <span className="absolute -top-3 left-8 px-3 py-1 bg-foreground text-primary-foreground text-xs font-mono uppercase tracking-widest">
                    Best value
                  </span>
                )}
                {comingSoon && (
                  <span className="absolute top-6 right-6 inline-flex items-center gap-1.5 px-2.5 py-1 border border-foreground/20 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    Coming soon
                  </span>
                )}

                <div className="mb-8">
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <h3 className="font-display text-3xl text-foreground mt-2">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mt-2">{plan.tagline}</p>
                  <p className="mt-3 text-xs font-mono text-foreground/80">
                    {plan.aiModelLabel}
                    <span className="text-muted-foreground"> · {plan.aiTierNote}</span>
                  </p>
                </div>

                <div className="mb-8 pb-8 border-b border-foreground/10">
                  {price !== null ? (
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-5xl lg:text-6xl text-foreground">
                        ${price}
                      </span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                  ) : (
                    <span className="font-display text-4xl text-foreground">Custom</span>
                  )}
                  {comingSoon && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Pricing shown for launch — checkout opens when the plan goes live.
                    </p>
                  )}
                </div>

                <ul className="space-y-4 mb-10">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-foreground mt-0.5 shrink-0" />
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                {comingSoon ? (
                  <button
                    type="button"
                    disabled
                    className="w-full py-4 flex items-center justify-center gap-2 text-sm font-medium border border-foreground/15 text-muted-foreground cursor-not-allowed"
                  >
                    Coming soon
                    <Clock className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openAuth('signup')}
                    className="w-full py-4 flex items-center justify-center gap-2 text-sm font-medium transition-all group border border-foreground/20 text-foreground hover:border-foreground hover:bg-foreground/5"
                  >
                    Start free
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-12 text-center text-sm text-muted-foreground">
          Free includes the LURZ desk with a basic AI model and daily limits.{' '}
          <button
            type="button"
            onClick={() => openAuth('signin')}
            className="underline underline-offset-4 hover:text-foreground transition-colors"
          >
            Sign in to the app
          </button>
        </p>
      </div>
    </section>
  );
}
