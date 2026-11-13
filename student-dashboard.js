const studentUser = JSON.parse(localStorage.getItem('lutaedanca_user'));
const currentUser = studentUser;
const initialSection = window.location.hash?.replace('#', '') ||
                       new URLSearchParams(window.location.search).get('section') ||
                       'inicio';

if (!studentUser) {
  window.location.href = 'login.html';
}

const rankProgress = {
  'faixa branca': 28,
  'faixa azul': 52,
  'faixa roxa': 74,
  'faixa marro': 86,
  'faixa preta': 96
};

const progressValue = rankProgress[studentUser?.rango?.toLowerCase()] || 40;
const displayName = studentUser?.nombre || 'Estudiante';
const rankLabel = studentUser?.rango || 'Sin rango';
const paymentLabel = studentUser?.metodo_pago ? studentUser.metodo_pago.charAt(0).toUpperCase() + studentUser.metodo_pago.slice(1) : 'Tarjeta';

const studentName = document.getElementById('student-name');
const studentMeta = document.getElementById('student-meta');
const dashboardTitle = document.getElementById('dashboard-title');
const studentRank = document.getElementById('student-rank');
const heroRankBadge = document.getElementById('hero-rank-badge');
const progressPercent = document.getElementById('progress-percent');
const progressBar = document.getElementById('progress-bar');
const paymentMethod = document.getElementById('payment-method');
const accountStatus = document.getElementById('account-status');
const lastSession = document.getElementById('last-session');
const logoutBtn = document.getElementById('logout-btn');
const forumMessage = document.getElementById('forum-message');
const forumImageInput = document.getElementById('forum-image-input');
const forumImagePreviewWrap = document.getElementById('forum-image-preview-wrap');
const forumImagePreview = document.getElementById('forum-image-preview');
const forumImageRemoveBtn = document.getElementById('forum-image-remove-btn');
const publishForumBtn = document.getElementById('publish-forum-btn');
const forumPostList = document.getElementById('forum-post-list');
const forumFilterChips = document.getElementById('forum-filter-chips');
const notificationToggle = document.getElementById('notification-toggle');
const notificationPanel = document.getElementById('notification-panel');
const notificationList = document.getElementById('notification-list');
const notificationBadge = document.getElementById('notification-badge');
const markAllReadBtn = document.getElementById('mark-all-read-btn');
const novedadesList = document.getElementById('novedades-list');
const studentVideoTitle = document.getElementById('student-video-title');
const studentVideoDescription = document.getElementById('student-video-description');
const studentVideoHashtags = document.getElementById('student-video-hashtags');
const studentVideoFile = document.getElementById('student-video-file');
const studentVideoUploadBtn = document.getElementById('student-video-upload-btn');
const studentVideoUploadFeedback = document.getElementById('student-video-upload-feedback');
const studentVideoList = document.getElementById('student-video-list');

const perfilNombre = document.getElementById('perfil-nombre');
const perfilEmail = document.getElementById('perfil-email');
const perfilPasswordActual = document.getElementById('perfil-password-actual');
const perfilPasswordNueva = document.getElementById('perfil-password-nueva');
const perfilMetodoPago = document.getElementById('perfil-metodo-pago');
const perfilSaveBtn = document.getElementById('perfil-save-btn');
const perfilUpgradeBtn = document.getElementById('perfil-upgrade-btn');
const perfilFeedback = document.getElementById('perfil-feedback');
const perfilInfoNombre = document.getElementById('perfil-info-nombre');
const perfilInfoEmail = document.getElementById('perfil-info-email');
const perfilInfoRol = document.getElementById('perfil-info-rol');
const perfilInfoEstado = document.getElementById('perfil-info-estado');
const perfilInfoDesde = document.getElementById('perfil-info-desde');

let activeHashtag = '';

if (studentName) studentName.textContent = displayName;
if (studentMeta) studentMeta.textContent = `${rankLabel} • ${paymentLabel}`;
if (dashboardTitle) dashboardTitle.textContent = `Hola, ${displayName.split(' ')[0]}`;
if (studentRank) studentRank.textContent = rankLabel;
if (heroRankBadge) heroRankBadge.textContent = rankLabel;
if (progressPercent) progressPercent.textContent = `${progressValue}%`;
if (progressBar) progressBar.style.width = `${progressValue}%`;
if (paymentMethod) paymentMethod.textContent = paymentLabel;
if (accountStatus) accountStatus.textContent = studentUser?.estado === 'pendiente' ? 'Pendiente' : 'Activo';
if (lastSession) lastSession.textContent = 'Hoy';

/* ══════════════════════════════════════════════
   NAVEGACIÓN
══════════════════════════════════════════════ */
const SECTIONS = ['inicio','instruccionales','diagramas-interactivos','encyclopedia','puzzles','novedades','editar-perfil'];
function initNav() {
  document.querySelectorAll('.nav-item[data-section]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      showSection(link.dataset.section);
    });
  });
  document.querySelectorAll('.quick-action-btn[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.goto));
  });
}

function showSection(name) {
  if (!SECTIONS.includes(name)) name = 'inicio';
  SECTIONS.forEach(s => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.classList.toggle('hidden', s !== name);
  });
  document.querySelectorAll('.nav-item[data-section]').forEach(link => {
    link.classList.toggle('active', link.dataset.section === name);
  });
  window.history.replaceState(null, '', `#${name}`);

  if (name === 'novedades')      loadNovedades();
  if (name === 'instruccionales') loadInstruccionales();
  if (name === 'diagramas-interactivos') loadDiagramasInteractivos();
  if (name === 'encyclopedia') {
    requestAnimationFrame(() => {
      if (typeof initCanvas === 'function') initCanvas();
    });
  }
}

