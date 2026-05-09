const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();

const isValidGaMeasurementId = (value: string) => /^G-[A-Z0-9]+$/i.test(value);

const sanitizePath = () => {
  const {origin, pathname} = window.location;
  return `${origin}${pathname}`;
};

const warnAnalyticsDisabled = (reason: string) => {
  if (import.meta.env.DEV) {
    console.warn(`[analytics] Google Analytics disabled: ${reason}`);
  }
};

export const initializeAnalytics = () => {
  if (typeof window === 'undefined') {
    return;
  }

  if (!GA_MEASUREMENT_ID) {
    warnAnalyticsDisabled('VITE_GA_MEASUREMENT_ID is empty.');
    return;
  }

  if (!isValidGaMeasurementId(GA_MEASUREMENT_ID)) {
    warnAnalyticsDisabled(
      `VITE_GA_MEASUREMENT_ID value "${GA_MEASUREMENT_ID}" is invalid. Expected format: G-XXXXXXXXXX.`,
    );
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

  window.gtag = (...args: unknown[]) => {
    window.dataLayer.push(args);
  };

  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, {
    anonymize_ip: true,
    allow_google_signals: false,
    page_location: sanitizePath(),
  });

  if (import.meta.env.DEV) {
    console.info(`[analytics] Initialized GA with measurement ID ${GA_MEASUREMENT_ID}.`);
  }
};

declare global {
  interface Window {
    dataLayer: unknown[][];
    gtag: (...args: unknown[]) => void;
  }
}
