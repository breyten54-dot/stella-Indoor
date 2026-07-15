// Demo preview build flag — set VITE_DEMO_MODE=true at build time to produce
// a review-only copy of the app: auto-signed-in fake visitor, booking creation
// disabled. Never enable for the production build.
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
