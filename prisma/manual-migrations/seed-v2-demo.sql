-- ============================================================
-- v2 demo seed — run AFTER seed-vibrnd2-demo.sql (and after the app has
-- been opened once so creative types are seeded, or run the block below).
-- Adds: creative types (if missing), an Acme package with quotas, a planned
-- month of content across statuses, a follow-up, and a photographer booking
-- so a fresh setup demos the whole v2 spine. Safe to re-run.
-- ============================================================

BEGIN;

-- Creative types (idempotent by org+slug)
INSERT INTO "creative_types" ("id","organizationId","name","slug","icon","color","countsAsShoot","isActive","sortOrder")
SELECT v.id, 'demo_org', v.name, v.slug, v.icon, v.color, v.shoot, true, v.ord
FROM (VALUES
  ('demo_ct_post','Post','post','🖼️','#6366f1',false,0),
  ('demo_ct_reel','Reel','reel','🎬','#ec4899',false,2),
  ('demo_ct_shoot','Photo Shoot','photo-shoot','📸','#10b981',true,5)
) AS v(id,name,slug,icon,color,shoot,ord)
ON CONFLICT ("organizationId","slug") DO NOTHING;

-- Give Priya the photographer designation for the booking lane
UPDATE "users" SET "designation" = 'PHOTOGRAPHER' WHERE "id" = 'demo_u_priya' AND "designation" IS NULL;

-- Package: 12 posts / 4 reels / 1 shoot @ 60k INR
INSERT INTO "client_packages" ("id","organizationId","clientId","name","startMonth","billingAmount","currency","isActive","createdAt","updatedAt")
VALUES ('demo_pkg_acme','demo_org','demo_c_acme','Acme Social — Standard', date_trunc('month', now()), 60000, 'INR', true, now(), now())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "package_quotas" ("id","packageId","creativeTypeId","monthlyQty")
SELECT v.id, 'demo_pkg_acme', ct.id, v.qty
FROM (VALUES
  ('demo_pq_post','post',12),
  ('demo_pq_reel','reel',4),
  ('demo_pq_shoot','photo-shoot',1)
) AS v(id,slug,qty)
JOIN "creative_types" ct ON ct."organizationId"='demo_org' AND ct."slug"=v.slug
ON CONFLICT ("packageId","creativeTypeId") DO NOTHING;

-- A planned month of content across statuses (dates relative to now)
INSERT INTO "content_items" ("id","organizationId","clientId","date","creativeTypeId","topic","description","status","isExtra","isAdHoc","createdById","createdAt","updatedAt")
SELECT v.id,'demo_org','demo_c_acme', now() + (v.offset_days || ' days')::interval, ct.id, v.topic, v.descr, v.status::"ContentStatus", v.extra, false, 'demo_owner', now(), now()
FROM (VALUES
  ('demo_ci_1','post','Product hero shot','Hero shot for the flagship SKU','PLANNED',false,'2'),
  ('demo_ci_2','post','Founder quote card','Brand-voice quote graphic','ASSIGNED',false,'4'),
  ('demo_ci_3','reel','Recipe reel','15s summer cooler recipe','IN_REVIEW',false,'6'),
  ('demo_ci_4','reel','BTS reel','Behind the scenes at the shoot','TEAM_APPROVED',false,'8'),
  ('demo_ci_5','post','Festive teaser','Countdown teaser','CLIENT_APPROVED',false,'10'),
  ('demo_ci_6','shoot','Monthly product shoot','Studio day for the new line','PLANNED',false,'12'),
  ('demo_ci_7','post','Extra meme post','Trending-format meme','POSTED',true,'-3')
) AS v(id,slug_key,topic,descr,status,extra,offset_days)
JOIN "creative_types" ct ON ct."organizationId"='demo_org'
  AND ct."slug" = CASE v.slug_key WHEN 'shoot' THEN 'photo-shoot' ELSE v.slug_key END
ON CONFLICT ("id") DO NOTHING;

-- Follow-up due today
INSERT INTO "follow_ups" ("id","organizationId","clientId","assignedToId","note","dueAt","status","createdById","createdAt")
VALUES ('demo_fu_1','demo_org','demo_c_acme','demo_owner','Confirm the festive campaign budget', now(), 'PENDING', 'demo_owner', now())
ON CONFLICT ("id") DO NOTHING;

-- Photographer booking tomorrow, linked to the shoot item
INSERT INTO "bookings" ("id","organizationId","photographerId","clientId","contentItemId","startAt","endAt","location","status","isAdHoc","createdById","createdAt","updatedAt")
VALUES ('demo_bk_1','demo_org','demo_u_priya','demo_c_acme','demo_ci_6',
  date_trunc('day', now()) + interval '1 day 10 hours',
  date_trunc('day', now()) + interval '1 day 13 hours',
  'Acme HQ, BKC', 'CONFIRMED', false, 'demo_owner', now(), now())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
