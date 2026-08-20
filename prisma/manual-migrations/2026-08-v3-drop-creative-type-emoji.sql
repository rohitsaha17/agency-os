-- Creative types are identified by colour, not emoji.
--
-- Phase 3 seeded an emoji into creative_types.icon for every default type
-- (Reel = clapperboard, Post = framed picture, and so on). Those rendered
-- across the calendar, the plan, the package tab and the review page.
--
-- Emoji draw differently on every OS, ignore the type's own colour, and read
-- as decoration in a tool people work in all day. Every creative type already
-- carries a colour, so the colour became the mark — see CreativeTypeDot.
--
-- The `icon` COLUMN stays: an agency that deliberately sets a lucide icon name
-- can still do so. Only the seeded emoji are cleared.
--
-- Idempotent — safe to re-run.

BEGIN;

UPDATE creative_types
   SET icon = NULL
 WHERE icon IS NOT NULL
   -- Anything outside plain ASCII is an emoji we seeded, never a lucide name.
   AND icon !~ '^[a-zA-Z0-9_-]+$';

COMMIT;
