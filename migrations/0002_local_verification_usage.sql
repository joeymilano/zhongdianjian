-- Three local edge-runtime diagnostic reservations performed after initial seed.
UPDATE budget SET reserved_fen=reserved_fen+300, bailian=bailian+3 WHERE id=1;
