# Propuestas pendientes y límites de la arquitectura

## Cargas trazables

Crear `cargas_olt` es recomendable cuando se requiera auditar intentos, errores y archivos con cero filas nuevas. Actualmente solo existe historial de filas insertadas: una carga enteramente duplicada no deja un evento, y el hash del archivo agrupa varias pestañas en el historial.

Propuesta incremental: `cargas_olt(id uuid PK, usuario_id, archivo, archivo_hash, pestana, fecha_inicio, fecha_fin, filas_recibidas, filas_insertadas, duplicados, errores, estado)` y `recepcion_olt.carga_id` nullable. Una carga representa un intento concreto, no un hash único. El hash puede repetirse legítimamente después de corregir filas.

Fases: crear la tabla con RLS de propietario, añadir `carga_id` nullable sin modificar columnas actuales, extender una nueva versión de RPC que cree/actualice la carga en su transacción, verificar ambos frontends, y finalmente migrar consultas del historial. Conservar archivo, hash y pestaña en las filas durante la transición. No reconstruir falsos intentos históricos a partir de fechas y hash: los lotes actuales no identifican sus transacciones de origen. Los datos anteriores quedarían con `carga_id IS NULL` y el historial tendría un fallback para ellos.

La creación de esta tabla y su backfill no se ejecutaron. Requieren un entorno aislado y definir qué ocurre al reanudar un archivo parcialmente insertado. Los contadores deben calcularse en el servidor; los clientes no deben poder declarar arbitrariamente un estado exitoso.

## Roles y áreas

Mantener por ahora SELECT e INSERT por `usuario_id`. La columna de negocio `area` contiene un dato del Excel; no debe utilizarse sola como frontera de autorización porque la aporta el usuario.

Propuesta: un esquema privado con `roles_usuario(usuario_id, rol)` y `miembros_area(usuario_id, area_id)`, más un catálogo de áreas administrativas y una asignación de área protegida para cada usuario/carga. Solo un backend administrativo confiable puede modificar roles y membresías. Los usuarios no reciben INSERT/UPDATE de estas asignaciones.

| Rol futuro | Lectura | Escritura propuesta |
| --- | --- | --- |
| usuario | Sus propias filas/cargas | Sus cargas |
| supervisor | Usuarios pertenecientes a sus áreas autorizadas | Mantener solo sus cargas hasta definir funciones de supervisión |
| administrador | Todas las filas/cargas | Acciones administrativas específicas y auditadas |

Usar claims de `app_metadata` emitidos por el servidor, o un Custom Access Token Hook para incorporar asignaciones protegidas. Nunca `user_metadata`. Los claims pueden quedar obsoletos hasta refrescar el JWT: definir tiempo de expiración y política de revocación. Si se consulta una tabla protegida desde RLS, evitar políticas recursivas; revisar un helper interno específico y mínimo únicamente si fuese imprescindible. No introducir `SECURITY DEFINER` para ampliar permisos por conveniencia.

No se creó ninguna política de supervisor ni administrador ni acceso global.

## Duplicados globales y todos los caminos de escritura

Hoy se conserva el alcance real: coincidencias dentro del usuario. La RPC evita carreras entre sus llamadas y deduplica dentro del lote. El INSERT directo heredado sigue disponible; scripts externos o el frontend antiguo no quedan cubiertos.

Para cerrar todos los caminos de escritura tras adoptar la RPC, evaluar un trigger que use el mismo bloqueo y canonización y rechace coincidencias por propietario. El INSERT directo debería recibir un error explícito; no omitir filas silenciosamente porque el frontend antiguo interpreta algunas respuestas vacías como éxito. Verificar eventos, RLS y compatibilidad en una base de prueba antes de instalarlo.

Un UNIQUE global sobre los 19 campos podría impedir la carga legítima de otro usuario y revelar que existen datos fuera de su alcance mediante errores. Además existe un grupo duplicado previo. No borrarlo automáticamente. Un UNIQUE que incluya usuario también requiere tratar duplicados existentes y diferencias null/vacío. El hash por sí solo nunca debe justificar omitir un registro sin comparar su contenido completo.

## Escalabilidad

El dashboard nuevo devuelve totales y hasta 10 grupos de historial. No descarga filas de negocio para contar ni recorta el resultado a 5.000. La consulta sigue recorriendo las filas del mes del usuario; el índice `(usuario_id, created_at DESC)` limita el conjunto y RLS se mantiene.

| Volumen total | Evaluación y siguiente medida |
| --- | --- |
| 10.000 | Agregación en PostgreSQL; evitar el límite y la transferencia del diseño previo |
| 50.000 | Medir latencia, planes y memoria con distribución real por usuario/mes |
| 100.000 | Medir p95 de la RPC y tamaño de los grupos; considerar resumen por carga |
| 1.000.000 | No prometer latencia constante: agregación y agrupación siguen siendo proporcionales al mes visible. Evaluar resúmenes incrementales por usuario/mes y por carga, con RLS y conciliación de contadores |

Estas filas son un análisis arquitectónico, no un benchmark ejecutado: la base real contiene 7 registros. Los tests de interfaz usan una respuesta simulada con 100.001 registros para comprobar que el contador no se trunca, no para medir PostgreSQL.

No se añadieron vistas que omitan RLS, tablas de resumen, materializaciones, particionado ni logging externo. Un resumen materializado debe tener aislamiento por propietario y un mecanismo confiable de actualización; no adoptarlo sin una necesidad medida.

## Observabilidad

El frontend muestra mensajes por login, Excel, duplicados, consultas, permisos, conexión e inserción. Registra solo categoría y código. No envía filas, tokens o mensajes SQL completos a servicios externos. Los errores de carga parcial indican el número confirmado; un error de red puede ser ambiguo y el reintento debe pasar por la RPC.

El frontend es estático y consulta Supabase directamente; los logs de funciones de Vercel no observan esas consultas ni todos los errores del navegador. Combinar consola del navegador, logs de Auth/PostgREST/PostgreSQL y estado del deployment. El acceso a logs de Vercel retornó 403 en esta auditoría; no confundir eso con una revisión sin errores.
