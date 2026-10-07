# Informe OLT — 7 de octubre de 2026

Trabajo autorizado en el adjunto: auditoría y mejoras conservadoras del proyecto. No se fusionó `main` ni se publicó el frontend nuevo en producción.

## Estado inicial comprobado

- GitHub: repositorio público `luigigicam-bot/OLT`, `main` en `02782d72dd934379dea9580dcc93cc66a3279b7c`, sin protección de rama. Solo `README.md` e `index.html` (1.054.112 bytes). No había tests, pipeline ni migraciones versionadas.
- Supabase: proyecto OLT `vuoqmesrwgkkdqrecxnc`, PostgreSQL 17.11, región us-east-2, organización Free. Una tabla pública `recepcion_olt`, RLS activado, dos políticas para authenticated (SELECT e INSERT por propietario), 7 filas, ids 1–7, identity BY DEFAULT sin PK. Sin índices. FK de usuario con ON DELETE SET NULL.
- La función `rls_auto_enable()` es un event trigger SECURITY DEFINER, propietario postgres, search_path pg_catalog, utilizado por `ensure_rls` para habilitar RLS en tablas públicas nuevas. Su ACL inicial concedía ejecución por PUBLIC. No hay una llamada de frontend que la necesite; no debía eliminarse.
- `anon` y `authenticated` tenían todos los permisos de tabla, incluido TRUNCATE (no sujeto a RLS), aunque las policies solo permitían SELECT/INSERT de propietario.
- Security Advisor: dos WARN por ejecución pública/autenticada de la función y un WARN por leaked password protection desactivado. Performance: FK sin índice, dos políticas con evaluación repetida de auth.uid(), y ausencia de PK.
- Duplicados: el frontend canoniza null/undefined a vacío, recorta espacios, convierte números a String, y compara una matriz ordenada de los 19 campos. Excluye propietario, archivo, hash, pestaña y fecha de inserción de la comparación. RLS limita la búsqueda al usuario. Se halló un grupo ya duplicado por los 19 campos dentro del usuario.
- Dashboard/historial: descargaban hasta 5.000 filas del mes para contar; los totales podían truncarse. El historial agrupa por hash del archivo y puede combinar pestañas y reintentos.
- Envío: revisión visual, segunda revisión y lotes de 500 INSERT directos. No había atomicidad de archivo ni defensa de carreras en backend. El finally no volvía a renderizar el estado habilitado después de algunos fallos.
- Vercel: proyecto `olt_programacion`, ID `prj_MYuUnlmgnzjonMscDOX9NPATzdkI`, equipo control-olt. Producción `oltprogramacion.vercel.app`, deployment `dpl_CKSWoELMjYETpBsGbNFNfdbvftYu`, READY, source git, branch main y SHA inicial. Protección SSO para deployments salvo dominios personalizados. El vínculo main → producción se comprobó en el deployment; no se cambió la rama de producción.
- El lector SheetJS inline de producción tenía saltos de línea sin escapar dentro de una cadena. Node detectó SyntaxError y la consola del navegador confirmó SyntaxError en la aplicación real. Eso impedía inicializar el lector Excel aunque el login se mostrara.

## Cambios aplicados en Supabase

| Migración registrada | Resultado |
| --- | --- |
| `20261007201834_olt_security_structure` | Revoca ejecución de rls_auto_enable a PUBLIC/anon/authenticated; conserva ensure_rls. Retira permisos de tabla a anon y limita authenticated a SELECT/INSERT, con USAGE de secuencia. Añade PRIMARY KEY(id), tres índices y optimiza las dos policies |
| `20261007203627_olt_dashboard_summary` | RPC SECURITY INVOKER olt_resumen_mes: resumen mensual y hasta 10 grupos de historial, con RLS, dueño explícito y sin ejecución anónima |
| `20261007203704_olt_atomic_upload` | Clave canónica de 19 campos, índice no único por usuario/hash, RPC SECURITY INVOKER olt_insertar_lote con serialización por usuario y deduplicación atómica por lote |

Los ficheros locales se generaron con Supabase CLI y después se alinearon con las versiones registradas por Supabase. No reaplicarlos al proyecto existente. El CLI no dispone de una base local en esta sesión; `migration list --local` no pudo conectarse. El historial remoto sí confirma las tres migraciones.

### Policies

