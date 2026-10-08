# Auditoría técnica y arquitectura objetivo — OLT

Fecha: 2026-10-08

## Resumen ejecutivo

El sistema tiene una buena base funcional, pero antes de crecer conviene separar responsabilidades y declarar una fuente de verdad por cada tipo de dato.

### Principios acordados

1. `recepcion_olt` sigue siendo la fuente original e inmutable de programación OLT (equivalente a BD F:X).
2. La carga SAP es una fotografía reemplazable del estado reciente, pero las versiones publicadas deben conservarse para auditoría.
3. La selección SAP para una Referencia/Entrega se determina por el `InActTrans` más reciente.
4. Los meses cerrados deben congelar la información usada por la hoja de trabajo para que futuras cargas SAP no alteren históricos.
5. `RECOGE CLIENTE` se conserva para trazabilidad, pero se excluye de reportería/KPI.
6. La web de control debe parecer una hoja de cálculo, pero la lógica crítica debe vivir en la capa de datos/servicios, no depender solo del navegador.

## Estado actual auditado

### GitHub

Repositorio: `luigigicam-bot/OLT`.

- `main`: proyecto actual de recepción OLT.
- `feature/olt-control`: segundo módulo en `control-olt/`.
- La rama de control está adelantada respecto de `main` y todavía debe tratarse como desarrollo.
- El repositorio es público. Nunca deben almacenarse secretos, contraseñas ni claves de backend.
- El segundo módulo ya tiene estructura inicial y un `package.json`, pero todavía no debe considerarse listo para producción.

### Vercel

Actualmente existe un único proyecto Vercel ligado al repositorio: `olt_programacion`.

Riesgo: los commits de ramas del segundo módulo generan previews dentro del mismo proyecto Vercel del sistema de recepción.

Arquitectura objetivo:

- Vercel 1: `olt_programacion` -> raíz del repositorio / aplicación de recepción.
- Vercel 2: `olt_control` -> root directory `control-olt` / aplicación operativa.

Ambos pueden usar el mismo proyecto Supabase.

### Supabase

Fuente actual:
- `recepcion_olt`: programación OLT F:X.

Tablas de control creadas:
- `sap_cargas`: metadatos de cada carga.
- `sap_staging`: datos temporales antes de publicar.
- `sap_snapshot`: fotografía validada de una carga SAP.
- `sap_estado_usuario`: puntero a la fotografía activa.
- `sap_actual`: modelo temprano de estado actual; evaluar retiro cuando snapshot sea canónico.
- `sap_historial`: modelo temprano de cambios; evaluar simplificación usando snapshots.
- `gestion_olt`: A:B, Y:AB y AL:AM editables.
- `cierre_mensual`: fotografía final de la hoja operativa por periodo.

Todas las nuevas tablas tienen RLS habilitado.

## Hallazgos prioritarios

### P0 — Definir el alcance de datos por organización, no por usuario

Hoy la seguridad original de `recepcion_olt` está basada en `usuario_id`. Eso funciona con un solo usuario, pero a futuro puede impedir que distintos operadores vean la misma operación.

Antes de incorporar más usuarios debe decidirse si:
- cada usuario maneja información independiente, o
- varios usuarios pertenecen a una misma organización/equipo y comparten OLT/SAP.

Recomendación: si habrá varios operadores del mismo proceso, migrar a un modelo `organizacion -> miembros -> roles`, manteniendo `created_by` para auditoría.

No realizar esta migración hasta confirmar la regla de negocio.

### P0 — SAP debe publicarse de forma atómica

Nunca debe existir un momento en el que el usuario vea una carga SAP a medias.

Patrón objetivo:

archivo -> validación -> staging -> deduplicación por Referencia + InActTrans DESC -> snapshot completo -> cambio de puntero activo

El puntero se cambia únicamente cuando el snapshot completo terminó correctamente.

Los snapshots deben ser inmutables: una versión publicada no se edita ni se borra durante la operación normal.

### P0 — Separar despliegues

El segundo módulo debe tener su propio proyecto Vercel y `control-olt` como raíz. Esto reduce el riesgo de que una modificación del control operativo afecte la recepción OLT.

### P1 — Una única definición para los indicadores