/* ══════════════════════════════════════════════
   INICIO — miniaturas de contenido reciente
══════════════════════════════════════════════ */
async function loadInicio() {
  const grid  = document.getElementById('recientes-grid');
  const count = document.getElementById('recientes-count');
  if (!grid) return;

  try {
    const res  = await fetch('/api/public/recientes?limit=12');
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);

    const videos         = (data.videos         || []).map(v => ({ ...v, _type: 'Video',         _icon: '🎬' }));
    const imagenes       = (data.imagenes        || []).map(i => ({ ...i, _type: 'Imagen',        _icon: '🖼️' }));
    const instruccionales = (data.instruccionales || []).map(i => ({ ...i, _type: 'Instruccional', _icon: '📚' }));

    const items = [...videos, ...imagenes, ...instruccionales]
      .sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en))
      .slice(0, 12);

    if (count) count.textContent = `${items.length} elemento${items.length !== 1 ? 's' : ''}`;

    if (!items.length) {
      grid.innerHTML = '<p class="empty-state-msg" style="padding:16px">Aún no hay contenido publicado.</p>';
      return;
    }

    grid.innerHTML = items.map(item => {
      const tag       = escapeHtml(item._type);
      const icon      = item._icon;
      const title     = escapeHtml(item.titulo);
      const profe     = escapeHtml(item.profesor_nombre || '');
      const meta      = item._type === 'Video'
        ? escapeHtml(`${item.categoria || ''} · ${item.dificultad || ''}`)
        : item._type === 'Imagen'
          ? escapeHtml(item.tipo || '')
          : escapeHtml(`${item.nivel || ''} · ${item.categoria || ''}`);
      const tags      = (item.hashtags || []).slice(0, 3).map(t => `<span class="media-tag">#${escapeHtml(t)}</span>`).join('');
      const hasVideo  = item._type === 'Video' && item.url;
      const hasImg    = item._type === 'Imagen' && item.url;

      return `
        <article class="reciente-card" data-id="${item.id}" data-type="${item._type}">
          <div class="reciente-thumb">
            ${hasImg
              ? `<img src="${escapeHtml(item.url)}" alt="${title}" loading="lazy" class="reciente-img" />`
              : `<div class="reciente-placeholder">${icon}</div>`}
            <span class="reciente-badge">${tag}</span>
          </div>
          <div class="reciente-body">
            <p class="reciente-profesor">${profe}</p>
            <h4 class="reciente-title">${title}</h4>
            <p class="reciente-meta">${meta}</p>
            <div class="reciente-tags">${tags}</div>
            ${hasVideo
              ? `<button class="ghost-btn small-btn" style="margin-top:8px"
                         onclick="openVideoDetail(${item.id})">▶ Ver video</button>`
              : ''}
          </div>
        </article>`;
    }).join('');

  } catch (err) {
    if (grid) grid.innerHTML = `<p class="empty-state-msg" style="padding:16px">No se pudo cargar el contenido. ${escapeHtml(err.message)}</p>`;
  }
}

/* ══════════════════════════════════════════════
   NOVEDADES — búsqueda y filtro por hashtag
══════════════════════════════════════════════ */
let _novedadesAllItems = [];   // cache de todos los ítems cargados
let _novedadesSearch   = '';   // texto de búsqueda actual
let _novedadesType     = '';   // tipo activo: '' | 'Video' | 'Imagen' | 'Instruccional'

async function loadNovedades() {
  if (!novedadesList) return;
  novedadesList.innerHTML = '<p class="empty-state-msg">Cargando novedades…</p>';

  try {
    const res  = await fetch('/api/public/recientes?limit=50');
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);

    const videos = (data.videos || []).map(v => ({
      id: v.id, type: 'Video', icon: '🎬',
      title: v.titulo,
      meta: `${v.categoria || 'Sin categoría'} · ${v.dificultad || 'Sin nivel'}`,
      date: v.creado_en,
      hashtags: v.hashtags || [],
      profesor_nombre: v.profesor_nombre || '',
      profesor_id: v.profesor_id,
      url: v.url || '',
    }));
    const imagenes = (data.imagenes || []).map(i => ({
      id: i.id, type: 'Imagen', icon: '🖼️',
      title: i.titulo,
      meta: i.tipo || 'Sin tipo',
      date: i.creado_en,
      hashtags: i.hashtags || [],
      profesor_nombre: i.profesor_nombre || '',
      profesor_id: i.profesor_id,
      url: i.url || '',
    }));
    const insts = (data.instruccionales || []).map(i => ({
      id: i.id, type: 'Instruccional', icon: '📚',
      title: i.titulo,
      meta: `${i.nivel || ''} · ${i.categoria || ''}`,
      date: i.creado_en,
      hashtags: [],
      profesor_nombre: i.profesor_nombre || '',
      profesor_id: i.profesor_id,
      url: '',
    }));

    _novedadesAllItems = [...videos, ...imagenes, ...insts]
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    buildHashtagChips(_novedadesAllItems);
    applyNovedadesFilters();

  } catch (error) {
    novedadesList.innerHTML = `<p class="error-state">No se pudieron cargar novedades. ${escapeHtml(error.message)}</p>`;
  }
}

function buildHashtagChips(items) {
  const chipsWrap = document.getElementById('novedades-hashtag-chips');
  if (!chipsWrap) return;

  const all = [...new Set(items.flatMap(i => i.hashtags).map(t => t.toLowerCase()))];
  if (!all.length) { chipsWrap.innerHTML = ''; return; }

  chipsWrap.innerHTML =
    `<button class="forum-filter-chip active" data-hashtag="">Todos</button>` +
    all.slice(0, 20).map(t =>
      `<button class="forum-filter-chip" data-hashtag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`
    ).join('');

  chipsWrap.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      chipsWrap.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _novedadesSearch = btn.dataset.hashtag ? `#${btn.dataset.hashtag}` : '';
      const searchInput = document.getElementById('novedades-search');
      if (searchInput) searchInput.value = _novedadesSearch;
      applyNovedadesFilters();
    });
  });
}

function handleNovedadesSearch(val) {
  _novedadesSearch = val.toLowerCase().trim();
  // Si el texto no empieza con # desmarcar chips de hashtag
  const chipsWrap = document.getElementById('novedades-hashtag-chips');
  if (chipsWrap && !_novedadesSearch.startsWith('#')) {
    chipsWrap.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    chipsWrap.querySelector('[data-hashtag=""]')?.classList.add('active');
  }
  applyNovedadesFilters();
}

