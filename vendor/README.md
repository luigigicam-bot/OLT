# Browser dependencies

- SheetJS: 0.20.3 extracted from the existing application, license retained in index.html. Fixed unescaped line breaks inside its HTML export template; the existing inline copy failed to parse in production.
- Supabase JS: 2.117.3, UMD bundle from https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js. MIT. Pinned and served locally; no floating CDN version.


`manifest.json` fija SHA-256 de ambos bundles; `npm run check` comprueba integridad además de sintaxis. Una actualización requiere fuente oficial fijada, revisión de licencia/parches, nuevo hash y tests. Los hashes detectan alteración de archivos, no certifican ausencia de vulnerabilidades.
