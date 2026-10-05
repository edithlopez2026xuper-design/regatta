import { useState } from 'react';
import { supabase, trackClick } from '../lib/supabase.js';

// Segmentos de la ruleta (el resultado real lo decide el servidor)
const SEGMENTS = [
  { key: 'DESC10', label: '10%', color: '#D13F6F' },
  { key: 'LOSE', label: 'Sigue', sub: 'intentando', color: '#F5E6D3', dark: true },
  { key: 'DESC5', label: '5%', color: '#1B8E8F' },
  { key: 'CENA2', label: 'Cena', sub: 'para 2', color: '#F6BA33', dark: true },
  { key: 'LOSE', label: 'Sigue', sub: 'intentando', color: '#FDF7F0', dark: true },
  { key: 'DESC10', label: '10%', color: '#34110D' },
  { key: 'DESC5', label: '5%', color: '#134252' },
  { key: 'LOSE', label: 'Sigue', sub: 'intentando', color: '#F5E6D3', dark: true },
];
const SLICE = 360 / SEGMENTS.length;
const R = 150;

function polar(angle, r) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [R + r * Math.cos(rad), R + r * Math.sin(rad)];
}

function slicePath(i) {
  const [x1, y1] = polar(i * SLICE, R);
  const [x2, y2] = polar((i + 1) * SLICE, R);
  return `M${R},${R} L${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2} Z`;
}

export default function SpinWheel({ regId, status }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [message, setMessage] = useState(null);
  const [left, setLeft] = useState(status ? status.max_attempts - status.attempts : 0);
  const [prize, setPrize] = useState(status?.voucher ? { prize: status.prize, voucher: status.voucher } : null);
  const [inactive, setInactive] = useState(status && !status.game_active && !status.voucher);

  async function spin() {
    if (spinning) return;
    trackClick('girar_ruleta');
    setSpinning(true);
    setMessage(null);

    const { data, error } = await supabase.rpc('play_game', { p_reg: regId });
    if (error) { setMessage({ type: 'error', text: error.message }); setSpinning(false); return; }

    if (data.status === 'inactive') { setInactive(true); setSpinning(false); return; }
    if (data.status === 'no_attempts') { setLeft(0); setSpinning(false); return; }
    if (data.status === 'already_won') { setPrize(data); setSpinning(false); return; }

    const key = data.status === 'win' ? data.prize_code : 'LOSE';
    const options = SEGMENTS.map((s, i) => (s.key === key ? i : -1)).filter((i) => i >= 0);
    const target = options[Math.floor(Math.random() * options.length)];
    const jitter = (Math.random() - 0.5) * (SLICE * 0.6);
    const center = target * SLICE + SLICE / 2 + jitter;
    const base = rotation - (rotation % 360);
    setRotation(base + 360 * 6 + (360 - center));

    setTimeout(() => {
      setSpinning(false);
      setLeft(data.attempts_left);
      if (data.status === 'win') {
        setPrize(data);
      } else {
        setMessage({
          type: 'lose',
          text: data.attempts_left > 0
            ? `¡Sigue intentando! Te quedan ${data.attempts_left} ${data.attempts_left === 1 ? 'intento' : 'intentos'}.`
            : '¡Sigue intentando! Esta vez no hubo suerte, pero te esperamos en La Regatta.',
        });
      }
    }, 5200);
  }

  if (inactive) {
    return (
      <div className="center">
        <h3 className="card-title">¡Gracias por registrarte!</h3>
        <p>La ruleta de premios no está activa en este momento. Vuelve pronto para jugar.</p>
      </div>
    );
  }

  return (
    <div className="game">
      <h3 className="card-title center">Gira y gana</h3>
      <p className="muted center">10 % · 5 % de descuento o una cena para 2 personas</p>

      <div className="wheel-wrap">
        <div className="pointer" />
        <svg
          className="wheel"
          viewBox={`0 0 ${R * 2} ${R * 2}`}
          style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? 'transform 5s cubic-bezier(.17,.67,.12,1)' : 'none' }}
        >
          {SEGMENTS.map((s, i) => {
            const mid = i * SLICE + SLICE / 2;
            const [tx, ty] = polar(mid, R * 0.64);
            return (
              <g key={i}>
                <path d={slicePath(i)} fill={s.color} stroke="#fff" strokeWidth="2" />
                <g transform={`translate(${tx},${ty}) rotate(${mid})`}>
                  <text textAnchor="middle" className="seg-label" fill={s.dark ? '#34110D' : '#fff'} y={s.sub ? -2 : 6}>
                    {s.label}
                  </text>
                  {s.sub && (
                    <text textAnchor="middle" className="seg-sub" fill={s.dark ? '#34110D' : '#fff'} y={12}>{s.sub}</text>
                  )}
                </g>
              </g>
            );
          })}
          <circle cx={R} cy={R} r="22" fill="#34110D" stroke="#F6BA33" strokeWidth="4" />
        </svg>
      </div>

      {prize ? (
        <div className="prize">
          <p className="prize-kicker">¡Felicitaciones, ganaste!</p>
          <p className="prize-title">{prize.prize}</p>
          <p className="voucher">{prize.voucher}</p>
          <p className="muted">Toma captura de pantalla y presenta este código en el restaurante. Válido por una sola vez.</p>
        </div>
      ) : left > 0 ? (
        <>
          <button className="btn btn-pink" onClick={spin} disabled={spinning}>
            {spinning ? 'Girando…' : 'Girar la ruleta'}
          </button>
          <p className="muted center">Intentos disponibles: {left}</p>
        </>
      ) : (
        <p className="center lose">{message?.text || '¡Sigue intentando! Ya usaste tus intentos, gracias por participar.'}</p>
      )}

      {message && !prize && left > 0 && <p className={`center ${message.type}`}>{message.text}</p>}
    </div>
  );
}
