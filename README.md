# OLT — Programación y Control

El repositorio contiene Programación en la raíz y Control en `control-olt/`. Comparten Supabase; cada módulo tiene su proyecto Vercel y sus checks.

| Módulo | Rama de producción | Proyecto Vercel | Salida |
| --- | --- | --- | --- |
| Programación | `work/olt-estilo-azul` | `olt_programacion` | `dist-programacion/` |
| Control | `feature/olt-control` | `controlt` | `control-olt/dist/` |

Programación: `npm ci --ignore-scripts`, `npm run check`, `npm test`, `npm run build`.
Control: los mismos comandos desde `control-olt/`, excepto `check`.

Los builds deben utilizar el commit exacto y el proyecto correspondiente. `main` no se modificó. Los comandos de ignorar builds limitan cada proyecto a su rama; los despliegues por SHA requieren el archivo identificador del módulo. Revisar estado y SHA antes de dar una publicación por terminada.

## Correcciones de auditoría del 8 de octubre de 2026

- SAP se inserta por conjuntos de hasta 400 filas, conserva metadatos y permite repetir lotes idénticos. La reanudación busca la carga del propietario por hash. Requiere seleccionar nuevamente el mismo archivo.
- Programación usa recibos de lotes persistentes y guarda localmente solo el identificador del trabajo. Una respuesta perdida puede recuperarse al repetir el archivo sin duplicar registros.
- La tabla protege la unicidad de los 19 campos de negocio dentro de cada usuario mediante SHA-256. No elimina registros existentes.
- Control incorpora historial de cambios, versiones de edición, limpieza de sesión y paginación sin repetir todos los indicadores y opciones.
- Se valida la plantilla SAP antes de interpretar columnas posicionales. Los formatos desconocidos se señalan como incompletos.
- Dependencias del lector y del cliente tienen versiones y hashes fijados. Los archivos públicos de Programación se construyen separadamente del código, pruebas y SQL.

Las cuatro migraciones de auditoría de ingesta, recibos, edición y unicidad están aplicadas. Las versiones locales de archivo representan su orden; los timestamps del historial remoto pueden diferir. No ejecutarlas nuevamente en producción.

La migración `20261008170707_sap_exact_active_analytics.sql` está **pendiente**, bloqueada por revisión automática: reemplaza vistas y funciones compartidas. No aplicar ni habilitar la publicación analítica SAP sin aprobación específica.

`control-olt/supabase/schema-checkpoint.json` registra estructura y definiciones, sin datos de negocio. Es un checkpoint, no un instalador ni una copia de seguridad restaurada. Las migraciones dependen del esquema previo.

Pendientes administrativos: protección de ramas y checks obligatorios; confirmar respaldos mediante restauración; alertas y acceso a logs; protección de contraseñas filtradas en Auth. No se verificaron login real ni una carga real en navegador. Las pruebas SQL se ejecutaron en transacciones revertidas. No eliminar staging: el reporte SAP lo utiliza.
