alter table docs add column sort_at double precision;
create index docs_parent_sort_idx on docs (parent, sort_at);
