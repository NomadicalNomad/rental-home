/* GitHub Pages fallback: marketing CTAs must keep sign-up vs sign-in. */
(function () {
  if (!/\.github\.io$/i.test(location.hostname)) return;
  var base = 'https://nomadicalnomad.github.io/rental-home/app/';
  document.querySelectorAll('[data-app-cta]').forEach(function (a) {
    var hash = '';
    try { hash = new URL(a.getAttribute('href'), location.href).hash; } catch (e) {}
    var mode = a.getAttribute('data-app-cta');
    if (!hash) {
      if (mode === 'signup') hash = '#signup';
      else if (mode === 'signin') hash = '#signin';
    }
    a.href = base + hash;
  });
})();
