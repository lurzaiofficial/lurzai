import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { AnimatedWave } from './animated-wave';

const footerLinks = {
  Product: [
    { name: 'Features', href: '#features' },
    { name: 'How it works', href: '#how-it-works' },
    { name: 'Pricing', href: '#pricing' },
    { name: 'Markets', href: '#markets' },
  ],
  Product2: [
    { name: 'Open app', href: '#', isAuth: 'signin' as const },
    { name: 'Sign in', href: '#', isAuth: 'signin' as const },
    { name: 'Security', href: '#security' },
    { name: 'Integrations', href: '#integrations' },
  ],
  Company: [
    { name: 'About', href: '#' },
    { name: 'Blog', href: '#' },
    { name: 'Contact', href: '#' },
  ],
  Legal: [
    { name: 'Privacy', href: '#' },
    { name: 'Terms', href: '#' },
    { name: 'Disclaimer', href: '#security' },
  ],
};

const socialLinks = [
  { name: 'Twitter', href: '#' },
  { name: 'GitHub', href: '#' },
  { name: 'LinkedIn', href: '#' },
];

export function FooterSection() {
  const { openAuth } = useAuth();

  return (
    <footer className="relative border-t border-foreground/10">
      <div className="absolute inset-0 h-64 opacity-20 pointer-events-none overflow-hidden">
        <AnimatedWave />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="py-16 lg:py-24">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-12 lg:gap-8">
            <div className="col-span-2">
              <a href="/" className="inline-flex items-center gap-2 mb-6">
                <span className="text-2xl font-display">LURZ</span>
                <span className="text-xs text-muted-foreground font-mono">AI</span>
              </a>

              <p className="text-muted-foreground leading-relaxed mb-8 max-w-xs">
                AI trade signals for crypto, stocks, forex and commodities — clarity for
                discretionary traders.
              </p>

              <div className="flex gap-6">
                {socialLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 group"
                  >
                    {link.name}
                    <ArrowUpRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </a>
                ))}
              </div>
            </div>

            {Object.entries(footerLinks).map(([title, links]) => (
              <div key={title}>
                <h3 className="text-sm font-medium mb-6">
                  {title === 'Product2' ? 'Get started' : title}
                </h3>
                <ul className="space-y-4">
                  {links.map((link) => (
                    <li key={link.name}>
                      {'isAuth' in link && link.isAuth ? (
                        <button
                          type="button"
                          onClick={() => openAuth(link.isAuth)}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {link.name}
                        </button>
                      ) : (
                        <a
                          href={link.href}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {link.name}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="py-8 border-t border-foreground/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {new Date().getFullYear()} LURZ AI. Not financial advice.
          </p>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Markets streaming
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
