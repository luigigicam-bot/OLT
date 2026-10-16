# Migración histórica de BD — Reporte OLT 20260922

Fuente: hoja **BD** del archivo `Reporte OLT 20260922.xlsx`.

## Resultado

- Filas con Entrega procesadas: **6,014**
- Filas con Cargo A+B: **5,659**
- Registros OLT nuevos insertados: **872**
- Registros ya existentes y omitidos por deduplicación exacta: **5,142**
- Duplicados exactos finales en `recepcion_olt`: **0**
- Filas históricas enlazadas a un OLT canónico: **6,014**

## Reglas

1. F:X se concilia contra `public.recepcion_olt` usando la clave exacta de los 19 campos de negocio.
2. Un registro ya existente no se vuelve a insertar.
3. A = `Nro. De Cargo` y B = `Fec.Cargo` se migran a `olt_control.gestion_olt`.
4. Y:AB y AL:AM también se conservan en gestión cuando existen.
5. AC:AK se preservan como histórico de BD. El SAP activo tiene prioridad; BD se usa solo como respaldo histórico si la referencia ya no existe en el snapshot SAP activo.
6. C:E y AN:AQ se conservan como valores fuente de auditoría, pero el sistema calcula los indicadores oficiales con las reglas vigentes.
7. Se detectó una anomalía original en BD, fila 4843: Volumen contenía el texto `LIMA`. El valor bruto quedó documentado y el campo numérico se dejó NULL para no corromper el esquema.

## Trazabilidad

La copia histórica A:AQ se conserva en:
- `olt_control.bd_imports`
- `olt_control.bd_import_rows`

No se modificó el archivo fuente.
