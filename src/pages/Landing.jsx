import { useEffect } from 'react';
import { BRAND, REASONS } from '../config.js';
import { trackClick, trackVisit } from '../lib/supabase.js';
import { Icon } from '../components/Icons.jsx';
import RegistrationFlow from '../components/RegistrationFlow.jsx';

export default function Landing() {
  useEffect(() => {
    trackVisit(window.location.pathname || '/');
  }, []);

  return (
    <main className="tap">
      <header className="hero">
        <img className="hero-logo" src={BRAND.logo} alt="La Regatta" />
        <p className="hero-eyebrow">San Andrés Isla · Since 1999</p>
        <h1>Nuestro Propósito</h1>
        <p className="hero-text">
          Gloria y Guillo Basmagi transformaron un muelle en San Andrés en el lugar más acogedor.
          Descubre sus reservas y redes.
        </p>
        <a className="btn btn-pink" href={BRAND.web} target="_blank" rel="noreferrer" onClick={() => trackClick('pagina_web')}>
          Página Web
        </a>
        <a className="btn btn-wine" href={BRAND.reservas} target="_blank" rel="noreferrer" onClick={() => trackClick('reservar')}>
          Reserva Aquí
        </a>
      </header>

      <section className="why">
        <h2>¿Por Qué Elegir La Regatta?</h2>
        <ul className="reasons">
          {REASONS.map((r) => (
            <li key={r.title}>
              <span className="reason-icon"><Icon name={r.icon} /></span>
              <div>
                <h3>{r.title}</h3>
                <p>{r.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="register">
        <RegistrationFlow />
      </section>

      <footer className="social">
        <h2>Síguenos en Redes Sociales</h2>
        <div className="social-row">
          <a className="social-btn ig" href={BRAND.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" onClick={() => trackClick('instagram')}>
            <Icon name="instagram" size={40} />
          </a>
          <a className="social-btn fb" href={BRAND.facebook} target="_blank" rel="noreferrer" aria-label="Facebook" onClick={() => trackClick('facebook')}>
            <Icon name="facebook" size={40} />
          </a>
        </div>
        <p className="copy">© {new Date().getFullYear()} La Regatta · San Andrés Isla</p>
      </footer>
    </main>
  );
}
