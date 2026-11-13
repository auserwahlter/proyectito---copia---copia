/* ════════════════════════════════════════════════════════════════
   encyclopedia.js  
   ════════════════════════════════════════════════════════════════ */

const CAT_COLOR = {
  guard:      '#4a9eff',
  pass:       '#ff7a45',
  sweep:      '#a8e063',
  submission: '#d97aff',
  escape:     '#ffca45',
  takedown:   '#45e8c8'
};

/* ── Base de datos de técnicas ──────────────────────────────────── */
const DB = {
  nodes: [
    {id:'closed-guard', label:'Closed Guard', cat:'guard', x:340, y:300, root:true,
     desc:'The fundamental guard position where you control the opponent with your legs locked around their waist.',
     keypoints:['Control the posture by breaking grips','Use legs as a lever system','Maintain hip mobility at all times','Break posture before attacking'],
     details:{overview:'Closed Guard is BJJ\'s most iconic position. From here you can threaten submissions, sweeps and back takes simultaneously, making it one of the most versatile positions in the art.',setup:'Lie on your back with opponent between your legs. Lock your ankles behind their back. Pull their head/arm with your hands to break posture.',concepts:'The guard functions as a weapon. Every technique flows from posture control. Hip mobility and angle changes create the openings.',common_mistakes:'Staying flat on your back, not breaking posture first, crossing feet at the ankles instead of locking properly.'}},
    {id:'half-guard', label:'Half Guard', cat:'guard', x:160, y:200,
     desc:'A guard where you control one of the opponent\'s legs between yours.',
     keypoints:['Get to your side, never flat','Underhook is critical','Thread the needle to deep half','Prevent the crossface'],
     details:{overview:'Half guard is a transitional and attacking position. It lies between full guard and being fully passed. Modern BJJ has turned it into a complete offensive system.',setup:'One of opponent\'s legs is between yours. Get to your side and fight for the underhook immediately.',concepts:'The underhook is your best friend. Everything from half guard flows from winning the underhook battle.',common_mistakes:'Staying flat, conceding the crossface, not maintaining hip-to-hip contact with the trapped leg.'}},
    {id:'butterfly-guard', label:'Butterfly Guard', cat:'guard', x:500, y:180,
     desc:'Open guard using your hooks inside the opponent\'s thighs as levers for sweeps.',
     keypoints:['Keep active hooks under thighs','Control wrists and sleeves','Create off-balancing before sweep','Elevation is key'],
     details:{overview:'Butterfly guard uses your hooks (feet inside opponent\'s thighs) to destabilize and sweep. It\'s a highly mobile, offensive open guard system.',setup:'Sit up facing opponent. Insert both feet inside their thighs as hooks. Control their arms/wrists. Maintain a tight posture.',concepts:'You use your feet as levers to lift and tip the opponent. Body position changes constantly to follow their weight shifts.',common_mistakes:'Sitting back passively, losing grip control, allowing opponent to establish heavy crossface.'}},
    {id:'spider-guard', label:'Spider Guard', cat:'guard', x:600, y:320,
     desc:'Open guard using sleeve grips and foot frames on biceps/hips to control distance.',
     keypoints:['Maintain sleeve grips with both hands','Push with feet to keep distance','Angles enable attacks','Combine with lasso for entries'],
     details:{overview:'Spider guard is a grip-dominant, distance-control guard common in the gi. It uses the tension between your grips and foot frames to immobilize the opponent.',setup:'Grip both sleeves. Place one or both feet on biceps or hips. Extend your arms and legs to create tension.',concepts:'The control comes from the tension triangle: grips pull in, feet push out. Any break in this tension is your attack opportunity.',common_mistakes:'Losing sleeve grips, bending legs (no tension), staying symmetrical instead of creating angles.'}},
    {id:'de-la-riva', label:'De La Riva', cat:'guard', x:200, y:420,
     desc:'Open guard hooking behind the opponent\'s lead leg with your same-side foot.',
     keypoints:['Hook deep behind lead leg','Same-side grip on ankle','Opposite hand on sleeve or collar','Create angles for entries'],
     details:{overview:'DLR is a foundational open guard that hooks around the opponent\'s lead leg. It is a gateway to berimbolo, back takes, sweeps and leg lock entries.',setup:'Opponent is standing or kneeling. Hook your foot behind their near leg. Grip their ankle with your same-side hand. Control their opposite arm.',concepts:'The hook prevents the leg from clearing. From here you create angles to go underneath, sweep, or invert.',common_mistakes:'Shallow hook that gets cleared, no ankle grip, staying flat instead of creating rotation.'}},
    {id:'x-guard', label:'X-Guard', cat:'guard', x:100, y:340,
     desc:'Guard from underneath using two hooks and body positioning to sweep standing opponent.',
     keypoints:['Hips under opponent\'s hips','Both hooks engage legs','Hands free for control','Elevate to create instability'],
     details:{overview:'X-Guard places you underneath a standing opponent with your hips under theirs and two hooks engaging their legs. It\'s a powerful sweep and leg lock entry position.',setup:'Get under opponent\'s hips. One foot hooks inside back of knee, other foot hooks inside front of same leg. Elevate with legs.',concepts:'You are a lever under their center of gravity. Hip-in gives you control; hip-out sweeps them.',common_mistakes:'Hips not under opponent, loose hooks, not maintaining elevation tension.'}},
    {id:'triangle', label:'Triangle Choke', cat:'submission', x:200, y:560,
     desc:'Choking the opponent using your legs to form a triangle around their neck and arm.',
     keypoints:['One arm in, one arm out','Cut the angle 90 degrees','Lock behind knee not ankle','Head down, squeeze thighs'],
     details:{overview:'The triangle is one of the highest percentage submissions in BJJ. It chokes by compressing the carotid arteries using your legs.',setup:'Control one arm in, one arm out. Throw your leg over their shoulder, lock behind your own knee. Pull their head down and cut the angle.',concepts:'The choke works by squeezing the sides of the neck. Angle is crucial — square means no choke, 90° means the choke is tight.',common_mistakes:'Staying square, not pulling head down, locking at the ankle instead of behind the knee.'}},
    {id:'armbar', label:'Armbar', cat:'submission', x:450, y:560,
     desc:'Hyperextending the elbow joint by controlling the wrist and using your hips as a fulcrum.',
     keypoints:['Hips must be above elbow','Break the grip before extending','Squeeze knees together','Feet flat, hips up'],
     details:{overview:'The armbar hyperextends the elbow joint. It can be attacked from closed guard, mount, back, and many other positions.',setup:'Control the arm, place the brachium across your hips. Squeeze your knees. Apply pressure by bridging your hips up.',concepts:'Your hips are the fulcrum. Breaking the grip and maintaining proper axis alignment determines whether the lock works.',common_mistakes:'Hips below the elbow, legs apart, not breaking the grip before extending.'}},
    {id:'omoplata', label:'Omoplata', cat:'submission', x:580, y:500,
     desc:'Shoulder lock applied with the legs, rotating the scapula beyond its natural range.',
     keypoints:['Perpendicular to opponent','Sit up when applying','Control hip to prevent roll','Can be swept if defended'],
     details:{overview:'The omoplata rotates the shoulder joint using your leg as a lever. Commonly entered from closed guard or spider guard.',setup:'From guard, swing your leg over opponent\'s arm. Get perpendicular to them, sit up tall, and press their shoulder forward.',concepts:'The shoulder rotates externally. You need to sit up to apply downward pressure. Control their hip to stop the roll-out.',common_mistakes:'Staying flat on back, not sitting up, allowing opponent to roll and reverse.'}},
    {id:'kimura', label:'Kimura', cat:'submission', x:60, y:500,
     desc:'Figure-four grip shoulder lock rotating the arm behind the back.',
     keypoints:['Figure-four grip: wrist + own wrist','Elbow in tight','Rotate arm behind back upward','Control posture before attacking'],
     details:{overview:'The Kimura is a figure-four grip shoulder lock. It attacks the shoulder and elbow simultaneously by rotating the arm up behind the back.',setup:'Grip the wrist with same-side hand. Pass other arm under their arm and grip your own wrist. Elbow must stay below shoulder.',concepts:'The mechanical advantage comes from the figure-four. You rotate the arm upward and behind the back. The joint locks when internal rotation is exhausted.',common_mistakes:'Letting the elbow rise above the shoulder, losing the wrist grip, opponent rolling to escape.'}},
    {id:'rear-naked', label:'Rear Naked Choke', cat:'submission', x:700, y:200,
     desc:'Blood choke from the back controlling the neck with your arms in a figure-four.',
     keypoints:['Seat belt grip to maintain back','Sink hook under chin first','Bicep presses carotid','Squeeze shoulder to shoulder'],
     details:{overview:'The RNC is the highest-percentage finish from back control. It compresses the carotid arteries causing rapid unconsciousness.',setup:'From back control with hooks in, slide choking arm under chin. Grab your own bicep with other arm. Hand behind opponent\'s head. Squeeze.',concepts:'The choke compresses both carotids simultaneously. Head must be straight or slightly tilted. The squeeze is shoulder-to-shoulder, not backward.',common_mistakes:'Chin is not under the neck (instead on forehead), losing back position before finishing, pulling back instead of squeezing sides.'}},
    {id:'knee-slice', label:'Knee Slice Pass', cat:'pass', x:400, y:120,
     desc:'Passing by slicing your knee across the opponent\'s thigh while controlling their hip.',
     keypoints:['Flatten their hips first','Knee pressure is constant','Head stays tight','Secure hip before advancing'],
     details:{overview:'The knee slice is a fundamental guard pass that works by slicing your knee through their guard while controlling the hip and using weight.',setup:'Control opponent\'s hip and near knee. Slice your knee across their thigh toward the mat. Maintain downward pressure and drive through.',concepts:'The mechanics require you to drop your weight and slide through in one motion. The key is flattening the opponent first.',common_mistakes:'Not flattening first, knee rises instead of slicing, losing hip control during transition.'}},
    {id:'torreando', label:'Torreando Pass', cat:'pass', x:550, y:100,
     desc:'Passing by redirecting the knees and moving laterally to bypass the guard.',
     keypoints:['Two-on-one knee grip','Move knees to one side','Jump around to the other','Never let knees frame on you'],
     details:{overview:'The torreando (bullfighter pass) works by controlling the knees and swinging them to one side while you move to the other. Speed and timing are key.',setup:'Grip both knees or pants. Push them to one side simultaneously. Pivot and step to the opposite side. Secure side control.',concepts:'You exploit the moment their guard is offline. If you move their legs right, you go left. Very fast, low commitment.',common_mistakes:'Moving to the same side as the legs, slow transitions, losing leg control.'}},
    {id:'leg-drag', label:'Leg Drag', cat:'pass', x:670, y:120,
     desc:'Dragging one leg across your body to collapse the guard and pass to the side.',
     keypoints:['Control one ankle + opposite collar','Drag leg across your body','Weight on trapped leg','Flat to side control'],
     details:{overview:'The leg drag neutralizes the guard by pulling one leg across the body and driving your weight through it.',setup:'Grip one ankle with both hands (or ankle+collar). Pull the leg across your body and step over it. Drive your weight to side control.',concepts:'Once the leg is dragged across, the guard is structurally broken. Move before they recover.',common_mistakes:'Letting go of the ankle, not driving weight through the dragged leg, going too slow.'}},
    {id:'scissor-sweep', label:'Scissor Sweep', cat:'sweep', x:300, y:500,
     desc:'Fundamental sweep using a scissoring motion of the legs to topple the opponent.',
     keypoints:['Break posture forward first','Hip out to create angle','Top leg blocks chest','Bottom leg sweeps knee'],
     details:{overview:'The scissor sweep is one of the first sweeps learned in BJJ. It uses two simultaneous leg movements to knock the opponent over.',setup:'From closed guard, break posture. Hip out and open guard. Place top leg across chest, bottom leg hooks behind knee. Simultaneously push and pull.',concepts:'Top leg blocks forward movement, bottom leg removes the support. Both move at once. The name comes from the scissoring of the legs.',common_mistakes:'Not breaking posture first, not hipping out, not moving both legs at the same time.'}},
    {id:'butterfly-sweep', label:'Butterfly Sweep', cat:'sweep', x:480, y:400,
     desc:'Using butterfly hooks to elevate and tip the opponent to the side.',
     keypoints:['Underhook on sweep side','Load weight to fall side','Elevate with hook as you lean','Come on top in mount or position'],
     details:{overview:'The butterfly sweep uses hooks under the thighs to lift and tip the opponent. It is highly effective when you can load their weight to one side.',setup:'In butterfly guard, get underhook on one side. Lean to that side. Extend that hook to elevate while you post your other arm. Sweep to that direction.',concepts:'You can only sweep the direction you lean. The underhook prevents posting. The hook creates lift. These three combine.',common_mistakes:'No underhook, leaning wrong direction, hook not under thigh.'}},
    {id:'hip-escape', label:'Hip Escape (Shrimp)', cat:'escape', x:170, y:620,
     desc:'Core movement used to recreate space and recover guard from bottom positions.',
     keypoints:['Push to create space','Hip out explosively','Frame with knee and arm','Continue until guard is recovered'],
     details:{overview:'The hip escape or shrimp is the most fundamental BJJ movement. It is the foundation of all bottom escapes and guard recovery.',setup:'From bottom position, turn to your side. Push against opponent\'s hip or thigh. Simultaneously drive your hip away. Bring knee in to frame.',concepts:'You are creating space by moving your hips. The frame prevents them from collapsing back. Chain multiple shrimps to recover.',common_mistakes:'Trying to escape without pushing first, moving arms before hips, not framing after escaping.'}},
    {id:'upa-escape', label:'Upa Bridge Escape', cat:'escape', x:380, y:660,
     desc:'Escaping the mount by bridging explosively and trapping arm and leg to roll the opponent.',
     keypoints:['Trap same-side arm and leg','Bridge to that trapped side','Turn into them as you bridge','Immediately establish guard'],
     details:{overview:'The Upa is the foundational mount escape. It uses a bridge to create momentum and a trap to prevent posting.',setup:'From mount, turn your head to one side. Trap their arm with your arm (hug it) and their foot with your leg. Bridge explosively to that side.',concepts:'The bridge creates the weight shift. The trap prevents them from posting. You must move your whole body simultaneously.',common_mistakes:'Not trapping before bridging, bridging to the wrong side (untrapped side), not following the roll.'}},
    {id:'single-leg', label:'Single Leg Takedown', cat:'takedown', x:700, y:340,
     desc:'Takedown by controlling one leg and driving the opponent to the mat.',
     keypoints:['Level change to enter','Control behind knee','Head outside for finish','Drive through, not down'],
     details:{overview:'The single leg is one of wrestling\'s core takedowns adapted into BJJ. It controls one leg and uses driving force to take the opponent down.',setup:'Level change to reach the leg. Grab behind the knee. Head on outside of their body. Drive forward and through.',concepts:'The finish varies: run the pipe, dump, trip. Key is keeping your head up and driving forward, not backward.',common_mistakes:'Head on inside (danger of guillotine), driving down instead of through, losing grip on the leg.'}},
    {id:'double-leg', label:'Double Leg Takedown', cat:'takedown', x:600, y:400,
     desc:'Shooting in to control both legs and driving the opponent to the mat.',
     keypoints:['Penetration step is deep','Drive shoulder into hip','Level change must be fast','Lift and direct to mat'],
     details:{overview:'The double leg is a powerful wrestling takedown that controls both legs simultaneously.',setup:'Shoot in with deep penetration step. Get shoulder to hip. Control both legs behind knees. Lift, step in, drive or trip to mat.',concepts:'The shot must be fast and deep. Once you have both legs, you have structural control. The finish is a matter of direction.',common_mistakes:'Stopping short, head down, shooting without setup.'}},
    {id:'berimbolo', label:'Berimbolo', cat:'sweep', x:120, y:480,
     desc:'Inverted roll from DLR guard to take the back or sweep.',
     keypoints:['Start from DLR or sit-up guard','Invert under opponent','Reach for their back leg','Take the back or come on top'],
     details:{overview:'The berimbolo is a complex modern sweep/back take that involves inverting under the opponent from DLR or similar guards.',setup:'From DLR, off-balance opponent forward. Invert by rolling over your shoulder. As you invert, reach for their far hip or leg. Come up to back control.',concepts:'The berimbolo works by going under the opponent as they lean forward. You come out behind them. Timing with their weight is critical.',common_mistakes:'Not inverting deep enough, not controlling far hip, opponent posturing away.'}},
    {id:'back-control', label:'Back Control', cat:'guard', x:700, y:260,
     desc:'Dominant position with hooks and seatbelt grip from behind the opponent.',
     keypoints:['Hooks in at hip level','Seatbelt grip (one over, one under)','Keep them on their side','Attack the neck with RNC'],
     details:{overview:'Back control is BJJ\'s most dominant position. Your opponent cannot see you and has limited ability to attack or escape.',setup:'Hook both feet inside their hips. Establish seatbelt: one arm over shoulder, one arm under armpit. Lock your hands. Keep them on their side.',concepts:'You control from behind. Hooks prevent turning. Seatbelt prevents escaping. This is where the RNC lives.',common_mistakes:'Hooks too low (at feet), flat on your back instead of on your side, losing the seatbelt.'}},
    {id:'mount', label:'Mount', cat:'guard', x:560, y:580,
     desc:'Top position straddling the opponent\'s chest with maximum control.',
     keypoints:['Keep weight central and low','Hips sink to mat','Trap arms for submissions','Move with their escapes to maintain'],
     details:{overview:'Mount is a dominant top position where you sit on the opponent\'s chest. From here you can attack with armbars, chokes, and Kimuras.',setup:'Straddle their chest. Keep your weight sinking down. Hips low. Feet hooked behind their legs (high mount) or heels near their hips.',concepts:'The higher your mount, the more dangerous. High mount constrains their arms. Move weight to counter their escapes.',common_mistakes:'Riding too high (easy to escape), feet not hooked, sitting up too tall.'}},
    {id:'lasso-guard', label:'Lasso Guard', cat:'guard', x:680, y:440,
     desc:'Open guard wrapping your leg around the opponent\'s arm for control and sweeps.',
     keypoints:['Wrap leg around sleeve grip','Keep tension in the lasso','Push/pull to create off-balance','Transition to triangle or sweep'],
     details:{overview:'Lasso guard wraps one leg around the opponent\'s arm, giving you strong control over that arm and their posture.',setup:'Grip sleeve. Thread your same-side foot through the arm from inside to outside, wrapping your leg around it. Establish hip elevation.',concepts:'The lasso traps the arm mechanically. Combined with a foot frame on the hip you control their structure entirely.',common_mistakes:'Loose lasso, not maintaining grip on sleeve, not using hip elevation.'}},
  ],
  edges: [
    {from:'closed-guard',  to:'triangle'},     {from:'closed-guard',  to:'armbar'},
    {from:'closed-guard',  to:'kimura'},        {from:'closed-guard',  to:'scissor-sweep'},
    {from:'closed-guard',  to:'omoplata'},
    {from:'half-guard',    to:'butterfly-sweep'},{from:'half-guard',   to:'x-guard'},
    {from:'butterfly-guard',to:'butterfly-sweep'},{from:'butterfly-guard',to:'x-guard'},
    {from:'butterfly-guard',to:'back-control'},
    {from:'spider-guard',  to:'triangle'},      {from:'spider-guard',  to:'omoplata'},
    {from:'spider-guard',  to:'lasso-guard'},
    {from:'de-la-riva',    to:'berimbolo'},     {from:'de-la-riva',    to:'x-guard'},
    {from:'de-la-riva',    to:'leg-drag'},
    {from:'x-guard',       to:'single-leg'},    {from:'x-guard',       to:'double-leg'},
    {from:'lasso-guard',   to:'triangle'},      {from:'lasso-guard',   to:'omoplata'},
    {from:'mount',         to:'armbar'},        {from:'mount',         to:'rear-naked'},
    {from:'back-control',  to:'rear-naked'},
    {from:'triangle',      to:'armbar'},        {from:'triangle',      to:'omoplata'},
    {from:'scissor-sweep', to:'mount'},         {from:'butterfly-sweep',to:'back-control'},
    {from:'berimbolo',     to:'back-control'},  {from:'single-leg',    to:'back-control'},
    {from:'double-leg',    to:'mount'},
    {from:'hip-escape',    to:'half-guard'},    {from:'hip-escape',    to:'de-la-riva'},
    {from:'upa-escape',    to:'closed-guard'},
    {from:'knee-slice',    to:'mount'},         {from:'torreando',     to:'back-control'},
    {from:'leg-drag',      to:'back-control'},  {from:'kimura',        to:'back-control'},
  ]
};

