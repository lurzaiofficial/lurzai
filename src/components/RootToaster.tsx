import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';

function readTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/** Global sonner host so landing auth and the dashboard share one toast surface. */
export function RootToaster() {
  const [theme, setTheme] = useState<'light' | 'dark'>(readTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  return <Toaster position="top-right" theme={theme} richColors closeButton />;
}
