-- EPUB readers address positions with a CFI (Canonical Fragment Identifier),
-- not an integer page. Add a free-form location column to track it alongside
-- the existing integer current_page (still used by image/pdf readers).
ALTER TABLE reading_progress
    ADD COLUMN location TEXT;