/* ── Referencias al DOM ─────────────────────────────────────────── */
const wrap = document.getElementById('canvas-wrap');
const c    = document.getElementById('c');
const ctx  = c.getContext('2d');
const mc   = document.getElementById('mc');
const mctx = mc.getContext('2d');

/* ── Estado global ──────────────────────────────────────────────── */
let W = 0, H = 0;                          // se asignan en initCanvas()
let camX = 0, camY = 0, scale = 1;
let dragging = false, lastX = 0, lastY = 0;
let hoveredNode  = null;
let activeFilters = new Set(['guard','pass','sweep','submission','escape','takedown']);
let searchTerm   = '';
let animFrame    = 0;
let initialized  = false;

const nodeMap = {};
DB.nodes.forEach(n => nodeMap[n.id] = n);

/* ══════════════════════════════════════════════════════════════════
   initCanvas — mide y calibra el canvas.

   INTEGRACIÓN CON EL DASHBOARD:
   Esta función NO se auto-llama al cargar la página porque en ese
   momento #section-encyclopedia tiene la clase .hidden (display:none)
   y wrap.clientWidth / clientHeight devuelven 0.

   Es llamada desde showSection('encyclopedia') en profesor-dashboard.js
   DESPUÉS de remover .hidden, con requestAnimationFrame para garantizar
   que el browser ya pintó el layout y las medidas son reales.

   También la dispara el ResizeObserver cuando el panel cambia de tamaño.
   ══════════════════════════════════════════════════════════════════ */
