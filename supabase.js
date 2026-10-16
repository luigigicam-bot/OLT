
'use strict';

// ===== Supabase: autenticación, historial y recepción =====
const SUPABASE_URL = window.SUPABASE_CONFIG.url;
const SUPABASE_PUBLISHABLE_KEY = window.SUPABASE_CONFIG.publishableKey;
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

let oltSession = null;
let historyVersion = 0;
let pendingSendReview = null;
const BUSINESS_KEYS = OLT.columns.map(c => c.key);


function displayLast(value) {
  if (!value) return 'Sin envíos registrados';
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleString('es-PE', {
      timeZone: 'America/Lima',
      dateStyle: 'short',
      timeStyle: 'medium'
    });
  }
  return String(value);
}


