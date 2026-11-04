-- =====================================================================
-- 0002 · Starter categories (editable later in the app)
-- =====================================================================
with parents (name, default_tag, sort_order) as (
  values
    ('דיור',          'apartment', 10),
    ('חשבונות',       'apartment', 20),
    ('סופר',          'apartment', 30),
    ('ציוד לבית',     'apartment', 40),
    ('אוכל בחוץ',     'personal',  50),
    ('תחבורה',        'personal',  60),
    ('בריאות',        'personal',  70),
    ('ביגוד',         'personal',  80),
    ('בילויים',       'personal',  90),
    ('מנויים',        'personal', 100),
    ('מתנות',         'personal', 110),
    ('חופשות',        'personal', 120),
    ('לימודים',       'personal', 130),
    ('שונות',         null,       999)
),
inserted as (
  insert into public.categories (name, default_tag, sort_order)
  select name, default_tag, sort_order from parents
  returning id, name
)
insert into public.categories (name, parent_id, default_tag, sort_order)
select c.child, i.id, c.tag, c.ord
from (
  values
    ('דיור',     'שכר דירה',   'apartment', 1),
    ('חשבונות',  'חשמל',       'apartment', 1),
    ('חשבונות',  'מים',        'apartment', 2),
    ('חשבונות',  'ארנונה',     'apartment', 3),
    ('חשבונות',  'אינטרנט',    'apartment', 4),
    ('חשבונות',  'גז',         'apartment', 5),
    ('חשבונות',  'ועד בית',    'apartment', 6),
    ('תחבורה',   'דלק',        'personal',  1),
    ('תחבורה',   'תחבורה ציבורית', 'personal', 2),
    ('תחבורה',   'חניה',       'personal',  3)
) as c (parent, child, tag, ord)
join inserted i on i.name = c.parent;
