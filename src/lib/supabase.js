import { createClient } from '@supabase/supabase-js';

// La anon key es pública por diseño (va dentro del JS del navegador)
const url = import.meta.env.VITE_SUPABASE_URL || 'https://pxjyvjudunylavpuoauy.supabase.co';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4anl2anVkdW55bGF2cHVvYXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0ODM4MTYsImV4cCI6MjEwNTA1OTgxNn0.OYHSQKpEep-0cMqWMCiYXOyHZz_E7wpf0cvIAlyPImU';

export const supabaseReady = Boolean(url && key);
export const supabase = supabaseReady ? createClient(url, key) : null;

function sessionId() {
  try {
    let id = localStorage.getItem('lr_session');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('lr_session', id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

export function track(type, target) {
  if (!supabase) return;
  supabase
    .from('events')
    .insert({ type, target, path: window.location.pathname, session_id: sessionId() })
    .then(() => {});
}

export const trackVisit = (name) => track('visit', name);
export const trackClick = (name) => track('click', name);
