import { useEffect, useState } from 'react';
import { supabase, supabaseReady, trackClick } from '../lib/supabase.js';
import { Icon } from './Icons.jsx';
import Survey from './Survey.jsx';
import SpinWheel from './SpinWheel.jsx';

const KEY = 'lr_registration';

function loadReg() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function saveReg(id) {
  try { localStorage.setItem(KEY, id); } catch { /* sin storage */ }
}

export default function RegistrationFlow() {
  const [step, setStep] = useState('loading');
  const [regId, setRegId] = useState(null);
  const [status, setStatus] = useState(null);

  async function resume(id) {
    const { data, error } = await supabase.rpc('registration_status', { p_reg: id });
    if (error || !data) { setStep('form'); return; }
    setRegId(id);
    setStatus(data);
    if (!data.survey_completed) setStep('survey');
    else setStep(data.game_active || data.voucher ? 'game' : 'thanks');
  }

  useEffect(() => {
    if (!supabaseReady) { setStep('form'); return; }
    const saved = loadReg();
    if (saved) resume(saved); else setStep('form');
  }, []);

  if (step === 'loading') return <div className="card"><p className="muted">Cargando…</p></div>;

  return (
    <div className="card">
      <Steps step={step} />
      {step === 'form' && (
        <RegisterForm
          onDone={(id) => { saveReg(id); resume(id); }}
        />
      )}
      {step === 'survey' && (
        <Survey regId={regId} onDone={() => resume(regId)} />
      )}
      {step === 'game' && <SpinWheel regId={regId} status={status} />}
      {step === 'thanks' && (
        <div className="center">
          <h3 className="card-title">¡Gracias por registrarte!</h3>
          <p>Muy pronto activaremos nuestra ruleta de premios. Vuelve a esta página para jugar.</p>
        </div>
      )}
    </div>
  );
}

function Steps({ step }) {
  const order = ['form', 'survey', 'game'];
  const idx = step === 'thanks' ? 2 : order.indexOf(step);
  const labels = ['Registro', 'Encuesta', 'Juego'];
  return (
    <ol className="steps">
      {labels.map((l, i) => (
        <li key={l} className={i <= idx ? 'on' : ''}><span>{i + 1}</span>{l}</li>
      ))}
    </ol>
  );
}

function RegisterForm({ onDone }) {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', city: '', accept: false });
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!supabaseReady) { setError('Falta configurar Supabase (.env).'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setError('Escribe un correo válido.'); return; }
    if (form.phone.replace(/\D/g, '').length < 7) { setError('Escribe un teléfono válido.'); return; }
    if (!form.accept) { setError('Debes aceptar el tratamiento de datos.'); return; }
    setSending(true);
    trackClick('registro_enviar');
    const { data, error: err } = await supabase.rpc('register_user', {
      p_name: form.full_name, p_email: form.email, p_phone: form.phone, p_city: form.city,
    });
    setSending(false);
    if (err) { setError(err.message); return; }
    onDone(data);
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="card-head">
        <span className="gift"><Icon name="gift" size={30} /></span>
        <div>
          <h3 className="card-title">Regístrate y gana</h3>
          <p className="muted">Responde una encuesta corta y gira la ruleta: descuentos del 10 % y 5 % o una cena para 2.</p>
        </div>
      </div>
      <label>Nombre completo
        <input required value={form.full_name} onChange={set('full_name')} placeholder="Tu nombre y apellido" autoComplete="name" />
      </label>
      <label>Correo electrónico
        <input required type="email" value={form.email} onChange={set('email')} placeholder="tucorreo@email.com" autoComplete="email" />
      </label>
      <label>Teléfono
        <input required type="tel" value={form.phone} onChange={set('phone')} placeholder="+57 300 000 0000" autoComplete="tel" />
      </label>
      <label>Ciudad desde la que nos visitas
        <input required value={form.city} onChange={set('city')} placeholder="Ej: Bogotá" autoComplete="address-level2" />
      </label>
      <label className="check">
        <input type="checkbox" checked={form.accept} onChange={set('accept')} />
        <span>Autorizo a La Regatta a usar mis datos para contactarme con promociones.</span>
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-pink" disabled={sending}>{sending ? 'Enviando…' : 'Registrarme'}</button>
    </form>
  );
}
