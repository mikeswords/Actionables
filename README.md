# Actionables

A web-only list app for personal errands and shared house lists, styled to match the `Workout App` design language.

## What is in here

- `index.html`, `styles.css`, `app.js`: the static frontend
- `config.js`: front-end config for Supabase
- `supabase/schema.sql`: tables, helper functions, and RLS policies

## Modes

- If `config.js` is blank, the app runs in local preview mode with seeded demo data.
- If `config.js` has a Supabase URL and anon key, the app runs in live multi-user mode.

## Your setup steps

1. Create a Supabase project.
2. Open the SQL Editor and run [supabase/schema.sql](/Users/mikeswords/Documents/Actionables/supabase/schema.sql).
3. In Supabase Auth, keep Email auth enabled.
4. Edit [config.js](/Users/mikeswords/Documents/Actionables/config.js) with:
   - `supabaseUrl`
   - `supabaseAnonKey`
5. Deploy this folder as its own site.

## Vercel deployment

1. Put this folder in its own repo, or upload it as a standalone static site.
2. Import that repo into Vercel.
3. Deploy.

## First live run

1. Create your account.
2. Have your wife create hers.
3. One of you creates the shared space.
4. The other joins with the shared-space code.
5. Create private lists for personal tasks and shared lists for combined tasks.

## Notes

- The Supabase anon key is designed to be public in browser apps when Row Level Security is enabled.
- If signup does not immediately log you in, Supabase may be waiting on email confirmation. Confirm the email, then sign in.
