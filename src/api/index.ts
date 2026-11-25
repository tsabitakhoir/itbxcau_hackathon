// API entry point. BE replaces the real implementation here (Supabase + src/core).
// Until then everything comes from the mock, which follows the same contract signatures.
// When BE is ready: keep `export * from './mock'` behind VITE_USE_MOCK=true and export the real functions otherwise.
export * from './mock';
