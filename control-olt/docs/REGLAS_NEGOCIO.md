# Reglas operativas

Fecha base: Fecha Salida SAP si existe, si no Fec.Despacho. Días hábiles: lunes a viernes, excluyendo fechas activas de calendario_feriados. Prioridad de plazos: TECNOFARMA + LORETO 25; Provincia con ELEA, GENOMMA LAB, OMPHARMA, BIOPAS, BONAPHARM, FAES FARMA, FERQUIM, RECKITT BENCKISER, TAKEDA, ADIUM o ELEA PERU 7; TECNOFARMA Provincia 15; Lima 1; otros 0.

Con Fec.Cargo <= vencimiento: En Fecha / Cumple. Cargo posterior: Fuera de Fecha / No Cumple. Sin cargo se compara hoy en America/Lima: vence hoy Vencen Hoy, futuro Por Vencer, pasado Cargo Pendiente. Sin fecha base no se inventa incumplimiento.

AP usa días calendario: retraso positivo, Vence hoy 0 días, Vence en N días; cargo a tiempo muestra '-'. AQ es ABS(Fec.Despacho - Fecha Salida SAP), singular 1 día y plural N días.

RECOGE CLIENTE se conserva visible y trazable. Se excluye en public.olt_reporting de los KPI, cobertura operativa y segmentaciones. La cobertura SAP sin OLT se contrasta contra recepcion_olt completo, incluyendo los registros conservados para trazabilidad.

SAP: cada archivo es una fotografía completa. Una entrega ausente en la nueva versión debe aparecer sin SAP; no recuperarse de versiones históricas. Los snapshots publicados no se editan. Deduplicación: fecha DATE más reciente, hora TIME más reciente, primera fila física. Fechas futuras e información incompleta producen observaciones; fechas imposibles y horas inválidas se excluyen como filas inválidas.

Los cierres mensuales existentes conservan su snapshot y versión de reglas. No se ejecutaron cierres ni se reabrieron meses en esta entrega. No se cambia silenciosamente el calendario; su mantenimiento y reglas para periodos abiertos requieren gobernanza operativa.


## Resumen DT exclusivo de SAP

General/KPI conserva sus reglas por entrega; este resumen usa DT único y primera fila física elegible. Excluye únicamente del reporte SAP las filas cuya segunda Referencia (AL) empieza por 01-0FF o Entrega empieza por 500. Estado, ET y placa provienen de esa primera fila. Fecha utilizada = su InActTrans; si falta, máximo de E/I/Z/AI/AK/AU de todas las filas del DT, incluso excluidas. Los estados son dinámicos, sin inventar nombres de estados. Placa vacía permanece vacía, en vez del cero que genera INDEX de Excel.

Analizar archivo lee Datos SAP y compara DT con Mi Data del mismo libro; es una vista local que se pierde al recargar, sin cambiar la versión activa. Versión activa consulta staging con RLS y compara contra DT registrados en Control OLT. Sus filtros son independientes de General. Los archivos anteriores sin metadatos originales muestran advertencia; Analizar archivo permite recuperar todas las reglas desde el original. Nuevas cargas conservan metadatos de exclusión/alternativa.

General/KPI: botón Filtrar en la esquina superior derecha abre panel lateral, mantiene filtros compartidos existentes, muestra selección activa y permite cerrar por X, fondo o Escape.
