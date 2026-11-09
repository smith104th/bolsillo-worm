// Filled in at build time from config.json. The key here is the public "publishable" key:
// it's meant to live in the app. Row level security keeps each pocket private.
export const CONFIG = {
  supabaseUrl: __SUPABASE_URL__,
  supabaseKey: __SUPABASE_KEY__,
  vapidPublicKey: __VAPID_PUBLIC__,
  version: __VERSION__,
};
