// Colour bars in the header (the strip and the logo): cycle the stack so the
// current page's colour sits at the bottom, animating from wherever the
// previous page left it.
(function () {
  var tracks = Array.prototype.slice.call(document.querySelectorAll('.nav-bars__track'));
  if (!tracks.length) return;

  var count = tracks[0].children.length;

  // Three copies of the bars so any rotation is a plain vertical translate.
  tracks.forEach(function (track) {
    var bars = Array.prototype.slice.call(track.children);
    [0, 1].forEach(function () {
      bars.forEach(function (bar) { track.appendChild(bar.cloneNode(true)); });
    });
  });

  var page = location.pathname.split('/').pop() || 'index.html';
  var selected = -1;
  document.querySelectorAll('.site-header .nav-link').forEach(function (link, i) {
    if (link.getAttribute('href') === page) selected = i;
  });

  // Index of the top visible bar, taken from the middle copy.
  // Home (no selection) keeps the default order.
  var offset = selected < 0 ? count : count + (selected + 1) % count;

  function place(index) {
    tracks.forEach(function (track) {
      track.style.transform = 'translateY(' + (-index * 100 / count) + '%)';
    });
  }

  var previous = null;
  try { previous = sessionStorage.getItem('navBarsOffset'); } catch (e) {}
  try { sessionStorage.setItem('navBarsOffset', String(offset)); } catch (e) {}

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (previous === null || Number(previous) === offset || reduceMotion) {
    place(offset);
    return;
  }

  place(Number(previous));
  tracks[0].getBoundingClientRect(); // commit the starting position before animating
  tracks.forEach(function (track) { track.classList.add('is-animating'); });
  place(offset);
})();