function applyNovedadesFilters() {
  const term = _novedadesSearch.replace(/^#/, '').toLowerCase();

  const filtered = _novedadesAllItems.filter(item => {
    if (_novedadesType && item.type !== _novedadesType) return false;
    if (!term) return true;
    const inTitle  = item.title.toLowerCase().includes(term);
    const inMeta   = item.meta.toLowerCase().includes(term);
    const inProfe  = item.profesor_nombre.toLowerCase().includes(term);
    const inTags   = item.hashtags.some(t => t.toLowerCase().includes(term));
    return inTitle || inMeta || inProfe || inTags;
  });

  const countEl = document.getElementById('novedades-count');
  if (countEl) countEl.textContent = `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}`;

  renderNovedades(filtered);
}

// Filtros por tipo (botones Todo / Videos / Imágenes / Instruccionales)
document.addEventListener('DOMContentLoaded', () => {
  const typeFilters = document.getElementById('novedades-type-filters');
  if (typeFilters) {
    typeFilters.addEventListener('click', e => {
      const btn = e.target.closest('button[data-type]');
      if (!btn) return;
      typeFilters.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _novedadesType = btn.dataset.type;
      applyNovedadesFilters();
    });
  }
});

function renderNovedades(items) {
  if (!novedadesList) return;
  if (!items.length) {
    novedadesList.innerHTML = '<p class="empty-state-msg">No hay resultados para esta búsqueda.</p>';
    return;
  }

  novedadesList.innerHTML = items.slice(0, 30).map(item => {
    const tags = item.hashtags.map(t =>
      `<button class="media-tag" style="cursor:pointer;border:none;background:none;padding:0"
               onclick="handleNovedadesSearch('#${escapeHtml(t)}')">#${escapeHtml(t)}</button>`
    ).join(' ');

    return `
      <article class="novedad-card" data-id="${item.id}" data-type="${item.type}">
        <div class="novedad-icon">${item.icon}</div>
        <div class="novedad-content">
          <p class="novedad-type">${item.type}</p>
          <h3 class="novedad-title">${escapeHtml(item.title)}</h3>
          ${item.profesor_nombre ? `<p class="novedad-subtitle">Por ${escapeHtml(item.profesor_nombre)}</p>` : ''}
          <p class="novedad-meta">${escapeHtml(item.meta)}</p>
          ${tags ? `<div class="novedad-tags" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${tags}</div>` : ''}
          <p class="novedad-date">${formatRelativeTime(item.date)}</p>
          <div class="novedad-actions">
            ${item.type === 'Video'
              ? `<button class="ghost-btn small-btn" data-action="view-video" data-id="${item.id}">▶ Ver video</button>`
              : ''}
            ${item.profesor_id
              ? `<button class="ghost-btn small-btn" data-action="view-profile" data-id="${item.profesor_id}">Ver perfil</button>`
              : ''}
          </div>
        </div>
      </article>`;
  }).join('');
}

function escapeHtml(value) {
  if (!value) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setPerfilFeedback(message, isSuccess = false) {
  if (!perfilFeedback) return;
  perfilFeedback.textContent = message;
  perfilFeedback.classList.toggle('hidden', !message);
  perfilFeedback.classList.toggle('success', isSuccess);
  perfilFeedback.classList.toggle('error', !isSuccess);
}

async function loadProfileData() {
  if (!currentUser) return;
  let profile = { ...currentUser };

  try {
    const response = await fetch(`/api/users/${currentUser.id}?viewer_id=${currentUser.id}`);
    const data = await response.json();
    if (response.ok && data.profile) {
      profile = data.profile;
    }
  } catch (err) {
    // Fall back to local storage if la API no responde.
  }

  if (perfilNombre) perfilNombre.value = profile.nombre || '';
  if (perfilEmail) perfilEmail.value = profile.email || '';
  if (perfilMetodoPago) perfilMetodoPago.value = profile.metodo_pago || 'tarjeta';

  if (perfilInfoNombre) perfilInfoNombre.textContent = profile.nombre || '—';
  if (perfilInfoEmail) perfilInfoEmail.textContent = profile.email || '—';
  if (perfilInfoRol) perfilInfoRol.textContent = profile.rol || '—';
  if (perfilInfoEstado) perfilInfoEstado.textContent = profile.estado === 'pendiente' ? 'Pendiente' : profile.estado === 'activo' ? 'Activo' : (profile.estado || '—');
  if (perfilInfoDesde) perfilInfoDesde.textContent = profile.created_at ? new Date(profile.created_at).toLocaleDateString('es-ES') : (profile.creado_en ? new Date(profile.creado_en).toLocaleDateString('es-ES') : '—');

  if (perfilUpgradeBtn) perfilUpgradeBtn.classList.toggle('hidden', profile.rol === 'profesor');
  if (perfilFeedback) perfilFeedback.classList.add('hidden');
}

async function saveProfileChanges() {
  if (!currentUser) return;
  const currentPassword = perfilPasswordActual?.value?.trim();
  if (!currentPassword) {
    setPerfilFeedback('Debes ingresar tu contraseña actual para guardar.', false);
    return;
  }

  const payload = {
    user_id: currentUser.id,
    current_password: currentPassword,
    nombre: perfilNombre?.value?.trim() || '',
    email: perfilEmail?.value?.trim() || '',
    metodo_pago: perfilMetodoPago?.value || 'tarjeta',
  };

  const newPassword = perfilPasswordNueva?.value?.trim();
  if (newPassword) {
    payload.new_password = newPassword;
  }

  perfilSaveBtn.disabled = true;
  try {
    const response = await fetch(`/api/users/${currentUser.id}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'No se pudo guardar el perfil.');
    }

    if (data.user) {
      Object.assign(studentUser, data.user);
      localStorage.setItem('lutaedanca_user', JSON.stringify(studentUser));
    }

    setPerfilFeedback('Perfil actualizado correctamente.', true);
    if (perfilPasswordActual) perfilPasswordActual.value = '';
    if (perfilPasswordNueva) perfilPasswordNueva.value = '';
    await loadProfileData();
  } catch (err) {
    setPerfilFeedback(err.message || 'Error al guardar el perfil.', false);
  } finally {
    perfilSaveBtn.disabled = false;
  }
}

async function requestProfesorUpgrade() {
  if (!currentUser) return;
  if (currentUser.rol === 'profesor') {
    setPerfilFeedback('Ya eres profesor.', true);
    return;
  }

  const currentPassword = perfilPasswordActual?.value?.trim();
  if (!currentPassword) {
    setPerfilFeedback('Debes ingresar tu contraseña actual para solicitar la mejora.', false);
    return;
  }

  const payload = {
    user_id: currentUser.id,
    current_password: currentPassword,
    rol: 'profesor',
    estado: 'pendiente',
    metodo_pago: perfilMetodoPago?.value || 'tarjeta',
  };

  const newPassword = perfilPasswordNueva?.value?.trim();
  if (newPassword) {
    payload.new_password = newPassword;
  }

  perfilUpgradeBtn.disabled = true;
  try {
    const response = await fetch(`/api/users/${currentUser.id}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'No se pudo solicitar la mejora.');
    }

    if (data.user) {
      Object.assign(studentUser, data.user);
      localStorage.setItem('lutaedanca_user', JSON.stringify(studentUser));
    }

    setPerfilFeedback('Solicitud enviada. Tu cuenta ahora es profesor en estado pendiente de aprobación.', true);
    if (perfilPasswordActual) perfilPasswordActual.value = '';
    if (perfilPasswordNueva) perfilPasswordNueva.value = '';
    await loadProfileData();
  } catch (err) {
    setPerfilFeedback(err.message || 'Error al solicitar la mejora.', false);
  } finally {
    perfilUpgradeBtn.disabled = false;
  }
}

async function openUserProfile(userId) {
  try {
    const response = await fetch(`/api/users/${userId}?viewer_id=${currentUser?.id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'No se pudo cargar el perfil');

    const profile = data.profile;
    const followLabel = profile.is_following ? 'Dejar de seguir' : 'Seguir';
    const profileCard = `
      <div class="modal-card">
        <h2>${escapeHtml(profile.nombre)}</h2>
        <p>Rol: ${escapeHtml(profile.rol)}</p>
        <p>Rango: ${escapeHtml(profile.rango || 'N/A')}</p>
        <p>Seguidores: ${profile.followers_count}</p>
        <p>Siguiendo: ${profile.following_count}</p>
        <p>Videos: ${profile.video_count}</p>
        <p>Imágenes: ${profile.imagen_count}</p>
        <div class="modal-actions">
          <button class="ghost-btn" id="follow-user-btn" data-user-id="${profile.id}">${followLabel}</button>
          <button class="ghost-btn" id="close-modal-btn">Cerrar</button>
        </div>
      </div>
    `;
    showModal(profileCard);
  } catch (error) {
    alert(error.message || 'Error al cargar el perfil');
  }
}

async function toggleFollowUser(userId) {
  try {
    const response = await fetch(`/api/users/${userId}/follow`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({user_id: currentUser?.id})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'No se pudo seguir al usuario');
    await openUserProfile(userId);
  } catch (error) {
    alert(error.message || 'Error al seguir/deseguir usuario');
  }
}

async function openVideoDetail(videoId) {
  try {
    const [videoResponse, commentsResponse] = await Promise.all([
      fetch(`/api/videos/${videoId}`),
      fetch(`/api/videos/${videoId}/comments`)
    ]);

    const videoData = await videoResponse.json();
    const commentsData = await commentsResponse.json();

    if (!videoResponse.ok) throw new Error(videoData.message || 'No se pudo cargar el video');
    if (!commentsResponse.ok) throw new Error(commentsData.message || 'No se pudieron cargar los comentarios');

    const video = videoData.video;
    const comments = commentsData.comments || [];
    const commentsHtml = comments.map(comment => `
      <div class="comment-item">
        <strong>${escapeHtml(comment.author_name)}</strong>
        <span>${formatRelativeTime(comment.created_at)}</span>
        <p>${escapeHtml(comment.message)}</p>
      </div>
    `).join('');

    const videoContent = `
      <div class="modal-card modal-video-card">
        <h2>${escapeHtml(video.titulo)}</h2>
        <p>Profesor: ${escapeHtml(video.profesor_nombre)}</p>
        <p>Categoría: ${escapeHtml(video.categoria)}</p>
        <p>Dificultad: ${escapeHtml(video.dificultad)}</p>
        <p>${escapeHtml(video.descripcion || '')}</p>
        <video controls src="${video.video_url}" class="novedad-video-preview"></video>
        <h3>Comentarios</h3>
        <div class="video-comments">${commentsHtml || '<p>No hay comentarios aún.</p>'}</div>
        <button class="ghost-btn" id="close-modal-btn">Cerrar</button>
      </div>
    `;
    showModal(videoContent);
  } catch (error) {
    alert(error.message || 'Error al cargar el video');
  }
}

function showModal(html) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto;';
  overlay.innerHTML = `
    <div class="modal-body" style="background:#111;color:#fff;border:1px solid #444;border-radius:16px;max-width:720px;width:100%;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.5);">
      ${html}
    </div>
  `;
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.id === 'close-modal-btn') {
      overlay.remove();
    }
  });
  document.body.appendChild(overlay);
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'justo ahora';

  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return 'justo ahora';
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  return `hace ${diffDays}d`;
}

function sanitizeHandle(name) {
  return `@${(name || 'usuario')
    .trim()
    .replace(/\s+/g, ' ')}`;
}

function renderFilterChips(posts) {
  if (!forumFilterChips) return;

  const hashtags = [...new Set(posts.flatMap((post) => Array.isArray(post.hashtags) ? post.hashtags : []).map((tag) => tag.toLowerCase()))];
  forumFilterChips.innerHTML = '';

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = `forum-filter-chip ${!activeHashtag ? 'active' : ''}`;
  allChip.textContent = 'Todos';
  allChip.dataset.hashtag = '';
  forumFilterChips.appendChild(allChip);

  hashtags.forEach((hashtag) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `forum-filter-chip ${activeHashtag === hashtag ? 'active' : ''}`;
    chip.textContent = `#${hashtag}`;
    chip.dataset.hashtag = hashtag;
    forumFilterChips.appendChild(chip);
  });
}

function renderForumPosts(posts) {
  if (!forumPostList) return;

  forumPostList.innerHTML = '';

  renderFilterChips(posts);

  if (!posts.length) {
    const emptyState = document.createElement('div');
    emptyState.className = 'forum-empty-state';
    emptyState.textContent = 'Aún no hay publicaciones. Sé el primero en compartir una duda.';
    forumPostList.appendChild(emptyState);
    return;
  }

  posts.forEach((post) => {
    const article = document.createElement('article');
    article.className = 'forum-post';
    article.dataset.postId = post.id;

    const meta = document.createElement('div');
    meta.className = 'forum-post-meta';

    const author = document.createElement('span');
    author.className = 'forum-author';
    author.textContent = sanitizeHandle(post.author_name);

    const time = document.createElement('span');
    time.className = 'forum-time';
    time.textContent = formatRelativeTime(post.created_at);

    meta.append(author, time);

    const title = document.createElement('h4');
    title.textContent = post.message.split('\n')[0].slice(0, 120) || 'Publicación del foro';

    const content = document.createElement('p');
    content.textContent = post.message;

    if (post.image_url) {
      const image = document.createElement('img');
      image.className = 'forum-post-image';
      image.src = post.image_url;
      image.alt = 'Imagen adjunta';
      image.loading = 'lazy';
      article.append(image);
    }

    const footer = document.createElement('div');
    footer.className = 'forum-post-footer';

    const tags = document.createElement('div');
    tags.className = 'forum-tag-list';

    const hashtagList = Array.isArray(post.hashtags) ? post.hashtags : [];
    hashtagList.forEach((hashtag) => {
      const tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'forum-tag';
      tag.textContent = `#${hashtag}`;
      tag.dataset.hashtag = hashtag.toLowerCase();
      tag.addEventListener('click', () => {
        activeHashtag = hashtag.toLowerCase();
        loadForumPosts();
      });
      tags.appendChild(tag);
    });

    if (!hashtagList.length) {
      const tag = document.createElement('span');
      tag.className = 'forum-tag';
      tag.textContent = '#comunidad';
      tags.appendChild(tag);
    }

    const stat = document.createElement('span');
    stat.className = 'forum-stat';
    stat.textContent = `${post.replies_count || 0} respuestas • ${post.likes_count || 0} likes`;

    footer.append(tags, stat);

    const actions = document.createElement('div');
    actions.className = 'forum-post-actions';

    const likeBtn = document.createElement('button');
    likeBtn.type = 'button';
    likeBtn.className = `ghost-btn small-btn ${post.liked ? 'active' : ''}`;
    likeBtn.dataset.action = 'like';
    likeBtn.dataset.postId = post.id;
    likeBtn.textContent = `❤️ ${post.likes_count || 0}`;

    const replyBtn = document.createElement('button');
    replyBtn.type = 'button';
    replyBtn.className = 'ghost-btn small-btn';
    replyBtn.dataset.action = 'reply-toggle';
    replyBtn.dataset.postId = post.id;
    replyBtn.textContent = `💬 Responder (${post.replies_count || 0})`;

    actions.append(likeBtn, replyBtn);

    const replyBox = document.createElement('div');
    replyBox.className = 'forum-reply-box hidden';
    replyBox.id = `reply-box-${post.id}`;

    const replyInput = document.createElement('textarea');
    replyInput.className = 'forum-reply-input';
    replyInput.placeholder = 'Escribe una respuesta a esta publicación';

    const replyActions = document.createElement('div');
    replyActions.className = 'forum-post-actions';

    const submitReplyBtn = document.createElement('button');
    submitReplyBtn.type = 'button';
    submitReplyBtn.className = 'ghost-btn small-btn';
    submitReplyBtn.dataset.action = 'submit-reply';
    submitReplyBtn.dataset.postId = post.id;
    submitReplyBtn.textContent = 'Enviar respuesta';

    const cancelReplyBtn = document.createElement('button');
    cancelReplyBtn.type = 'button';
    cancelReplyBtn.className = 'ghost-btn small-btn';
    cancelReplyBtn.dataset.action = 'cancel-reply';
    cancelReplyBtn.dataset.postId = post.id;
    cancelReplyBtn.textContent = 'Cancelar';

    replyActions.append(submitReplyBtn, cancelReplyBtn);
    replyBox.append(replyInput, replyActions);

    const replyList = document.createElement('div');
    replyList.className = 'forum-reply-list';

    (post.replies || []).forEach((reply) => {
      const replyItem = document.createElement('div');
      replyItem.className = 'forum-reply-item';

      const replyMeta = document.createElement('div');
      replyMeta.className = 'forum-reply-meta';

      const replyAuthor = document.createElement('span');
      replyAuthor.textContent = sanitizeHandle(reply.author_name);

      const replyTime = document.createElement('span');
      replyTime.textContent = formatRelativeTime(reply.created_at);

      replyMeta.append(replyAuthor, replyTime);

      const replyContent = document.createElement('p');
      replyContent.className = 'forum-reply-content';
      replyContent.textContent = reply.message;

      replyItem.append(replyMeta, replyContent);
      replyList.appendChild(replyItem);
    });

    article.append(meta, title, content, footer, actions, replyBox, replyList);
    forumPostList.appendChild(article);
  });
}

async function loadForumPosts() {
  try {
    const params = new URLSearchParams();
    if (activeHashtag) params.set('hashtag', activeHashtag);
    params.set('user_id', currentUser?.id);

    const response = await fetch(`/api/forum/posts?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'No se pudieron cargar las publicaciones');
    }

    renderForumPosts(data.posts || []);
  } catch (error) {
    if (forumPostList) {
      forumPostList.innerHTML = `<div class="forum-empty-state">${error.message}</div>`;
    }
  }
}

async function publishForumPost() {
  if (!forumMessage || !publishForumBtn) return;

  const message = forumMessage.value.trim();
  if (!message) return;

  publishForumBtn.disabled = true;

  try {
    const formData = new FormData();
    formData.append('user_id', currentUser?.id);
    formData.append('message', message);

    if (forumImageInput?.files?.[0]) {
      formData.append('image', forumImageInput.files[0]);
    }

    const response = await fetch('/api/forum/posts', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'No se pudo publicar');
    }

    forumMessage.value = '';
    activeHashtag = '';
    if (forumImageInput) forumImageInput.value = '';
    if (forumImagePreviewWrap) forumImagePreviewWrap.classList.add('hidden');
    await loadForumPosts();
  } catch (error) {
    alert(error.message);
  } finally {
    publishForumBtn.disabled = false;
  }
}

async function toggleLike(postId) {
  try {
    const response = await fetch(`/api/forum/posts/${postId}/like`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: currentUser?.id
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'No se pudo actualizar el like');
    }

    await loadForumPosts();
  } catch (error) {
    alert(error.message);
  }
}

async function addReply(postId, message) {
  const trimmed = message.trim();
  if (!trimmed) return;

  try {
    const response = await fetch(`/api/forum/posts/${postId}/replies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: currentUser?.id,
        message: trimmed
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'No se pudo enviar la respuesta');
    }

    await loadForumPosts();
  } catch (error) {
    alert(error.message);
  }
}

