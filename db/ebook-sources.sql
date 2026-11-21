-- Where a digital copy came from, so a catalogue entry can show its rights basis.
alter table book_files
  add column if not exists source text not null default 'upload'
  check (source in ('upload', 'gutenberg'));

alter table book_files add column if not exists source_ref text;
alter table book_files add column if not exists source_url text;
alter table book_files add column if not exists rights_basis text;
