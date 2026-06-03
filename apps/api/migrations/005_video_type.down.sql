-- Revert: remove 'video' from check constraints.

ALTER TABLE torrent_files
  DROP CONSTRAINT IF EXISTS torrent_files_file_type_check;

ALTER TABLE torrent_files
  ADD CONSTRAINT torrent_files_file_type_check
  CHECK (file_type IN ('image', 'pdf', 'epub', 'cbz', 'cbr', 'unknown'));

ALTER TABLE library_items
  DROP CONSTRAINT IF EXISTS library_items_content_type_check;

ALTER TABLE library_items
  ADD CONSTRAINT library_items_content_type_check
  CHECK (content_type IN ('manga', 'book', 'document', 'other'));