function renderNotifications(notifications) {
  if (!notificationList) return;

  notificationList.innerHTML = '';

  if (!notifications.length) {
    const emptyState = document.createElement('div');
    emptyState.className = 'notification-empty-state';
    emptyState.textContent = 'No tienes notificaciones nuevas por el momento.';
    notificationList.appendChild(emptyState);
    return;
  }

  notifications.forEach((notification) => {
    const item = document.createElement('article');
    item.className = `notification-item ${notification.read ? '' : 'unread'}`;

    const title = document.createElement('strong');
    title.textContent = notification.title;

    const message = document.createElement('p');
    message.textContent = notification.message;

    const meta = document.createElement('div');
    meta.className = 'notification-meta';

    const info = document.createElement('span');
    info.textContent = `${notification.type || 'info'} • ${notification.priority || 'normal'}`;

    const time = document.createElement('span');
    time.textContent = formatRelativeTime(notification.created_at);

    meta.append(info, time);

    item.append(title, message, meta);

    if (!notification.read) {
      const readBtn = document.createElement('button');
      readBtn.type = 'button';
      readBtn.className = 'ghost-btn small-btn';
      readBtn.textContent = 'Marcar leída';
      readBtn.addEventListener('click', async () => {
        await markNotificationRead(notification.id);
      });
      item.appendChild(readBtn);
    }

    notificationList.appendChild(item);
  });
}