Las reglas actuales de Google Sheets deben migrarse a funciones/consultas reutilizables:

- Fec.Vencto.
- En Fecha / Fuera de Fecha.
- Cumple / No Cumple / Por Vencer / Vencen Hoy / Cargo Pendiente.
- Mes OLT.
- Mes SAP.
- retraso posterior a fecha límite.
- diferencia entre planificación y salida real.

La UI puede recalcular inmediatamente para experiencia de usuario, pero el resultado oficial debe poder recalcularse en backend con las mismas reglas.

### P1 — Calendario operacional

No conviene hardcodear feriados permanentemente dentro de una fórmula.

Crear en el futuro:
- `calendario_feriados`.
- país/operación.
- fecha.
- descripción.
- activo.

La lógica de días hábiles debe consultar esa tabla.

### P1 — Cierre mensual

Un cierre no debe depender de datos SAP futuros.

El snapshot mensual debe contener:
- valores OLT F:X utilizados.
- gestión manual A:B / Y:AB / AL:AM.
- SAP AC:AK utilizado.
- indicadores calculados C:E / AN:AQ.
- versión de reglas utilizada.
- fecha, usuario y motivo de reapertura si alguna vez se permite.

### P1 — Importaciones observables

Cada carga SAP debe registrar:
- hash del archivo.
- nombre.
- usuario.
- hora inicio/fin.
- filas recibidas.
- filas inválidas.
- referencias únicas.
- nuevas.
- actualizadas.
- resultado final.
- versión del esquema/parser.

Esto permite auditar fallas y comparar una carga contra otra.

### P2 — Rendimiento

La vista tipo hoja no debe descargar decenas de miles de filas de una sola vez.

Usar:
- filtros de servidor.
- paginación/virtualización.
- índices por fecha, entrega, línea, periodo y referencia.
- búsqueda con debounce.
- caché solo donde no comprometa datos vivos.

### P2 — Reglas de edición

No todas las 43 columnas deben ser editables.

- A:B: editables.
- C:E: calculadas.
- F:X: solo lectura desde `recepcion_olt`.
- Y:AB: editables o automáticas según definición final.
- AC:AK: solo lectura desde SAP.
- AL:AM: editables.
- AN:AQ: calculadas.

### P2 — Calidad y reportería

Crear una capa de reporting separada de la operación.

La exclusión `Tipo de Transporte = RECOGE CLIENTE` debe aplicarse en esa capa y no borrar ni ocultar la fila en el origen.

## Mejoras ya aplicadas durante esta auditoría

- Se añadieron índices faltantes para claves foráneas detectadas por el advisor.
- Se reforzó `sap_actual` para evitar colisiones futuras entre usuarios usando clave compuesta.
- `usuario_id` pasó a ser obligatorio en las tablas SAP que representan propiedad.
- `InActTrans` y `Fecha Salida SAP` se normalizaron como `date`, evitando desplazamientos por zona horaria.
- Las cargas SAP ahora tienen campos de hash, versión de esquema, filas inválidas y fecha de procesamiento.
- Se añadió el modelo de snapshots SAP + puntero de versión activa.
- Se añadieron políticas RLS faltantes para creación del puntero de estado.

## Próxima fase recomendada

1. Terminar las políticas mínimas del modelo snapshot.
2. Elegir snapshot como modelo SAP canónico y evitar mantener dos mecanismos paralelos indefinidamente.
3. Crear un servicio transaccional para publicar cargas SAP.
4. Implementar la vista consolidada operativa.
5. Replicar y probar las fórmulas de BD con casos reales.
6. Construir la cuadrícula virtualizada.
7. Crear el segundo proyecto Vercel cuando la rama sea ejecutable.
8. Pruebas de regresión antes de mergear a `main`.

## Decisiones que todavía requieren confirmación de negocio

- ¿Los futuros usuarios compartirán toda la información de la operación OLT/SAP o cada usuario tendrá datos independientes?
- ¿Y:AB será digitado manualmente, importado de otra fuente o una mezcla de ambas?
- ¿Un mes cerrado podrá reabrirse? Si sí, ¿qué rol podrá hacerlo?
- ¿Qué feriados exactos forman parte del calendario operativo?