function initCanvas() {
  const newW = wrap.clientWidth;
  const newH = wrap.clientHeight;

  // Sección aún oculta o panel sin dimensiones — salir sin hacer nada.
  // showSection volverá a llamar con rAF cuando sea visible.
  if (newW === 0 || newH === 0) return;

  // Solo re-escalar si las dimensiones cambiaron (evita jitter innecesario)
  if (newW === W && newH === H && initialized) return;

  W = newW;
  H = newH;

  const dpr = window.devicePixelRatio || 1;

  c.width  = W * dpr;
  c.height = H * dpr;
  c.style.width  = W + 'px';
  c.style.height = H + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  mc.width  = 120 * dpr;
  mc.height = 80  * dpr;
  mc.style.width  = '120px';
  mc.style.height = '80px';
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.scale(dpr, dpr);

  if (!initialized) {
    initialized = true;
    bindEvents();
    draw();
  }
}

/* ResizeObserver — re-calibra el canvas cuando el panel cambia de tamaño
   (sidebar toggle, redimensión de ventana, etc.)                         */
const ro = new ResizeObserver(() => {
  // Solo actuar si la sección es visible en este momento
  const section = document.getElementById('section-encyclopedia');
  if (section && !section.classList.contains('hidden')) {
    initCanvas();
  }
});
ro.observe(wrap);

