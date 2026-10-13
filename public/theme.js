// Imposta il tema prima che la pagina venga disegnata, per evitare un lampo del tema sbagliato.
// La stessa scelta viene poi tenuta aggiornata dall'app (src/lib/theme.ts).
(function () {
  var appearance = 'dark';
  try {
    appearance = (JSON.parse(localStorage.getItem('gambetto:v1') || '{}').settings || {}).appearance || 'dark';
  } catch (e) {
    /* archiviazione non disponibile: resta il tema scuro */
  }
  var light = appearance === 'light' || (appearance === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
})();
