-- =====================================================================
-- 0005 · Categories seen in real Max / Leumi exports that 0002 lacked
-- Safe to run more than once: skips any name that already exists.
-- =====================================================================
insert into public.categories (name, default_tag, sort_order)
select v.name, v.tag, v.ord
from (
  values
    ('ביטוח',        'personal', 105),
    ('טיפוח',        'personal', 85),
    ('העברות',       'personal', 115),
    ('הלוואות',      'personal', 125),
    ('עמלות ובנק',   'personal', 135)
) as v (name, tag, ord)
where not exists (
  select 1 from public.categories c where c.name = v.name and c.parent_id is null
);
