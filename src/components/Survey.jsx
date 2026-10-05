import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function Survey({ regId, onDone }) {
  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase
      .from('survey_questions')
      .select('*')
      .eq('active', true)
      .order('sort')
      .then(({ data }) => setQuestions(data || []));
  }, []);

  // Sin preguntas activas: pasa directo al juego
  useEffect(() => {
    if (questions && questions.length === 0) finish();
  }, [questions]);

  const setA = (id, v) => setAnswers((a) => ({ ...a, [id]: v }));

  function toggle(id, opt) {
    const cur = answers[id] || [];
    setA(id, cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt]);
  }

  async function finish() {
    setSending(true);
    const payload = Object.entries(answers).map(([question_id, answer]) => ({ question_id: Number(question_id), answer }));
    const { error: err } = await supabase.rpc('submit_survey', { p_reg: regId, p_answers: payload });
    setSending(false);
    if (err) { setError(err.message); return; }
    onDone();
  }

  function submit(e) {
    e.preventDefault();
    const missing = questions.find((q) => {
      const v = answers[q.id];
      return q.required && (v === undefined || v === '' || (Array.isArray(v) && v.length === 0));
    });
    if (missing) { setError(`Responde: "${missing.question}"`); return; }
    setError('');
    finish();
  }

  if (!questions) return <p className="muted">Cargando encuesta…</p>;
  if (questions.length === 0) return <p className="muted">Preparando el juego…</p>;

  return (
    <form className="form" onSubmit={submit}>
      <h3 className="card-title">Cuéntanos un poco de ti</h3>
      <p className="muted">Al terminar desbloqueas la ruleta de premios.</p>
      {questions.map((q, i) => (
        <fieldset key={q.id} className="q">
          <legend>{i + 1}. {q.question}{q.required && <span className="req"> *</span>}</legend>

          {q.type === 'single' && q.options.map((o) => (
            <label key={o} className={`opt ${answers[q.id] === o ? 'sel' : ''}`}>
              <input type="radio" name={`q${q.id}`} checked={answers[q.id] === o} onChange={() => setA(q.id, o)} />{o}
            </label>
          ))}

          {q.type === 'multiple' && q.options.map((o) => (
            <label key={o} className={`opt ${(answers[q.id] || []).includes(o) ? 'sel' : ''}`}>
              <input type="checkbox" checked={(answers[q.id] || []).includes(o)} onChange={() => toggle(q.id, o)} />{o}
            </label>
          ))}

          {q.type === 'text' && (
            <textarea rows={3} value={answers[q.id] || ''} onChange={(e) => setA(q.id, e.target.value)} placeholder="Escribe tu respuesta" />
          )}

          {q.type === 'number' && (
            <input type="number" inputMode="numeric" value={answers[q.id] ?? ''} onChange={(e) => setA(q.id, e.target.value === '' ? '' : Number(e.target.value))} />
          )}

          {q.type === 'scale' && (
            <div className="scale">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} className={answers[q.id] === n ? 'sel' : ''} onClick={() => setA(q.id, n)}>{n}</button>
              ))}
            </div>
          )}
        </fieldset>
      ))}
      {error && <p className="error">{error}</p>}
      <button className="btn btn-pink" disabled={sending}>{sending ? 'Guardando…' : 'Enviar y jugar'}</button>
    </form>
  );
}