async function loadNotifications() {
  try {
    const response = await fetch(`/api/notifications?user_id=${currentUser?.id}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'No se pudieron cargar las notificaciones');
    }

    const notifications = data.notifications || [];
    renderNotifications(notifications);

    const unreadCount = notifications.filter((item) => !item.read).length;
    if (notificationBadge) {
      notificationBadge.textContent = unreadCount;
      notificationBadge.style.display = unreadCount ? 'inline-grid' : 'none';
    }
  } catch (error) {
    if (notificationList) {
      notificationList.innerHTML = `<div class="notification-empty-state">${error.message}</div>`;
    }
  }
}

async function markNotificationRead(notificationId) {
  try {
    const response = await fetch(`/api/notifications/${notificationId}/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: currentUser?.id
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'No se pudo marcar la notificación');
    }

    await loadNotifications();
  } catch (error) {
    alert(error.message);
  }
}

async function markAllNotificationsRead() {
  try {
    const response = await fetch('/api/notifications/read-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: currentUser?.id
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'No se pudo actualizar las notificaciones');
    }

    await loadNotifications();
  } catch (error) {
    alert(error.message);
  }
}
/* ══════════════════════════════════════════════
   INSTRUCCIONALES — carga y render con filtros
══════════════════════════════════════════════ */
let _instVideoAbierto = null; // id del instruccional con acordeón abierto

