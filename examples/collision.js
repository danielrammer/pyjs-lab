const canvas = graphics.canvas({width: 600, height: 360, title: "Ball und schräge Plattform"});
const ctx = canvas.getContext("2d");
const radius = 21;
let x = 300, y = canvas.height-radius, vx = 0, vy = 0, holding = false;

// Das Viereck dreht sich um seinen Mittelpunkt.
const cx = 300, cy = 230, width = 260, height = 18, angle = -20;
const c = Math.cos(angle*Math.PI/180), s = Math.sin(angle*Math.PI/180);
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle*Math.PI/180);
  ctx.fillStyle = "purple"; ctx.fillRect(-width/2, -height/2, width, height);
  ctx.restore();
  ctx.fillStyle = "gray"; ctx.fillRect(0, canvas.height-2, canvas.width, 2);
  ctx.fillStyle = "royalblue";
  ctx.beginPath(); ctx.arc(x, y, radius, 0, 2*Math.PI); ctx.fill();
}
function point(event) {
  const box = canvas.getBoundingClientRect();
  return {x: (event.clientX-box.left)*canvas.width/box.width,
          y: (event.clientY-box.top)*canvas.height/box.height};
}
canvas.addEventListener("pointerdown", event => {
  const p = point(event);
  if (event.button === 0 && Math.hypot(x-p.x, y-p.y) <= radius) {
    holding = true; vx = vy = 0;
    canvas.setPointerCapture(event.pointerId);
  }
});
canvas.addEventListener("pointermove", event => {
  if (!holding) return;
  const p = point(event);
  x = Math.max(radius, Math.min(canvas.width-radius, p.x));
  y = Math.max(radius, Math.min(canvas.height-radius, p.y));
  draw();
});
function release() { holding = false; }
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);

function collideRectangle() {
  // Drehe den Ball gedanklich zurück: Das Viereck liegt dann gerade.
  const dx = x-cx, dy = y-cy, lx = dx*c+dy*s, ly = -dx*s+dy*c;
  const hx = width/2, hy = height/2;
  // Suche den nächstgelegenen Punkt auf dem geraden Viereck.
  const qx = Math.max(-hx, Math.min(hx, lx)), qy = Math.max(-hy, Math.min(hy, ly));
  let nx = lx-qx, ny = ly-qy, distance = Math.hypot(nx, ny), overlap;
  if (distance >= radius) return;
  if (distance > 0) {
    nx /= distance; ny /= distance; overlap = radius-distance;
  } else {
    // Liegt der Mittelpunkt innen, verwende die nächstgelegene Seite.
    const gapX = hx-Math.abs(lx), gapY = hy-Math.abs(ly);
    if (gapX < gapY) { nx = lx >= 0 ? 1 : -1; ny = 0; overlap = radius+gapX; }
    else { nx = 0; ny = ly >= 0 ? 1 : -1; overlap = radius+gapY; }
  }
  // Drehe die Kollisionsrichtung wieder in die Canvas-Koordinaten.
  const worldX = nx*c-ny*s, worldY = nx*s+ny*c;
  x += worldX*overlap; y += worldY*overlap;
  // Nur abprallen, wenn sich der Ball auf die Oberfläche zubewegt.
  const speed = vx*worldX+vy*worldY;
  if (speed < 0) { vx -= 1.7*speed*worldX; vy -= 1.7*speed*worldY; }
}
canvas.animate(dt => {
  if (holding) return;
  // Kleine Teilschritte verhindern das Durchfallen bei niedrigen Frameraten.
  const steps = Math.max(1, Math.ceil(dt/0.01)), step = dt/steps;
  for (let i = 0; i < steps; i++) {
    vy += 588*step; x += vx*step; y += vy*step;
    collideRectangle();
    if (x < radius) { x = radius; vx = Math.abs(vx)*0.7; }
    else if (x > canvas.width-radius) { x = canvas.width-radius; vx = -Math.abs(vx)*0.7; }
    if (y > canvas.height-radius) {
      y = canvas.height-radius; vy = -Math.abs(vy)*0.7; vx *= 0.98;
      if (Math.abs(vy) < 25) vy = 0;
    }
  }
  draw();
});
draw();