- `usuarios leen sus registros`: TO authenticated, USING `((SELECT auth.uid()) = usuario_id)`.
- `usuarios insertan sus registros`: TO authenticated, WITH CHECK `((SELECT auth.uid()) = usuario_id)`.
- No se añadieron políticas de UPDATE/DELETE ni permisos globales. RLS sigue activado.

### Índices

| Índice | Consulta que lo justifica |
| --- | --- |
| `recepcion_olt_pkey` | Identidad única y orden estable por id |
| `recepcion_olt_usuario_created_idx` | Último envío del usuario y mes del dashboard, filtrados por usuario |
| `recepcion_olt_usuario_entrega_idx` | Candidatos de duplicados filtrados por usuario y entregas |
| `recepcion_olt_usuario_archivo_idx` | Último envío por usuario + hash + pestaña, orden por created_at |
| `recepcion_olt_usuario_business_idx` | Coincidencia exacta de negocio dentro de la RPC; hash localizador más comparación completa |

No se creó un índice usuario_id redundante: todos los compuestos comienzan por usuario_id y cubren la FK. No se añadió un índice aislado sobre cada columna del dashboard.

### Datos y secuencia

Se conservaron 7 filas y el digest de su contenido completo antes/después es `92007e202b3922817d6f13590d0127b6`. No se borró ni corrigió el grupo duplicado existente. La secuencia pasó de 7 a 9 por dos inserts de prueba revertidos: PostgreSQL no revierte nextval. No hay pérdida de registros; el siguiente id será 10 si no interviene otra inserción. No se reseteó la secuencia ni se modificaron ids existentes.

## Código y compatibilidad

Separación progresiva de HTML, cuatro hojas de estilos existentes y módulos de aplicación, Supabase, Auth, Excel, validación, duplicados, envío, historial, dashboard y errores. Se conservaron byte a byte las reglas de validación, configuración y estilos reales del original. El estado continúa compartido entre scripts clásicos; no hubo reescritura del sistema.

SheetJS 0.20.3 se mantiene, corrigiendo exclusivamente los saltos de línea que impedían parsear su plantilla. Supabase JS quedó fijado en 2.117.3 y servido localmente. No se encontró service_role ni secreto privado en el frontend; permanece una clave publishable pública.

El Preview usa las RPC nuevas. El dashboard recibe un objeto agregado, no miles de filas. El inicio de mes se calcula para America/Lima. Las respuestas tardías no vuelven a mostrar datos después de cerrar sesión. La búsqueda visual de duplicados tiene filtro de usuario y paginación con order(id).

Los envíos usan lotes atómicos de 500; el archivo completo sigue teniendo varios lotes. Los errores informan lotes previos confirmados, no muestran mensajes SQL sensibles y permiten reintentar. La revisión previa evita dobles comprobaciones simultáneas y detecta cambios de archivo/sesión antes de confirmar.

Se añadió pipeline de checks sin credenciales, lockfile y configuración estática de Vercel con encabezados de seguridad. Las migraciones, tests y documentación quedan fuera del contenido de deployment por `.vercelignore`.

## Pruebas y límites

| Prueba | Resultado / alcance |
| --- | --- |
| Sintaxis JavaScript y referencias de assets | PASS en código final, incluido lector y SDK |
| Reglas y estilos frente al original | PASS: validaciones, config y CSS reales conservados exactamente |
| Login, errores seguros, logout | PASS con servicio simulado y DOM real en JSDOM; no es login real de Supabase |
| Lectura de XLSX, validación, duplicados, envío, reset | PASS con XLSX generado y leído por SheetJS real; servicio de inserción simulado |
| Valores inválidos y Excel ilegible | PASS: envío bloqueado y mensaje seguro |
| Duplicado surgido al enviar y fallo RLS | PASS simulado: conteo correcto y botón habilitado al reintentar |
| Dashboard por encima de 5.000 y respuesta tardía | PASS con resumen simulado de 100.001 registros; no es benchmark de base de datos |
| RLS de propietario y otro propietario | PASS con roles/JWT claims de prueba en PostgreSQL, transacción revertida |
| Retry de registros existentes | PASS en PostgreSQL: cero inserts, dos duplicados |
| Inserción, identidad, dueño y timestamp del servidor | PASS en PostgreSQL con reversión: un nuevo registro y su repetición omitida, id/fecha/dueño suministrados por cliente ignorados |
| Lote inválido después de un insert | PASS en PostgreSQL: ninguna fila parcial persistió |
| Revisión de consola de producción | Confirma el SyntaxError original del lector; no se alteró producción para corregirlo todavía |

