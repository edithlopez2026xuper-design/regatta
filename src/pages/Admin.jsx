import { useEffect, useMemo, useState } from 'react';
import { supabase, supabaseReady } from '../lib/supabase.js';
import { BRAND } from '../config.js';

const TABS = [
  ['stats', 'Estadísticas'],
  ['game', 'Juego y premios'],
  ['survey', 'Encuesta'],
  ['results', 'Resultados encuesta'],
  ['people', 'Registrados'],
];

const BUTTON_NAMES = {
  pagina_web: 'Página web',
  reservar: 'Reserva aquí',
  instagram: 'Instagram',
  facebook: 'Facebook',
  registro_enviar: 'Enviar registro',
  girar_ruleta: 'Girar ruleta',
};

export default function Admin() {
  const [tab, setTab] = useState('stats');

  if (!supabaseReady) {
    return <div className="admin"><p className="error">Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env</p></div>;
  }

  return (
    <div className="admin">
      <header className="admin-head">
        <img src={BRAND.logo} alt="" />
        <div>
          <h1>Panel La Regatta</h1>
          <p>Taplink · registro · encuesta · juego</p>
        </div>
      </header>
      <nav className="admin-tabs">
        {TABS.map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>
      {tab === 'stats' && <Stats />}
      {tab === 'game' && <GameControl />}
      {tab === 'survey' && <SurveyEditor />}
      {tab === 'results' && <SurveyResults />}
      {tab === 'people' && <People />}
    </div>
  );
}

/* ---------------------------- ESTADÍSTICAS ---------------------------- */
function Stats() {
  const [s, setS] = useState(null);
  const load = () => supabase.rpc('admin_stats').then(({ data }) => setS(data));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  if (!s) return <p className="muted">Cargando…</p>;

  const kpis = [
    ['Visitas a las URLs', s.visits],
    ['Visitantes únicos', s.unique_visitors],
    ['Clics en botones', s.clicks],
    ['Registros', s.registrations],
    ['Clics en reservar', s.reservations],
    ['Encuestas completas', s.surveys],
    ['Giros de ruleta', s.spins],
    ['Ganadores', s.winners],
  ];
  const conv = s.unique_visitors ? ((s.registrations / s.unique_visitors) * 100).toFixed(1) : '0';

  return (
    <>
      <div className="kpis">
        {kpis.map(([l, v]) => (
          <div className="kpi" key={l}><span>{l}</span><strong>{v}</strong></div>
        ))}
        <div className="kpi accent"><span>Conversión visita → registro</span><strong>{conv}%</strong></div>
      </div>

      <div className="panel">
        <div className="panel-head"><h2>Últimos 14 días</h2><button className="mini" onClick={load}>Actualizar</button></div>
        <Daily rows={s.daily} />
      </div>

      <div className="grid2">
        <div className="panel"><h2>Clics por botón</h2><Bars rows={s.clicks_by_button.map((r) => ({ ...r, name: BUTTON_NAMES[r.name] || r.name }))} /></div>
        <div className="panel"><h2>Ciudad de origen (registrados)</h2><Bars rows={s.cities} color="var(--teal)" /></div>
        <div className="panel"><h2>Visitas por URL</h2><Bars rows={s.visits_by_path} color="var(--navy)" /></div>
      </div>
    </>
  );
}

function Bars({ rows, color = 'var(--pink)' }) {
  if (!rows?.length) return <p className="muted">Sin datos todavía.</p>;
  const max = Math.max(...rows.map((r) => r.total));
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.name}>
          <span className="bar-label">{r.name || '—'}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(r.total / max) * 100}%`, background: color }} /></span>
          <span className="bar-val">{r.total}</span>
        </li>
      ))}
    </ul>
  );
}

function Daily({ rows }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.visits, r.registrations)));
  return (
    <>
      <div className="daily">
        {rows.map((r) => (
          <div className="day" key={r.day} title={`${r.day}: ${r.visits} visitas, ${r.registrations} registros`}>
            <div className="day-bars">
              <span style={{ height: `${(r.visits / max) * 100}%` }} className="v" />
              <span style={{ height: `${(r.registrations / max) * 100}%` }} className="r" />
            </div>
            <small>{r.day.slice(8, 10)}/{r.day.slice(5, 7)}</small>
          </div>
        ))}
      </div>
      <p className="legend"><i className="v" /> Visitas <i className="r" /> Registros</p>
    </>
  );
}

/* --------------------------- JUEGO Y PREMIOS -------------------------- */
function GameControl() {
  const [settings, setSettings] = useState(null);
  const [prizes, setPrizes] = useState([]);
  const [saved, setSaved] = useState('');

  const load = async () => {
    const [{ data: st }, { data: pr }] = await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).single(),
      supabase.from('prizes').select('*').order('sort'),
    ]);
    setSettings(st);
    setPrizes(pr || []);
  };
  useEffect(() => { load(); }, []);

  async function saveSettings(patch) {
    const next = { ...settings, ...patch };
    setSettings(next);
    await supabase.from('settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1);
    flash();
  }
  async function savePrize(p, patch) {
    await supabase.from('prizes').update(patch).eq('id', p.id);
    flash();
    load();
  }
  const flash = () => { setSaved('Guardado ✓'); setTimeout(() => setSaved(''), 1500); };

  if (!settings) return <p className="muted">Cargando…</p>;

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h2>Dinámica de la ruleta</h2>
          <span className="ok">{saved}</span>
        </div>
        <label className="switch">
          <input type="checkbox" checked={settings.game_active} onChange={(e) => saveSettings({ game_active: e.target.checked })} />
          <span className="slider" />
          <strong>{settings.game_active ? 'Juego ACTIVADO' : 'Juego APAGADO'}</strong>
        </label>
        <div className="row">
          <label>Probabilidad de ganar por giro (%)
            <input type="number" min="0" max="100" defaultValue={Math.round(settings.win_probability * 100)}
              onBlur={(e) => saveSettings({ win_probability: Math.min(100, Math.max(0, Number(e.target.value))) / 100 })} />
          </label>
          <label>Intentos por persona
            <input type="number" min="1" max="10" defaultValue={settings.max_attempts}
              onBlur={(e) => saveSettings({ max_attempts: Math.max(1, Number(e.target.value)) })} />
          </label>
        </div>
        <p className="muted">Cuando un giro "gana", se asigna al azar un premio con inventario disponible. Si no queda inventario, el resultado es "Sigue intentando".</p>
      </div>

      <div className="panel">
        <h2>Premios e inventario</h2>
        <table className="table">
          <thead><tr><th>Premio</th><th>Total</th><th>Disponibles</th><th>Entregados</th><th>Activo</th></tr></thead>
          <tbody>
            {prizes.map((p) => (
              <tr key={p.id}>
                <td><input defaultValue={p.label} onBlur={(e) => e.target.value !== p.label && savePrize(p, { label: e.target.value })} /></td>
                <td><input type="number" min="0" className="num" defaultValue={p.stock_total}
                  onBlur={(e) => {
                    const total = Math.max(0, Number(e.target.value));
                    const given = p.stock_total - p.stock_remaining;
                    savePrize(p, { stock_total: total, stock_remaining: Math.max(0, total - given) });
                  }} /></td>
                <td>{p.stock_remaining}</td>
                <td>{p.stock_total - p.stock_remaining}</td>
                <td><input type="checkbox" checked={p.active} onChange={(e) => savePrize(p, { active: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Winners />
    </>
  );
}

function Winners() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    supabase.from('registrations').select('full_name,email,phone,city,voucher,created_at,prizes(label)')
      .not('prize_id', 'is', null).order('created_at', { ascending: false })
      .then(({ data }) => setRows(data || []));
  }, []);
  return (
    <div className="panel">
      <h2>Ganadores</h2>
      {rows.length === 0 ? <p className="muted">Aún no hay ganadores.</p> : (
        <div className="scroll">
          <table className="table">
            <thead><tr><th>Nombre</th><th>Premio</th><th>Código</th><th>Teléfono</th><th>Correo</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.voucher}><td>{r.full_name}</td><td>{r.prizes?.label}</td><td><code>{r.voucher}</code></td><td>{r.phone}</td><td>{r.email}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* --------------------------- EDITOR ENCUESTA -------------------------- */
const TYPES = {
  single: 'Selección única',
  multiple: 'Selección múltiple',
  text: 'Respuesta libre',
  scale: 'Escala 1 a 5',
  number: 'Número',
};
const EMPTY = { question: '', type: 'single', measure: 'cualitativa', options: [], required: true, active: true };

function SurveyEditor() {
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => supabase.from('survey_questions').select('*').order('sort').then(({ data }) => setList(data || []));
  useEffect(() => { load(); }, []);

  async function save(q) {
    const row = {
      question: q.question.trim(), type: q.type, measure: q.measure,
      options: ['single', 'multiple'].includes(q.type) ? q.options.filter(Boolean) : [],
      required: q.required, active: q.active,
    };
    if (q.id) await supabase.from('survey_questions').update(row).eq('id', q.id);
    else await supabase.from('survey_questions').insert({ ...row, sort: (list.at(-1)?.sort || 0) + 1 });
    setEditing(null);
    load();
  }
  async function remove(q) {
    if (!window.confirm(`¿Eliminar la pregunta "${q.question}"?`)) return;
    await supabase.from('survey_questions').delete().eq('id', q.id);
    load();
  }
  async function move(i, dir) {
    const a = list[i], b = list[i + dir];
    if (!b) return;
    await Promise.all([
      supabase.from('survey_questions').update({ sort: b.sort }).eq('id', a.id),
      supabase.from('survey_questions').update({ sort: a.sort }).eq('id', b.id),
    ]);
    load();
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Preguntas de la encuesta</h2>
        <button className="mini pink" onClick={() => setEditing({ ...EMPTY })}>+ Nueva pregunta</button>
      </div>
      {editing && <QuestionForm initial={editing} onCancel={() => setEditing(null)} onSave={save} />}
      <ul className="qlist">
        {list.map((q, i) => (
          <li key={q.id} className={q.active ? '' : 'off'}>
            <div>
              <strong>{i + 1}. {q.question}</strong>
              <p className="muted">
                {TYPES[q.type]} · {q.measure}{q.required ? ' · obligatoria' : ''}{!q.active ? ' · oculta' : ''}
                {q.options?.length ? ` · ${q.options.join(', ')}` : ''}
              </p>
            </div>
            <div className="actions">
              <button className="mini" onClick={() => move(i, -1)} aria-label="Subir">↑</button>
              <button className="mini" onClick={() => move(i, 1)} aria-label="Bajar">↓</button>
              <button className="mini" onClick={() => setEditing({ ...q })}>Editar</button>
              <button className="mini danger" onClick={() => remove(q)}>Eliminar</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuestionForm({ initial, onSave, onCancel }) {
  const [q, setQ] = useState({ ...initial, options: initial.options?.length ? initial.options : [''] });
  const hasOptions = ['single', 'multiple'].includes(q.type);
  const set = (k, v) => setQ((x) => ({ ...x, [k]: v }));

  function changeType(type) {
    const measure = ['scale', 'number'].includes(type) ? 'cuantitativa' : q.measure;
    setQ((x) => ({ ...x, type, measure }));
  }

  return (
    <form className="qform" onSubmit={(e) => { e.preventDefault(); if (q.question.trim()) onSave(q); }}>
      <label>Pregunta
        <input value={q.question} onChange={(e) => set('question', e.target.value)} required />
      </label>
      <div className="row">
        <label>Tipo de respuesta
          <select value={q.type} onChange={(e) => changeType(e.target.value)}>
            {Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label>Clasificación
          <select value={q.measure} onChange={(e) => set('measure', e.target.value)}>
            <option value="cualitativa">Cualitativa</option>
            <option value="cuantitativa">Cuantitativa</option>
          </select>
        </label>
      </div>
      {hasOptions && (
        <div className="opts">
          <span>Opciones</span>
          {q.options.map((o, i) => (
            <div key={i} className="opt-row">
              <input value={o} placeholder={`Opción ${i + 1}`}
                onChange={(e) => set('options', q.options.map((x, j) => (j === i ? e.target.value : x)))} />
              <button type="button" className="mini danger" onClick={() => set('options', q.options.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className="mini" onClick={() => set('options', [...q.options, ''])}>+ Opción</button>
        </div>
      )}
      <div className="row">
        <label className="check"><input type="checkbox" checked={q.required} onChange={(e) => set('required', e.target.checked)} /> Obligatoria</label>
        <label className="check"><input type="checkbox" checked={q.active} onChange={(e) => set('active', e.target.checked)} /> Visible</label>
      </div>
      <div className="row">
        <button className="mini pink">Guardar</button>
        <button type="button" className="mini" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

/* ------------------------- RESULTADOS ENCUESTA ------------------------ */
function SurveyResults() {
  const [answers, setAnswers] = useState(null);
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    Promise.all([
      supabase.from('survey_answers').select('question_id,question_text,answer').limit(10000),
      supabase.from('survey_questions').select('*').order('sort'),
    ]).then(([a, q]) => { setAnswers(a.data || []); setQuestions(q.data || []); });
  }, []);

  const grouped = useMemo(() => {
    if (!answers) return [];
    const byQ = new Map();
    for (const a of answers) {
      const k = a.question_id ?? a.question_text;
      if (!byQ.has(k)) byQ.set(k, { text: a.question_text, values: [] });
      byQ.get(k).values.push(a.answer);
    }
    return [...byQ.entries()].map(([k, g]) => ({ ...g, q: questions.find((q) => q.id === k) }));
  }, [answers, questions]);

  if (!answers) return <p className="muted">Cargando…</p>;
  if (!grouped.length) return <div className="panel"><p className="muted">Aún no hay respuestas.</p></div>;

  return grouped.map((g) => {
    const type = g.q?.type;
    let body;
    if (type === 'single' || type === 'multiple') {
      const counts = {};
      g.values.flat().forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
      body = <Bars rows={Object.entries(counts).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total)} />;
    } else if (type === 'scale' || type === 'number') {
      const nums = g.values.map(Number).filter((n) => !Number.isNaN(n));
      const avg = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : '—';
      const counts = {};
      nums.forEach((n) => { counts[n] = (counts[n] || 0) + 1; });
      body = (
        <>
          <p className="avg">Promedio: <strong>{avg}</strong> · Mín {Math.min(...nums)} · Máx {Math.max(...nums)}</p>
          <Bars rows={Object.entries(counts).map(([name, total]) => ({ name, total })).sort((a, b) => a.name - b.name)} color="var(--teal)" />
        </>
      );
    } else {
      body = <ul className="texts">{g.values.filter(Boolean).map((v, i) => <li key={i}>“{String(v)}”</li>)}</ul>;
    }
    return (
      <div className="panel" key={g.text}>
        <div className="panel-head">
          <h2>{g.text}</h2>
          <span className="tag">{g.q ? `${TYPES[type]} · ${g.q.measure}` : 'pregunta eliminada'} · {g.values.length} resp.</span>
        </div>
        {body}
      </div>
    );
  });
}

/* ------------------------------ REGISTRADOS --------------------------- */
function People() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    supabase.from('registrations').select('*, prizes(label)').order('created_at', { ascending: false })
      .then(({ data }) => setRows(data || []));
  }, []);

  const filtered = (rows || []).filter((r) =>
    [r.full_name, r.email, r.phone, r.city].join(' ').toLowerCase().includes(q.toLowerCase()));

  function exportCsv() {
    const head = ['Fecha', 'Nombre', 'Correo', 'Teléfono', 'Ciudad', 'Encuesta', 'Intentos', 'Premio', 'Código'];
    const lines = filtered.map((r) => [
      new Date(r.created_at).toLocaleString('es-CO'), r.full_name, r.email, r.phone, r.city,
      r.survey_completed ? 'Sí' : 'No', r.attempts, r.prizes?.label || '', r.voucher || '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `registros-la-regatta-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  if (!rows) return <p className="muted">Cargando…</p>;
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Registrados ({rows.length})</h2>
        <div className="row">
          <input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="mini pink" onClick={exportCsv}>Exportar CSV</button>
        </div>
      </div>
      <div className="scroll">
        <table className="table">
          <thead><tr><th>Fecha</th><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Ciudad</th><th>Encuesta</th><th>Intentos</th><th>Premio</th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleDateString('es-CO')}</td>
                <td>{r.full_name}</td><td>{r.email}</td><td>{r.phone}</td><td>{r.city}</td>
                <td>{r.survey_completed ? '✓' : '—'}</td><td>{r.attempts}</td>
                <td>{r.prizes?.label ? <span className="tag">{r.prizes.label}</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
