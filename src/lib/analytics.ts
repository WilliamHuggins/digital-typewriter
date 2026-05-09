const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();

const sanitizePath = () => {
  const {origin, pathname} = window.location;
  return `${origin}${pathname}`;
};

export const initializeAnalytics = () => {
  if (!GA_MEASUREMENT_ID || typeof window === 'undefined') {
    return;
  }

  if (document.querySelector(`script[data-ga-id="${GA_MEASUREMENT_ID}"]`)) {
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  script.dataset.gaId = GA_MEASUREMENT_ID;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];

  const gtag = (...args: unknown[]) => {
    window.dataLayer.push(args);
  };

  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID, {
    anonymize_ip: true,
    allow_google_signals: false,
    page_location: sanitizePath(),
  });
};

declare global {
  interface Window {
    dataLayer: unknown[][];
  }
}
