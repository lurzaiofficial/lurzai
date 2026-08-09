import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';

const plans = [
  {
    name: 'Explorer',
    description: 'For learning markets with AI guidance',
    price: { monthly: 0, annual: 0 },
    features: [
      'Core AI signals',
      'Crypto market coverage',
      'Live charts & chat',
      'Signal history basics',
      'Personal signal history',
    ],
    cta: 'Sign in free',
    popular: false,
  },
  {
    name: 'Pilot',
    description: 'For active multi-market traders',
    price: { monthly: 29, annual: 24 },
    features: [
      'Crypto, stocks, forex, commodities',
      'Followed signal tracking',
      'Quantitative scorecards',
      'Priority AI analysis',
      'Full signal stats',
      'Saved favourites & workflows',
    ],
    cta: 'Start Pilot',
    popular: true,
  },
  {
    name: 'Desk',
    description: 'For teams and serious volume',
    price: { monthly: null, annual: null },
    features: [
      'Everything in Pilot',
      'Shared watchlists',
      'Custom indicator weighting',
      'Dedicated support',
      'Usage analytics',
      'Onboarding for your desk',
    ],
    cta: 'Talk to us',
    popular: false,
  },
];

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
            Simple plans for
            <br />
            <span className="text-stroke">clearer trades</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl">
            Start free. Upgrade when you want every market and deeper tracking.
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
            onClick={() => setIsAnnual(!isAnnual)}
            className="relative w-14 h-7 bg-foreground/10 rounded-full p-1 transition-colors hover:bg-foreground/20"
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
              Save 17%
            </span>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-px bg-foreground/10">
          {plans.map((plan, idx) => (
            <div
              key={plan.name}
              className={`relative p-8 lg:p-12 bg-background ${
                plan.popular ? 'md:-my-4 md:py-12 lg:py-16 border-2 border-foreground' : ''
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-8 px-3 py-1 bg-foreground text-primary-foreground text-xs font-mono uppercase tracking-widest">
                  Most Popular
                </span>
              )}

              <div className="mb-8">
                <span className="font-mono text-xs text-muted-foreground">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <h3 className="font-display text-3xl text-foreground mt-2">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mt-2">{plan.description}</p>
              </div>

              <div className="mb-8 pb-8 border-b border-foreground/10">
                {plan.price.monthly !== null ? (
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-5xl lg:text-6xl text-foreground">
                      ${isAnnual ? plan.price.annual : plan.price.monthly}
                    </span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                ) : (
                  <span className="font-display text-4xl text-foreground">Custom</span>
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

              <button
                type="button"
                onClick={() => openAuth(plan.price.monthly === 0 ? 'signup' : 'signin')}
                className={`w-full py-4 flex items-center justify-center gap-2 text-sm font-medium transition-all group ${
                  plan.popular
                    ? 'bg-foreground text-primary-foreground hover:bg-foreground/90'
                    : 'border border-foreground/20 text-foreground hover:border-foreground hover:bg-foreground/5'
                }`}
              >
                {plan.cta}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          ))}
        </div>

        <p className="mt-12 text-center text-sm text-muted-foreground">
          Every plan includes the full LURZ workspace.{' '}
          <button
            type="button"
            onClick={() => openAuth('signin')}
            className="underline underline-offset-4 hover:text-foreground transition-colors"
          >
            Open the app
          </button>
        </p>
      </div>
    </section>
  );
}
