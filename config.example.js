/* Copy this file to config.js and fill in your Supabase project values.
 *
 * The anon key is safe to ship in a static PWA because Row Level Security
 * (see supabase/schema.sql) blocks cross-account reads. Never put the
 * service_role key in this file.
 *
 * GitHub Pages only serves committed files. After filling this in, either:
 *   cp config.example.js config.js
 *   # edit config.js, then:
 *   git add -f config.js
 * or keep config.js gitignored and set the same values another way.
 */
window.RENTAL_HOME_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY'
};