async function loadInstruccionales() {
  const grid     = document.getElementById('instruccionales-grid');
  const countEl  = document.getElementById('inst-count');
  if (!grid) return;

  grid.innerHTML = '<p class="empty-state-msg">Cargando instruccionales…</p>';

  const nivel     = document.getElementById('inst-filtro-nivel')?.value     || '';
  const categoria = document.getElementById('inst-filtro-categoria')?.value || '';
  const params    = new URLSearchParams();
  if (nivel)     params.set('nivel', nivel);
  if (categoria) params.set('categoria', categoria);

  try {
    const res  = await fetch(`/api/public/instruccionales?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);

    const items = data.instruccionales || [];
    if (countEl) countEl.textContent = `${items.length} instruccional${items.length !== 1 ? 'es' : ''}`;
    renderInstruccionales(items, grid);

  } catch (err) {
    grid.innerHTML = `<p class="empty-state-msg">No se pudo cargar. ${escapeHtml(err.message)}</p>`;
  }
}

function renderInstruccionales(items, grid) {
  if (!items.length) {
    grid.innerHTML = '<p class="empty-state-msg">No hay instruccionales con esos filtros.</p>';
    return;
  }

  grid.innerHTML = items.map(inst => {
    const videoCount = inst.videos?.length || 0;
    const nivelBadge = {
      principiante: '#22c55e', intermedio: '#f59e0b', avanzado: '#ef4444'
    }[inst.nivel] || '#888';

    const videosHtml = (inst.videos || []).map((v, idx) => `
      <div class="inst-video-item">
        <span class="inst-video-num">${idx + 1}</span>
        <div class="inst-video-body">
          <p class="inst-video-title">${escapeHtml(v.titulo)}</p>
          <p class="inst-video-meta">${escapeHtml(v.dificultad || '')} · ${escapeHtml(v.categoria || '')}</p>
        </div>
        <button class="ghost-btn small-btn" onclick="openVideoDetail(${v.id})">▶ Ver</button>
      </div>`).join('');

    return `
      <article class="instruccional-card panel-card" id="inst-card-${inst.id}">
        <div class="inst-card-header" onclick="toggleInstAccordion(${inst.id})">
          <div class="inst-card-info">
            <span class="inst-nivel-badge" style="background:${nivelBadge}22;color:${nivelBadge};border:1px solid ${nivelBadge}44">
              ${escapeHtml(inst.nivel || 'sin nivel')}
            </span>
            <h3 class="inst-card-title">${escapeHtml(inst.titulo)}</h3>
            <p class="inst-card-meta">
              Por ${escapeHtml(inst.profesor_nombre)} · ${escapeHtml(inst.categoria || 'General')} · ${videoCount} video${videoCount !== 1 ? 's' : ''}
            </p>
            ${inst.descripcion ? `<p class="inst-card-desc">${escapeHtml(inst.descripcion)}</p>` : ''}
          </div>
          <span class="inst-accordion-arrow" id="inst-arrow-${inst.id}">▸</span>
        </div>
        <div class="inst-videos-list hidden" id="inst-videos-${inst.id}">
          ${videosHtml || '<p class="empty-state-msg" style="padding:12px">Este instruccional aún no tiene videos.</p>'}
        </div>
      </article>`;
  }).join('');

  // Hookear filtros para que recarguen al cambiar
  ['inst-filtro-nivel','inst-filtro-categoria'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.hooked) {
      el.dataset.hooked = '1';
      el.addEventListener('change', loadInstruccionales);
    }
  });
}

function toggleInstAccordion(id) {
  const list  = document.getElementById(`inst-videos-${id}`);
  const arrow = document.getElementById(`inst-arrow-${id}`);
  if (!list) return;
  const isOpen = !list.classList.contains('hidden');
  // Cerrar el anterior si había uno abierto
  if (_instVideoAbierto && _instVideoAbierto !== id) {
    document.getElementById(`inst-videos-${_instVideoAbierto}`)?.classList.add('hidden');
    const prevArrow = document.getElementById(`inst-arrow-${_instVideoAbierto}`);
    if (prevArrow) prevArrow.textContent = '▸';
  }
  list.classList.toggle('hidden', isOpen);
  arrow.textContent = isOpen ? '▸' : '▾';
  _instVideoAbierto = isOpen ? null : id;
}

/* ════════════════════════════════════════════════
   LOGOUT
════════════════════════════════════════════════ */
function initLogout() {
  document.getElementById('logout-btn').onclick = () => {
    localStorage.removeItem('lutaedanca_user');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('studentUser');
    window.location.href = 'login.html';
  };
}

function showStudentVideoFeedback(message, isSuccess = false) {
  if (!studentVideoUploadFeedback) return;
  studentVideoUploadFeedback.textContent = message;
  studentVideoUploadFeedback.classList.toggle('hidden', !message);
  studentVideoUploadFeedback.style.color = isSuccess ? '#1e7e34' : '#941517';
}

async function loadStudentVideos() {
  if (!studentVideoList || !currentUser?.id) return;
  studentVideoList.innerHTML = '<p class="empty-state-msg">Cargando tus videos…</p>';

  try {
    const res = await fetch(`/api/alumno/videos?usuario_id=${currentUser.id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'No se pudo cargar tus videos');

    const videos = data.videos || [];
    if (!videos.length) {
      studentVideoList.innerHTML = '<p class="empty-state-msg">Aún no has subido videos.</p>';
      return;
    }

    studentVideoList.innerHTML = videos.map(video => `
      <article class="reciente-card" style="padding:12px; margin-bottom:10px">
        <div class="reciente-body">
          <h4 class="reciente-title">${escapeHtml(video.titulo)}</h4>
          <p class="reciente-meta">${escapeHtml(video.descripcion || '')}</p>
          <div class="reciente-tags">${(video.hashtags || []).slice(0, 3).map(t => `<span class="media-tag">#${escapeHtml(t)}</span>`).join('')}</div>
          <div style="margin-top:10px; display:flex; gap:8px; align-items:center; flex-wrap:wrap">
            <a class="ghost-btn small-btn" href="${escapeHtml(video.url)}" target="_blank" rel="noreferrer noopener">▶ Ver archivo</a>
            <span style="color:#666; font-size:13px">Subido ${new Date(video.creado_en).toLocaleDateString()}</span>
          </div>
        </div>
      </article>`).join('');
  } catch (err) {
    studentVideoList.innerHTML = `<p class="empty-state-msg">No se pudieron cargar tus videos. ${escapeHtml(err.message)}</p>`;
  }
}

async function uploadStudentVideo() {
  if (!studentVideoTitle || !studentVideoFile || !studentVideoUploadBtn) return;

  const title = studentVideoTitle.value.trim();
  const description = studentVideoDescription?.value.trim() || '';
  const hashtags = studentVideoHashtags?.value.trim() || '';
  const file = studentVideoFile.files?.[0];

  if (!title) {
    showStudentVideoFeedback('El título es obligatorio.');
    return;
  }
  if (!file) {
    showStudentVideoFeedback('Selecciona un archivo de video para subir.');
    return;
  }

  const formData = new FormData();
  formData.append('usuario_id', currentUser?.id);
  formData.append('titulo', title);
  formData.append('descripcion', description);
  formData.append('hashtags', hashtags);
  formData.append('file', file);

  studentVideoUploadBtn.disabled = true;
  studentVideoUploadBtn.textContent = 'Subiendo...';
  showStudentVideoFeedback('', false);

  try {
    const res = await fetch('/api/alumno/videos', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'No se pudo subir el video');

    showStudentVideoFeedback('Video subido correctamente.', true);
    studentVideoTitle.value = '';
    studentVideoDescription.value = '';
    studentVideoHashtags.value = '';
    studentVideoFile.value = '';

    await loadStudentVideos();
  } catch (err) {
    showStudentVideoFeedback(err.message || 'Error al subir el video.');
  } finally {
    studentVideoUploadBtn.disabled = false;
    studentVideoUploadBtn.textContent = 'Subir video';
  }
}

publishForumBtn?.addEventListener('click', publishForumPost);
forumMessage?.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    publishForumPost();
  }
});

forumImageInput?.addEventListener('change', () => {
  const file = forumImageInput.files?.[0];
  if (!file) {
    forumImagePreviewWrap?.classList.add('hidden');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    if (forumImagePreview) {
      forumImagePreview.src = reader.result;
    }
    forumImagePreviewWrap?.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

forumImageRemoveBtn?.addEventListener('click', () => {
  if (forumImageInput) forumImageInput.value = '';
  if (forumImagePreviewWrap) forumImagePreviewWrap.classList.add('hidden');
  if (forumImagePreview) forumImagePreview.src = '';
});

forumPostList?.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  const postId = Number(button.dataset.postId);

  if (button.dataset.action === 'like') {
    await toggleLike(postId);
    return;
  }

  if (button.dataset.action === 'reply-toggle') {
    const replyBox = document.getElementById(`reply-box-${postId}`);
    replyBox?.classList.toggle('hidden');
    return;
  }

  if (button.dataset.action === 'submit-reply') {
    const replyBox = document.getElementById(`reply-box-${postId}`);
    const textarea = replyBox?.querySelector('textarea');
    await addReply(postId, textarea?.value || '');
    replyBox?.classList.add('hidden');
    return;
  }

  if (button.dataset.action === 'cancel-reply') {
    const replyBox = document.getElementById(`reply-box-${postId}`);
    const textarea = replyBox?.querySelector('textarea');
    if (textarea) textarea.value = '';
    replyBox?.classList.add('hidden');
  }
});

forumFilterChips?.addEventListener('click', (event) => {
  const chip = event.target.closest('button[data-hashtag]');
  if (!chip) return;

  activeHashtag = chip.dataset.hashtag || '';
  loadForumPosts();
});

novedadesList?.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const id = Number(button.dataset.id);
  if (action === 'view-profile') {
    await openUserProfile(id);
  }
  if (action === 'view-video') {
    await openVideoDetail(id);
  }
});

document.addEventListener('click', async (event) => {
  const followBtn = event.target.closest('#follow-user-btn');
  if (followBtn) {
    const userId = Number(followBtn.dataset.userId);
    if (userId) {
      await toggleFollowUser(userId);
    }
  }
});

notificationToggle?.addEventListener('click', (event) => {
  event.stopPropagation();
  notificationPanel?.classList.toggle('hidden');
  notificationToggle?.setAttribute('aria-expanded', String(!notificationPanel?.classList.contains('hidden')));
});

markAllReadBtn?.addEventListener('click', markAllNotificationsRead);

document.addEventListener('click', (event) => {
  if (!notificationPanel || !notificationToggle) return;

  if (!notificationPanel.contains(event.target) && !notificationToggle.contains(event.target)) {
    notificationPanel.classList.add('hidden');
    notificationToggle.setAttribute('aria-expanded', 'false');
  }
});

window.toggleInstAccordion = toggleInstAccordion;

/* ══════════════════════════════════════════════
   DIAGRAMAS INTERACTIVOS — estudiante
══════════════════════════════════════════════ */
let diViewerCanvas = null;
let diCurrentId = null;
let diCurrentLiked = false;

async function loadDiagramasInteractivos() {
  const grid = document.getElementById('diagramas-grid');
  const countEl = document.getElementById('di-count');
  if (!grid) return;
  grid.innerHTML = '<p class="empty-state-msg">Cargando diagramas…</p>';

  const tipo = document.getElementById('di-filtro-tipo')?.value || '';
  const params = new URLSearchParams();
  if (tipo) params.set('tipo', tipo);

  try {
    const res = await fetch(`/api/public/diagramas?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    const items = data.diagramas || [];
    if (countEl) countEl.textContent = `${items.length} diagrama${items.length !== 1 ? 's' : ''}`;
    renderDiagramasGrid(items, grid);
  } catch (err) {
    grid.innerHTML = `<p class="empty-state-msg">${escapeHtml(err.message)}</p>`;
  }
}

function renderDiagramasGrid(items, grid) {
  if (!items.length) {
    grid.innerHTML = '<p class="empty-state-msg">No hay diagramas publicados aún.</p>';
    return;
  }
  grid.innerHTML = items.map(d => `
    <article class="diagrama-card" onclick="openDiagramaViewer(${d.id})">
      <h3>${escapeHtml(d.titulo)}</h3>
      <p class="di-meta">Por ${escapeHtml(d.profesor_nombre || 'Profesor')} · ${escapeHtml(d.tipo || '')}</p>
      ${d.descripcion ? `<p style="font-size:13px;color:#aaa;margin:0">${escapeHtml(d.descripcion.slice(0, 120))}${d.descripcion.length > 120 ? '…' : ''}</p>` : ''}
      <div class="di-stats">
        <span>👁 ${d.vistas || 0}</span>
        <span>❤ ${d.likes || 0}</span>
        <span>💬 ${d.comentarios_count || 0}</span>
        <span>${(d.grafo?.nodes?.length || 0)} nodos</span>
      </div>
    </article>
  `).join('');
}

window.openDiagramaViewer = async id => {
  diCurrentId = id;
  const overlay = document.getElementById('di-viewer-overlay');
  const host = document.getElementById('di-viewer-canvas-host');
  if (!overlay || !host) return;

  overlay.classList.remove('hidden');
  host.innerHTML = '<p class="empty-state-msg" style="padding:24px">Cargando…</p>';

  try {
    const uid = studentUser?.id || '';
    const res = await fetch(`/api/public/diagramas/${id}?usuario_id=${uid}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    const d = data.diagrama;

    document.getElementById('di-viewer-title').textContent = d.titulo;
    document.getElementById('di-viewer-meta').textContent = d.profesor_nombre || '';
    document.getElementById('di-like-count').textContent = d.likes || 0;
    document.getElementById('di-view-count').textContent = d.vistas || 0;
    diCurrentLiked = !!d.liked;
    const likeBtn = document.getElementById('di-like-btn');
    if (likeBtn) likeBtn.classList.toggle('liked', diCurrentLiked);

    host.innerHTML = '';
    diViewerCanvas = new DiagramCanvas(host, { mode: 'view' });
    const grafo = d.grafo || { nodes: [], edges: [] };
    if (grafo.nodes?.length && !grafo.nodes.some(n => n.root)) {
      grafo.nodes[0].root = true;
    }
    diViewerCanvas.loadData(grafo);
    requestAnimationFrame(() => diViewerCanvas.init());

    fetch('/api/visualizaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'diagrama', contenido_id: id, usuario_id: studentUser?.id }),
    }).then(r => r.json()).then(v => {
      if (v.vistas != null) document.getElementById('di-view-count').textContent = v.vistas;
    }).catch(() => {});

    loadDiagramaComentarios(id);
  } catch (err) {
    host.innerHTML = `<p class="empty-state-msg">${escapeHtml(err.message)}</p>`;
  }
};

async function loadDiagramaComentarios(id) {
  const list = document.getElementById('di-comments-list');
  if (!list) return;
  try {
    const res = await fetch(`/api/contenido/diagrama/${id}/comentarios`);
    const data = await res.json();
    const items = data.comentarios || [];
    if (!items.length) {
      list.innerHTML = '<p class="empty-state-msg" style="padding:8px 0">Sin comentarios aún.</p>';
      return;
    }
    list.innerHTML = items.map(c => `
      <div class="di-comment-item">
        <strong>${escapeHtml(c.autor_nombre)}</strong>
        <span style="color:#666;font-size:11px"> · ${escapeHtml(c.creado_en || '')}</span>
        <p style="margin:4px 0 0;color:#ccc">${escapeHtml(c.mensaje)}</p>
      </div>
    `).join('');
  } catch {
    list.innerHTML = '';
  }
}

document.getElementById('di-viewer-close')?.addEventListener('click', () => {
  document.getElementById('di-viewer-overlay')?.classList.add('hidden');
  diViewerCanvas = null;
  diCurrentId = null;
});

document.getElementById('di-like-btn')?.addEventListener('click', async () => {
  if (!diCurrentId || !studentUser?.id) return;
  try {
    const res = await fetch(`/api/diagramas/${diCurrentId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario_id: studentUser.id }),
    });
    const data = await res.json();
    if (data.success) {
      diCurrentLiked = data.liked;
      document.getElementById('di-like-count').textContent = data.likes_count;
      document.getElementById('di-like-btn')?.classList.toggle('liked', diCurrentLiked);
    }
  } catch { /* ignore */ }
});