No hubo login real ni envío autenticado de Excel real a producción/Preview porque no se contaba con una sesión de usuario OLT para esa prueba. No se crearon usuarios ni se pidieron contraseñas. No se ejecutó un test de estrés con dos transacciones concurrentes que confirmasen nuevas filas ni benchmarks con 10.000–1.000.000 filas reales. El bloqueo/transacción de la RPC fue inspeccionado y las rutas de inserción/reintento verificadas.

## Advisors y logs

- **Security final:** un WARN, leaked password protection desactivado. Se eliminaron los dos avisos de ejecución privilegiada. [Remediación](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- **Performance final:** tres INFO de índices recién creados todavía sin uso (`usuario_created`, `usuario_entrega`, `usuario_archivo`); el índice de negocio se utilizó en las pruebas. Sin avisos de PK, FK sin índice ni auth_rls_initplan. Con 7 filas el planificador puede preferir un scan secuencial; conservar los índices hasta medir actividad real. [Remediación/criterios](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- Logs Supabase: consultados por fuente y nivel. En la ventana de trabajo hubo Auth informativo y registros de PostgREST/PostgreSQL. El campo de nivel consultado es vacío en estas dos últimas fuentes: no se puede concluir ausencia total de errores a partir de esos conteos. Algunos errores SQL de preparación/pruebas se produjeron y fueron corregidos; no representan un fallo de la aplicación publicado.
- Logs de build y runtime Vercel: API retornó 403 para control-olt. No hay CLI autenticado disponible. No se afirma que estén limpios. Los metadatos de proyecto/deployment sí pudieron consultarse con el alcance de la integración.

## Pendientes que requieren definición o acceso

1. **Leaked Password Protection:** OLT está en Free; la documentación actual lo limita a Pro o superior. No se cambió el plan ni otra configuración Auth. Si se habilita un plan compatible, abrir [Authentication → Sign In / Providers → Email](https://supabase.com/dashboard/project/vuoqmesrwgkkdqrecxnc/auth/providers?provider=Email) y activar la protección de contraseñas filtradas. Confirmar disponibilidad y probar login/cambio de contraseña. Las herramientas actuales no exponen modificación de configuración Auth.
2. **Acceso Vercel:** habilitar acceso del conector al equipo control-olt para inspeccionar logs y configuración detallada. El 403 no equivale a ausencia de problemas.
3. **Protección main:** exigir PR y check `checks` desde Settings → Branches/Rulesets. No hay herramienta de escritura de branch protection en esta integración; la rama permanece sin protección. La rama de trabajo y el PR aíslan este cambio, pero no impiden futuros pushes ajenos a main.
4. **Duplicados en todo el sistema:** la RPC protege llamadas que la usan dentro del propietario. INSERT directo heredado y duplicados entre usuarios siguen fuera de esa protección. No se añadió UNIQUE ni trigger que pueda romper el frontend viejo. Definir alcance global y probar un mecanismo de enforcement de tabla en una base separada.
5. **Historial cargas_olt:** propuesta en arquitectura; no se ejecutó una migración que invente cargas históricas o rompa columnas actuales.
6. **Roles:** diseño propuesto; no se otorgó lectura global, no se usó user_metadata.
7. **Escala:** se eliminó la transferencia/truncamiento del dashboard; medir latencia SQL antes de prometer rendimiento con un millón de filas.
8. **Entorno de prueba de datos:** el Preview utiliza el mismo Supabase de producción. No se creó una rama Supabase de pago ni un nuevo proyecto. Aislar datos antes de pruebas de carga autenticadas.

## Siguiente etapa

Revisar Preview y checks del commit exacto; probar login y Excel con un entorno de datos de prueba; completar acceso a logs Vercel y protección main. Después, adoptar el frontend por PR y cerrar INSERT directo con un mecanismo compatible, una vez definida la unicidad. Crear cargas_olt y roles en migraciones separadas y verificarlos sin ampliar permisos por defecto.

Los identificadores del commit, PR y Preview verificados se incorporan al terminar la publicación de la rama.
