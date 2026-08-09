import { useEffect } from 'react';
import { Navigation } from './navigation';
import { HeroSection } from './hero-section';
import { FeaturesSection } from './features-section';
import { HowItWorksSection } from './how-it-works-section';
import { InfrastructureSection } from './infrastructure-section';
import { MetricsSection } from './metrics-section';
import { IntegrationsSection } from './integrations-section';
import { SecuritySection } from './security-section';
import { DevelopersSection } from './developers-section';
import { TestimonialsSection } from './testimonials-section';
import { PricingSection } from './pricing-section';
import { CtaSection } from './cta-section';
import { FooterSection } from './footer-section';
import './landing.css';

export default function HomePage() {
  useEffect(() => {
    // Keep the document light so landing ↔ app handoff stays continuous;
    // the app shell owns `.dark` when the user toggles theme there.
    document.documentElement.classList.remove('dark');
    document.title = 'LURZ AI — Market signals that guide your next move';
    return () => {
      document.title = 'LURZ AI - Crypto Trading Assistant';
    };
  }, []);

  return (
    <div className="landing-root">
      <main className="relative min-h-screen overflow-x-hidden noise-overlay">
        <Navigation />
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
        <InfrastructureSection />
        <MetricsSection />
        <IntegrationsSection />
        <SecuritySection />
        <DevelopersSection />
        <TestimonialsSection />
        <PricingSection />
        <CtaSection />
        <FooterSection />
      </main>
    </div>
  );
}