document.getElementById('di-comment-submit')?.addEventListener('click', async () => {
  if (!diCurrentId || !studentUser?.id) return;
  const input = document.getElementById('di-comment-input');
  const msg = (input?.value || '').trim();
  if (!msg) return;
  try {
    const res = await fetch(`/api/contenido/diagrama/${diCurrentId}/comentarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario_id: studentUser.id, mensaje: msg }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    if (input) input.value = '';
    loadDiagramaComentarios(diCurrentId);
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('di-report-btn')?.addEventListener('click', async () => {
  if (!diCurrentId) return;
  const motivo = prompt('Describe el motivo del reporte:');
  if (!motivo?.trim()) return;
  try {
    const res = await fetch(`/api/contenido/diagrama/${diCurrentId}/reportar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario_id: studentUser?.id, motivo: motivo.trim() }),
    });
    const data = await res.json();
    alert(data.success ? 'Reporte enviado. Un moderador lo revisará.' : (data.message || 'Error'));
  } catch {
    alert('No se pudo enviar el reporte.');
  }
});

document.getElementById('di-filtro-tipo')?.addEventListener('change', loadDiagramasInteractivos);
studentVideoUploadBtn?.addEventListener('click', uploadStudentVideo);
perfilSaveBtn?.addEventListener('click', saveProfileChanges);
perfilUpgradeBtn?.addEventListener('click', requestProfesorUpgrade);

initNav();
showSection(initialSection);

loadInicio();       // miniaturas de contenido reciente en la pantalla de inicio
loadForumPosts();
loadNotifications();
loadStudentVideos();
loadProfileData();