/* NO hay requestAnimationFrame(initCanvas) aquí.
   El arranque lo controla showSection() en profesor-dashboard.js */

/* ── Coordenadas ────────────────────────────────────────────────── */
function worldToScreen(x, y) {
  return [(x + camX) * scale + W / 2, (y + camY) * scale + H / 2];
}
function screenToWorld(sx, sy) {
  return [(sx - W / 2) / scale - camX, (sy - H / 2) / scale - camY];
}

/* ── Filtros y búsqueda ─────────────────────────────────────────── */
function isVisible(n) {
  if (!activeFilters.has(n.cat)) return false;
  if (searchTerm &&
      !n.label.toLowerCase().includes(searchTerm) &&
      !n.desc.toLowerCase().includes(searchTerm)) return false;
  return true;
}

function toggleFilter(cat, btn) {
  if (activeFilters.has(cat)) {
    if (activeFilters.size > 1) { activeFilters.delete(cat); btn.classList.remove('active'); }
  } else {
    activeFilters.add(cat); btn.classList.add('active');
  }
}

function handleSearch(val) {
  searchTerm = val.toLowerCase().trim();
}

/* ── Zoom & reset ───────────────────────────────────────────────── */
function zoom(f) {
  const cx = W / 2, cy = H / 2;
  const [wx, wy] = screenToWorld(cx, cy);
  scale = Math.min(3, Math.max(0.2, scale * f));
  camX = cx / scale - wx;
  camY = cy / scale - wy;
}
function resetView() { scale = 1; camX = 0; camY = 0; }

