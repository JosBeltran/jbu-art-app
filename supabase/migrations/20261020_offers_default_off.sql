-- 20261020: las obras nuevas NO reciben ofertas salvo que se active "Permitir ofertas".
-- Requiere 20261019. No modifica obras existentes (conservan su valor actual). Idempotente.
alter table public.artworks alter column accepts_offers set default false;
