// Keeps the release count in sync with the embeds actually present in .releases.
// The static number in each artist page is the no-JS fallback; this corrects it
// whenever releases are added or moved between pages.
(function () {
  var meta = document.querySelector('.artist-meta');
  var list = document.querySelector('.releases');
  if (!meta || !list) return;

  var n = list.querySelectorAll('iframe').length;
  meta.textContent = n + (n === 1 ? ' release' : ' releases');
})();