/* ── Draw ───────────────────────────────────────────────────────── */
function draw() {
  ctx.clearRect(0, 0, W, H);

  /* Edges */
  DB.edges.forEach(e => {
    const a = nodeMap[e.from], b = nodeMap[e.to];
    if (!a || !b) return;
    const visA = isVisible(a), visB = isVisible(b);
    if (!visA && !visB) return;

    const [ax, ay] = worldToScreen(a.x, a.y);
    const [bx, by] = worldToScreen(b.x, b.y);
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const dx = bx - ax, dy = by - ay;
    const cx2 = mx - dy * 0.15, cy2 = my + dx * 0.15;

    ctx.save();
    ctx.globalAlpha = visA && visB ? 0.18 : 0.05;
    ctx.strokeStyle = '#888';
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(cx2, cy2, bx, by);
    ctx.stroke();
    ctx.restore();

    if (visA && visB) {
      const t = 0.85;
      const qx = (1-t)*(1-t)*ax + 2*(1-t)*t*cx2 + t*t*bx;
      const qy = (1-t)*(1-t)*ay + 2*(1-t)*t*cy2 + t*t*by;
      const ang = Math.atan2(by - qy, bx - qx);
      const r = 7 * scale;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = CAT_COLOR[b.cat] || '#888';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx - r * Math.cos(ang - 0.4), by - r * Math.sin(ang - 0.4));
      ctx.lineTo(bx, by);
      ctx.lineTo(bx - r * Math.cos(ang + 0.4), by - r * Math.sin(ang + 0.4));
      ctx.stroke();
      ctx.restore();
    }
  });

  /* Nodes */
  const t = Date.now() / 1000;
  DB.nodes.forEach(n => {
    const [sx, sy] = worldToScreen(n.x, n.y);
    if (sx < -80 || sx > W + 80 || sy < -60 || sy > H + 60) return;

    const vis    = isVisible(n);
    const col    = CAT_COLOR[n.cat] || '#888';
    const isHov  = hoveredNode === n.id;
    const r      = n.root ? 28 : 22;
    const scaledR = r * Math.max(0.4, scale);

    ctx.save();
    ctx.globalAlpha = vis ? 1 : 0.08;

    if (isHov && vis) { ctx.shadowColor = col; ctx.shadowBlur = 18; }

    if (n.root && vis) {
      const pulse = 1 + 0.08 * Math.sin(t * 2);
      ctx.beginPath();
      ctx.arc(sx, sy, scaledR * pulse * 1.4, 0, Math.PI * 2);
      ctx.strokeStyle  = col;
      ctx.globalAlpha  = 0.12 + 0.08 * Math.sin(t * 2);
      ctx.lineWidth    = 1.5;
      ctx.stroke();
      ctx.globalAlpha  = vis ? 1 : 0.08;
    }

    ctx.beginPath();
    ctx.arc(sx, sy, scaledR, 0, Math.PI * 2);
    ctx.fillStyle   = '#0f0f0f';
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth   = isHov ? 2.5 : 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(sx, sy, scaledR * 0.25, 0, Math.PI * 2);
    ctx.fillStyle   = col;
    ctx.globalAlpha = vis ? (isHov ? 0.9 : 0.5) : 0.05;
    ctx.fill();

    ctx.restore();

    if (vis && scale > 0.45) {
      ctx.save();
      ctx.globalAlpha  = isHov ? 1 : 0.7;
      ctx.fillStyle    = isHov ? col : '#aaa';
      ctx.font         = `${Math.min(11, 9 * scale)}px 'Courier New',monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.label, sx, sy + scaledR + 11);
      ctx.restore();
    }
  });

  /* Minimap */
  mctx.clearRect(0, 0, 120, 80);
  mctx.fillStyle = '#0a0a0a';
  mctx.fillRect(0, 0, 120, 80);
  const minScale = 0.08, offX = 60, offY = 40;
  DB.nodes.forEach(n => {
    const mx = n.x * minScale + offX, my = n.y * minScale + offY;
    mctx.beginPath();
    mctx.arc(mx, my, 2.5, 0, Math.PI * 2);
    mctx.fillStyle = isVisible(n) ? (CAT_COLOR[n.cat] || '#888') : '#222';
    mctx.fill();
  });
  const [tlx, tly] = screenToWorld(0, 0);
  const [brx, bry] = screenToWorld(W, H);
  mctx.strokeStyle = '#444';
  mctx.lineWidth   = 0.5;
  mctx.strokeRect(
    tlx * minScale + offX, tly * minScale + offY,
    (brx - tlx) * minScale, (bry - tly) * minScale
  );

  /* No-results */
  const nr = document.getElementById('no-results');
  nr.style.display = DB.nodes.filter(n => isVisible(n)).length === 0 ? 'block' : 'none';

  requestAnimationFrame(draw);
}

/* ══════════════════════════════════════════════════════════════════
   FIX 3 — bindEvents
   Se llama UNA SOLA VEZ desde initCanvas para evitar listeners
   duplicados si el ResizeObserver dispara initCanvas varias veces.
   getBoundingClientRect() garantiza coordenadas correctas aunque
   el dashboard empuje el canvas lateralmente.
   ══════════════════════════════════════════════════════════════════ */
function bindEvents() {

  /* Drag */
  wrap.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    wrap.classList.add('grabbing');
  });

  window.addEventListener('mousemove', e => {
    /* FIX: getBoundingClientRect relativo al wrap, no al document */
    const rect = wrap.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (dragging) {
      camX += (e.clientX - lastX) / scale;
      camY += (e.clientY - lastY) / scale;
      lastX = e.clientX; lastY = e.clientY;
      hoveredNode = null;
    } else {
      const [wx, wy] = screenToWorld(sx, sy);
      let found = null;
      DB.nodes.forEach(n => {
        const dx = n.x - wx, dy = n.y - wy;
        const r  = n.root ? 28 : 22;
        if (dx*dx + dy*dy < r*r*1.5 && isVisible(n)) found = n.id;
      });
      if (found !== hoveredNode) {
        hoveredNode = found;
        const tt = document.getElementById('tooltip');
        if (found) {
          const nd = nodeMap[found];
          const [tsx, tsy] = worldToScreen(nd.x, nd.y);
          tt.textContent  = nd.desc;
          tt.style.left   = Math.min(tsx + 30, W - 190) + 'px';
          tt.style.top    = Math.max(tsy - 20, 0) + 'px';
          tt.style.opacity = '1';
        } else {
          tt.style.opacity = '0';
        }
      }
    }
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
    wrap.classList.remove('grabbing');
  });

  /* Wheel zoom */
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = wrap.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [wx, wy] = screenToWorld(sx, sy);
    scale = Math.min(3, Math.max(0.2, scale * (e.deltaY < 0 ? 1.1 : 0.9)));
    const [nsx, nsy] = worldToScreen(wx, wy);
    camX += (sx - nsx) / scale;
    camY += (sy - nsy) / scale;
  }, { passive: false });

  /* Click → abrir flashcard */
  wrap.addEventListener('click', e => {
    if (dragging) return;
    const rect = wrap.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [wx, wy] = screenToWorld(sx, sy);
    DB.nodes.forEach(n => {
      const dx = n.x - wx, dy = n.y - wy;
      const r  = n.root ? 28 : 22;
      if (dx*dx + dy*dy < r*r*1.5 && isVisible(n)) openFC(n.id);
    });
  });

  /* Teclado */
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeFC(); });

  /* Touch básico (tablet) */
  let lastDist = 0;
  wrap.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      dragging = true;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      lastDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: true });

  wrap.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && dragging) {
      camX += (e.touches[0].clientX - lastX) / scale;
      camY += (e.touches[0].clientY - lastY) / scale;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (lastDist > 0) zoom(dist / lastDist);
      lastDist = dist;
    }
  }, { passive: false });

  wrap.addEventListener('touchend', () => { dragging = false; lastDist = 0; });
}

/* ── Flashcard ──────────────────────────────────────────────────── */
function openFC(id) {
  const n = nodeMap[id];
  if (!n) return;
  const col = CAT_COLOR[n.cat] || '#888';

  document.getElementById('fc-tag').textContent      = n.cat.toUpperCase();
  document.getElementById('fc-tag').style.color      = col;
  document.getElementById('fc-title').textContent    = n.label;
  document.getElementById('fc-subtitle').textContent = n.desc;

  const outgoing = DB.edges.filter(e => e.from === id).map(e => nodeMap[e.to]).filter(Boolean);
  const incoming = DB.edges.filter(e => e.to   === id).map(e => nodeMap[e.from]).filter(Boolean);

  const sections = ['overview','setup','concepts','mistakes','key-points','connections'];
  const labels   = {overview:'Overview',setup:'Setup',concepts:'Concepts',
                    mistakes:'Common Mistakes','key-points':'Key Points',connections:'Connections'};

  const toc = document.getElementById('fc-toc');
  toc.innerHTML = '';
  sections.forEach((s, i) => {
    const a = document.createElement('a');
    a.className      = 'toc-item' + (i === 0 ? ' active' : '');
    a.href           = '#';
    a.style.color    = i === 0 ? col : '';
    a.textContent    = labels[s];
    a.dataset.sec    = s;
    a.onclick = ev => {
      ev.preventDefault();
      document.getElementById('fcs-' + s).scrollIntoView({ behavior:'smooth', block:'start' });
    };
    toc.appendChild(a);
  });

  const d = n.details || {};
  const content = document.getElementById('fc-content');
  content.innerHTML = `
    <div class="fc-section" id="fcs-overview">
      <h3 style="color:${col}">Overview</h3>
      <p>${d.overview || n.desc}</p>
    </div>
    <div class="fc-section" id="fcs-setup">
      <h3 style="color:${col}">Setup</h3>
      <p>${d.setup || 'Entry details not available.'}</p>
    </div>
    <div class="fc-section" id="fcs-concepts">
      <h3 style="color:${col}">Core Concepts</h3>
      <p>${d.concepts || '—'}</p>
    </div>
    <div class="fc-section" id="fcs-mistakes">
      <h3 style="color:${col}">Common Mistakes</h3>
      <p>${d.common_mistakes || '—'}</p>
    </div>
    <div class="fc-section" id="fcs-key-points">
      <h3 style="color:${col}">Key Points</h3>
      <ul class="key-points">${(n.keypoints||[]).map(k=>`<li>${k}</li>`).join('')}</ul>
    </div>
    <div class="fc-section" id="fcs-connections">
      <h3 style="color:${col}">Connections</h3>
      ${outgoing.length
        ? `<p style="font-size:11px;color:#555;margin-bottom:6px">Leads to:</p>
           <div class="connections">${outgoing.map(t =>
             `<span class="conn-chip"
               style="border-color:${CAT_COLOR[t.cat]}33;color:${CAT_COLOR[t.cat]};background:${CAT_COLOR[t.cat]}11"
               onclick="closeFC();openFC('${t.id}')">${t.label}</span>`
           ).join('')}</div>` : ''}
      ${incoming.length
        ? `<p style="font-size:11px;color:#555;margin:10px 0 6px">Reachable from:</p>
           <div class="connections">${incoming.map(f =>
             `<span class="conn-chip"
               style="border-color:${CAT_COLOR[f.cat]}33;color:${CAT_COLOR[f.cat]};background:${CAT_COLOR[f.cat]}11"
               onclick="closeFC();openFC('${f.id}')">${f.label}</span>`
           ).join('')}</div>` : ''}
      ${!outgoing.length && !incoming.length
        ? '<p style="color:#444;font-size:12px">No connections mapped.</p>' : ''}
    </div>`;

  /* TOC scroll spy */
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const sid = entry.target.id.replace('fcs-', '');
        toc.querySelectorAll('.toc-item').forEach(a => {
          const active = a.dataset.sec === sid;
          a.classList.toggle('active', active);
          a.style.color = active ? col : '';
        });
      }
    });
  }, { root: content, threshold: 0.5 });

  sections.forEach(s => {
    const el = document.getElementById('fcs-' + s);
    if (el) observer.observe(el);
  });

  document.getElementById('flashcard').classList.add('open');
  content.scrollTop = 0;
}

function closeFC() {
  document.getElementById('flashcard').classList.remove('open');
}

/* ── Auto-arranque ──────────────────────────────────────────────────────
   Standalone (encyclopedia.html): wrap visible → initCanvas dibuja el grafo.
   Dashboards (profesor/student): la sección está oculta (0×0) → initCanvas
   retorna sin efecto y showSection() sigue controlando el arranque.      */
(function autoInit() {
  const arrancar = () => requestAnimationFrame(() => initCanvas());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
  window.addEventListener('load', arrancar);
  setTimeout(arrancar, 400);
})();