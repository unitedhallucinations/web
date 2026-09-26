(function () {
  var svgNS = "http://www.w3.org/2000/svg";
  var wrap = document.getElementById('burstWrap');
  var svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 1000 1000');
  wrap.appendChild(svg);

  function starPath(cx, cy, points, rOuter, rInner, rotationDeg) {
    var d = '';
    var total = points * 2;
    for (var i = 0; i < total; i++) {
      var r = (i % 2 === 0) ? rOuter : rInner;
      var angle = (Math.PI * i / points) + (rotationDeg * Math.PI / 180);
      var x = cx + Math.cos(angle) * r;
      var y = cy + Math.sin(angle) * r;
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    }
    return d + 'Z';
  }

  // shape recipe shared by all three colour layers
  var rings = [
    { points: 6,  rOuter: 440, rInner: 250, rot: 10 },
    { points: 10, rOuter: 390, rInner: 165, rot: -8 },
    { points: 5,  rOuter: 330, rInner: 90,  rot: 195 },
    { points: 16, rOuter: 465, rInner: 430, rot: 5 },
    { points: 3,  rOuter: 260, rInner: 260, rot: 30 },
    { points: 4,  rOuter: 480, rInner: 480, rot: 45 },
    { points: 20, rOuter: 150, rInner: 65,  rot: -15 }
  ];
  var circles = [ 200, 340, 460 ];

  var dots = [];
  for (var i = 0; i < 30; i++) {
    var a = -0.7 + i * 0.05;
    var r = 520 + (i % 6) * 22;
    dots.push({
      x: 500 + Math.cos(a) * r,
      y: 500 + Math.sin(a) * r,
      s: 2 + (i % 4)
    });
  }

  function buildRays(cx, cy, count, rIn, rOut) {
    var g = document.createElementNS(svgNS, 'g');
    g.setAttribute('class', 'rays');
    for (var i = 0; i < count; i++) {
      var angle = (i / count) * Math.PI * 2;
      var len = (i % 3 === 0) ? rOut : rOut - 40;
      var line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', (cx + Math.cos(angle) * rIn).toFixed(1));
      line.setAttribute('y1', (cy + Math.sin(angle) * rIn).toFixed(1));
      line.setAttribute('x2', (cx + Math.cos(angle) * len).toFixed(1));
      line.setAttribute('y2', (cy + Math.sin(angle) * len).toFixed(1));
      g.appendChild(line);
    }
    return g;
  }

  function buildLayer(cls) {
    var g = document.createElementNS(svgNS, 'g');
    g.setAttribute('class', 'burst-layer ' + cls);

    rings.forEach(function (ring) {
      var p = document.createElementNS(svgNS, 'path');
      p.setAttribute('d', starPath(500, 500, ring.points, ring.rOuter, ring.rInner, ring.rot));
      g.appendChild(p);
    });

    circles.forEach(function (r) {
      var c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', 500);
      c.setAttribute('cy', 500);
      c.setAttribute('r', r);
      g.appendChild(c);
    });

    dots.forEach(function (dot) {
      var c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', dot.x.toFixed(1));
      c.setAttribute('cy', dot.y.toFixed(1));
      c.setAttribute('r', dot.s);
      c.setAttribute('stroke-width', '1');
      g.appendChild(c);
    });

    return g;
  }

  function buildFlowerOfLife(cx, cy, size, ringLimit) {
    var g = document.createElementNS(svgNS, 'g');
    g.setAttribute('class', 'sacred');
    for (var q = -ringLimit; q <= ringLimit; q++) {
      for (var rAx = -ringLimit; rAx <= ringLimit; rAx++) {
        var s = -q - rAx;
        if (Math.abs(s) > ringLimit) continue;
        var x = cx + size * 1.5 * q;
        var y = cy + size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * rAx);
        var c = document.createElementNS(svgNS, 'circle');
        c.setAttribute('cx', x.toFixed(1));
        c.setAttribute('cy', y.toFixed(1));
        c.setAttribute('r', size);
        g.appendChild(c);
      }
    }
    return g;
  }

  function buildSpiral(cx, cy, turns, steps, cls) {
    var d = '';
    for (var i = 0; i <= steps; i++) {
      var t = (i / steps) * turns * Math.PI * 2;
      var r = 24 + t * 21;
      var x = cx + Math.cos(t) * r;
      var y = cy + Math.sin(t) * r;
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    }
    var p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', 'spiral ' + cls);
    return p;
  }

  var star = document.createElementNS(svgNS, 'polygon');
  star.setAttribute('class', 'redstar');
  star.setAttribute('points', starPath(500, 500, 5, 470, 185, -90).replace(/[MLZ]/g, '').trim());

  var flower2 = buildFlowerOfLife(500, 500, 96, 3);
  flower2.setAttribute('class', 'sacred2');

  svg.appendChild(buildFlowerOfLife(500, 500, 135, 2));
  svg.appendChild(flower2);
  svg.appendChild(buildSpiral(500, 500, 3.2, 140, 'c'));
  svg.appendChild(buildSpiral(500, 500, -3.2, 140, 'm'));
  svg.appendChild(star);
  svg.appendChild(buildRays(500, 500, 40, 470, 590));
  svg.appendChild(buildLayer('ink'));
  svg.appendChild(buildLayer('cyan'));
  svg.appendChild(buildLayer('magenta'));
})();
