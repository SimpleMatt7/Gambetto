import { useAccount } from '../lib/account.ts';
import { href } from '../lib/router.ts';

export function Privacy() {
  const { config } = useAccount();
  return (
    <div className="page prose">
      <header className="page-head">
        <span className="eyebrow">Informativa</span>
        <h1>Privacy, in breve</h1>
        <p className="lead">Gambetto è un progetto gratuito e senza pubblicità. Raccoglie il minimo indispensabile per funzionare.</p>
      </header>

      <h2>Se non hai un account</h2>
      <p>
        Non viene salvato nulla sul server. I tuoi progressi e le tue preferenze restano solo nel browser del dispositivo che stai usando: se cancelli i dati del browser, spariscono.
      </p>

      <h2>Se crei un account</h2>
      <p>Sul server vengono conservati soltanto:</p>
      <ul>
        <li>
          il <strong>nome utente</strong> che scegli, visibile ai tuoi avversari;
        </li>
        <li>
          la <strong>password</strong>, in forma cifrata e non leggibile da nessuno, nemmeno dall'amministratore;
        </li>
        <li>
          i <strong>progressi</strong>: lezioni completate, aperture allenate, risultati contro il computer;
        </li>
        <li>
          le <strong>partite online</strong> che giochi, con le mosse e l'esito;
        </li>
        <li>le date di registrazione e di ultimo accesso.</li>
      </ul>
      <p>Non vengono chiesti email, nome reale o altri dati personali. Non c'è recupero della password via email: se la dimentichi, può reimpostarla solo l'amministratore.</p>

      <h2>Cookie</h2>
      <p>
        Viene usato un solo cookie tecnico, che serve a tenerti collegato dopo l'accesso. Non ci sono cookie di tracciamento, statistiche o pubblicità, e nessun dato viene passato a terzi.
      </p>

      <h2>Cancellare i tuoi dati</h2>
      <p>
        Puoi eliminare il tuo account in qualsiasi momento dalla <a href={href('account')}>pagina del tuo account</a>: nome utente, password e progressi vengono cancellati subito. Le partite online che hai giocato restano
        nello storico dei tuoi avversari, ma senza il tuo nome.
      </p>

      <h2>Contatti</h2>
      <p>{config.contact ? `Per qualsiasi richiesta puoi scrivere a: ${config.contact}` : 'Per qualsiasi richiesta puoi rivolgerti a chi ti ha invitato su questo sito, che ne è il gestore.'}</p>
    </div>
  );
}
