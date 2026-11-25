# Private print master uploads

High-resolution source uploads accept up to 52,428,800 bytes (50 MiB,
displayed as MB to match the existing interface). The effective application
limit is the minimum of this target, the live private `print-masters` bucket
limit, and `PRINT_MASTER_PROJECT_LIMIT_BYTES` when configured on the server.
Set that environment variable in bytes if the project's global Storage limit
is lower. The Storage SDK does not expose the project's global setting;
Storage enforces it during transfer and a 413 is shown as a size-limit error.

The existing `20261125_print_asset_generation.sql` migration already creates
the private bucket with a 52,428,800-byte limit. No migration raises an
intentionally lower bucket limit. Check the live bucket and the project's
Storage Settings before expecting 50 MB in production. Never make this
bucket public or weaken its restrictive policy for resumable uploads.

Both PrintAssetGenerator and PrintProductionPanel share the same transfer:

1. The authenticated admin API checks the live bucket policy and signs an
   admin/artwork/request-scoped staging path.
2. Files up to 6 MiB reuse `uploadToSignedUrl`. Larger files use Supabase TUS
   with the same scoped signature, 6 MiB chunks, acknowledged-byte progress,
   bounded retries, and HEAD offset reconciliation after interruptions.
   Hosted projects use the direct Storage hostname. Retries resume within
   the active transfer; page reloads start a new upload.
3. `upload_complete` reads Storage object info and verifies size and MIME
   type. No upload ID is returned to the preparation flow until this succeeds.
4. Existing source decoding, preview, quality comparison, generation and
   transactional revision commit remain in place. Only successfully stored
   output is linked to the print; failed staging transfers cannot replace an
   existing master. Existing staging cleanup still runs after generation.

The API carries JSON only; source bytes never pass through a Next.js body.
No service credentials or public master URL are sent to the browser.

Validation: `node --test tests/printSourceUpload.test.mjs` covers boundary
sizes, effective limits, incomplete uploads, direct upload ordering, TUS
chunks, progress, interrupted transfers, signature origin checks and 413s.
Before release, also test a valid image larger than 25 MB through preview
and generation in an authenticated deployment, interrupt its network, and
confirm its preview and master download. Live Supabase, the full build and
browser integration checks were unavailable in the editing environment.
