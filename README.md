# OLT · Recepción de programación

Aplicación estática que lee y valida Excel en el navegador y utiliza Supabase Auth y PostgreSQL con RLS. No utiliza Apps Script ni Google Sheets.

## Desarrollo y verificación

```sh
npm ci --ignore-scripts
npm run check
npm test
python3 -m http.server 8765
```

Las pruebas de interfaz usan JSDOM, un lector XLSX real y servicios simulados. No escriben en Supabase ni verifican credenciales reales. Las pruebas de base de datos realizadas durante esta mejora se ejecutaron con transacciones revertidas y roles PostgreSQL simulados.

## Organización

| Archivo | Responsabilidad |
| --- | --- |
| `index.html`, `styles.css`, `styles/` | Interfaz y estilos existentes |
| `config.js` | Configuración pública, exclusivamente clave publishable |
| `validaciones.js` | Catálogos, encabezados y reglas de validación originales |
| `excel.js` | Lectura local, selección de pestaña y hash SHA-256 del archivo |
| `app.js` | Estado de revisión, edición, paginación, calidad y exportación |
| `supabase.js` | Cliente, sesión compartida y formato de fechas |
| `auth.js` | Inicio/cierre de sesión y puerta de acceso |
| `duplicados.js` | Comparación visual de los 19 campos, dentro del usuario |
| `envio.js` | Confirmación y envío en lotes de 500 mediante RPC |
| `historial.js`, `dashboard.js` | Últimos envíos y resumen mensual agregado |
| `errores.js` | Mensajes seguros por categoría y logs sin datos ni tokens |
| `vendor/` | Dependencias fijadas y servidas localmente |
| `supabase/migrations/` | Migraciones ya aplicadas, versiones coincidentes con Supabase |

Los scripts siguen siendo clásicos, con estado compartido y orden explícito en el HTML. Esta extracción conservadora evita cambiar simultáneamente el contrato interno de la aplicación. Una siguiente etapa puede convertirlos en módulos ES después de aislar el estado.

## Flujo de publicación

1. Trabajar en `work/olt-mejoras` o una nueva rama de trabajo.
2. Ejecutar los checks y revisar el Preview de Vercel correspondiente al commit exacto.
3. Validar login real y un Excel de prueba en un entorno con datos de prueba.
4. Revisar el PR y sus cambios de base de datos.
5. Integrar en `main` únicamente después de validar: los pushes a `main` actualmente despliegan producción.

No fusionar un PR con checks fallidos. `main` no tenía protección durante la auditoría; crear un PR no impide técnicamente futuros pushes directos. Configurar protección de rama y requerir el check `checks` es una tarea pendiente del administrador.

**El Preview utiliza el mismo Supabase que producción.** El Preview aísla el frontend, no los datos. Las pruebas automáticas usan servicios simulados. No enviar Excel reales desde Preview para probar sin un entorno de base de datos separado.

## Duplicados y compatibilidad

`olt_insertar_lote` usa una transacción y un bloqueo por usuario para serializar sus llamadas. Compara los 19 campos de negocio, ignora metadatos del archivo y omite coincidencias exactas. Usa un índice no único con hash como localizador y compara también la clave completa para evitar falsos duplicados por una colisión. Propietario, identidad y fecha se calculan en el servidor. El frontend conserva su revisión visual previa.

La protección se aplica a llamadas concurrentes que pasan por esa RPC. Por compatibilidad, el frontend antiguo conserva INSERT directo y puede omitirla. No es una restricción global de la tabla. Los registros idénticos de usuarios distintos siguen permitidos; definir unicidad global exige aclarar propiedad, privacidad y registros legítimos. Se conservó el grupo de duplicados ya existente.

Cada lote es atómico; un archivo de hasta 5.000 filas sigue enviándose en varios lotes. Un fallo posterior puede dejar lotes previos confirmados. El mensaje informa cuántos se confirmaron y el reintento omite esos registros.

## Base de datos y roles futuros

La migración de seguridad conserva las políticas de SELECT e INSERT por propietario, restringe permisos y añade PK e índices. Las RPC nuevas son `SECURITY INVOKER`, con `search_path` fijo y sin ejecución anónima.

No reaplicar estas migraciones sobre OLT: ya constan en su historial. Un entorno limpio necesita primero el esquema original de `recepcion_olt`, sus políticas y `rls_auto_enable`; estas migraciones son incrementales.

Consultar `docs/arquitectura.md` para las propuestas de cargas, roles y escalabilidad, y `docs/informe.md` para la auditoría y sus límites.
