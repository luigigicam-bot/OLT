
create index if not exists gestion_audit_olt_id_idx
  on olt_control.gestion_audit(olt_id);

drop index if exists olt_control.sap_staging_physical_row;
