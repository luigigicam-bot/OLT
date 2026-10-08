const btnSap = document.querySelector("#btnSap");
const sapStatus = document.querySelector("#sapStatus");

btnSap?.addEventListener("click", () => {
  sapStatus.textContent = "Carga SAP: interfaz pendiente de conectar a Supabase.";
});
