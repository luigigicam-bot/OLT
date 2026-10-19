begin;
create temporary table sap_selection_fixture (like olt_control.sap_staging);
insert into sap_selection_fixture(id,carga_id,fila_origen,referencia,dt,inacttrans,hraitr,estado_viaje,raw_data) values
(1,1,1,'E1','D1','2026-10-18','23:59','1','{}'),
(2,1,2,'E2','D1','2026-10-19','08:00','6','{}'),
(3,1,3,'E3','D1','2026-10-19','09:00','7','{}'),
(4,1,4,'E4','D1','2026-10-19','09:00','1','{}'),
(5,1,5,'500EXCLUIDA','D1','2026-12-31','23:59','1','{}'),
(6,1,6,'E6','D2',null,'23:59','1','{}'),
(7,1,7,'E7','D2','2026-10-18',null,'6','{}'),
(8,1,8,'E8','D3',null,null,'1','{}'),
(9,1,9,'E9','D3',null,'09:00','6','{}'),
(10,2,1,'E10','D1','2026-10-01','01:00','1','{}');
do $check$
declare definition text; selected integer;
begin
 definition:=pg_get_viewdef('olt_control.sap_latest_dt_v1'::regclass,true);
 if position('olt_control.sap_staging' in definition)=0 then raise exception 'Unexpected DT view source'; end if;
 execute 'create temporary view sap_selection_actual_rule as '||replace(definition,'olt_control.sap_staging','pg_temp.sap_selection_fixture');
 select fila_origen into selected from sap_selection_actual_rule where carga_id=1 and dt_key='D1';
 if selected is distinct from 3 then raise exception 'Date/time/physical tie rule failed: %',selected; end if;
 select fila_origen into selected from sap_selection_actual_rule where carga_id=1 and dt_key='D2';
 if selected is distinct from 7 then raise exception 'Real date must outrank blank: %',selected; end if;
 select fila_origen into selected from sap_selection_actual_rule where carga_id=1 and dt_key='D3';
 if selected is distinct from 9 then raise exception 'Valid hour must outrank blank: %',selected; end if;
 select fila_origen into selected from sap_selection_actual_rule where carga_id=2 and dt_key='D1';
 if selected is distinct from 1 then raise exception 'Loads must remain isolated: %',selected; end if;
end $check$;
select count(*) fixture_winners from sap_selection_actual_rule;
rollback;
