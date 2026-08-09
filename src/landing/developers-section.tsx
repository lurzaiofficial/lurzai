import { useState, useEffect, useRef } from 'react';
import { Copy, Check } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';

const codeExamples = [
  {
    label: 'Ask',
    code: `// Chat with LURZ about a setup
await chat.send({
  message: 'Is BTC/USDT long on 1h?',
  symbol: 'BTC/USDT'
})`,
  },
  {
    label: 'Analyse',
    code: `const analysis = await api.analyse({
  symbol: 'ETH/USDT',
  timeframe: '4h'
})

console.log(analysis.verdict)`,
  },
  {
    label: 'Track',
    code: `await api.follow(signal.id)

const live = await api.liveSignal(signal.id)
// confidence, entry, invalidation`,
  },
];

const features = [
  {
    title: 'Indicator stack',
    description: 'RSI, MACD, EMAs, ATR and more scored together.',
  },
  {
    title: 'AI interpretation',
    description: 'Plain-language reasons behind every verdict.',
  },
  {
    title: 'Live evaluation',
    description: 'Followed signals refresh as the market moves.',
  },
  {
    title: 'History & stats',
    description: 'Review what worked so your process improves.',
  },
];

export function DevelopersSection() {
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const { openAuth } = useAuth();

  const handleCopy = () => {
    navigator.clipboard.writeText(codeExamples[activeTab].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="developers" ref={sectionRef} className="relative py-24 lg:py-32 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-start">
          <div
            className={`transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
              <span className="w-8 h-px bg-foreground/30" />
              For serious traders
            </span>
            <h2 className="text-4xl lg:text-6xl font-display tracking-tight mb-8">
              Ask. Analyse.
              <br />
              <span className="text-muted-foreground">Decide.</span>
            </h2>
            <p className="text-xl text-muted-foreground mb-12 leading-relaxed">
              Use the chat advisor, run full market analysis, and track signals —
              all without handing over execution.
            </p>

            <div className="grid grid-cols-2 gap-6">
              {features.map((feature, index) => (
                <div
                  key={feature.title}
                  className={`transition-all duration-500 ${
                    isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                  }`}
                  style={{ transitionDelay: `${index * 50 + 200}ms` }}
                >
                  <h3 className="font-medium mb-1">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div
            className={`lg:sticky lg:top-32 transition-all duration-700 delay-200 ${
              isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'
            }`}
          >
            <div className="border border-foreground/10">
              <div className="flex items-center border-b border-foreground/10">
                {codeExamples.map((example, idx) => (
                  <button
                    key={example.label}
                    type="button"
                    onClick={() => setActiveTab(idx)}
                    className={`px-6 py-4 text-sm font-mono transition-colors relative ${
                      activeTab === idx
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {example.label}
                    {activeTab === idx && (
                      <span className="absolute bottom-0 left-0 right-0 h-px bg-foreground" />
                    )}
                  </button>
                ))}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-4 py-4 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Copy code"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>

              <div className="p-8 font-mono text-sm bg-foreground/[0.01] min-h-[220px]">
                <pre className="text-foreground/80">
                  {codeExamples[activeTab].code.split('\n').map((line, lineIndex) => (
                    <div
                      key={`${activeTab}-${lineIndex}`}
                      className="leading-loose dev-code-line"
                      style={{ animationDelay: `${lineIndex * 80}ms` }}
                    >
                      <span className="inline-flex">
                        {line.split('').map((char, charIndex) => (
                          <span
                            key={`${activeTab}-${lineIndex}-${charIndex}`}
                            className="dev-code-char"
                            style={{
                              animationDelay: `${lineIndex * 80 + charIndex * 15}ms`,
                            }}
                          >
                            {char === ' ' ? '\u00A0' : char}
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </pre>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-6 text-sm">
              <button
                type="button"
                onClick={() => openAuth('signin')}
                className="text-foreground hover:underline underline-offset-4"
              >
                Open LURZ
              </button>
              <span className="text-foreground/20">|</span>
              <a href="#features" className="text-muted-foreground hover:text-foreground">
                Explore features
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
