-- SHA-256 fingerprint of the canonical 19-field JSON key, scoped to the owner.
-- Existing exact duplicate groups were checked before applying; no rows are removed.
create unique index recepcion_olt_owner_business_unique on public.recepcion_olt
(usuario_id,encode(extensions.digest(public.olt_business_key(fecha,area,entrega,factura,gr,turno,cita,razon,distrito,provincia,departamento,linea,bultos,volumen,peso,despacho,transporte,mercaderia,observacion)::text,'sha256'),'hex'));
