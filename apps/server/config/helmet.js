'use strict';

const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://js.stripe.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: [
        "'self'",
        'wss:',
        'https://*.supabase.co',
        'https://api.stripe.com',
        'https://maps.googleapis.com',
      ],
      frameSrc: ['https://js.stripe.com'],
      fontSrc: ["'self'", 'https:', 'data:'],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Stripe iframes need this disabled
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
};

module.exports = helmetOptions;
