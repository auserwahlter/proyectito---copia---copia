const profesor = JSON.parse(localStorage.getItem('lutaedanca_user')) ||
                 JSON.parse(localStorage.getItem('currentUser'));
const currentUser = profesor;

if (!profesor || profesor.rol !== 'profesor' || profesor.estado !== 'activo') {
  localStorage.removeItem('lutaedanca_user');
  window.location.href = 'login.html';
}

// ── API base (mismo origen que Flask) ──────────
const API = 'http://localhost:5000/api';

// ── Estado local ───────────────────────────────
const store = {
  videos:          [],
  imagenes:        [],
  instruccionales: [],
  diagramas:       [],
};
let nextId = 1;

/* ══════════════════════════════════════════════
   BOOTSTRAP
══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initUI();
  initNav();
  initUploadVideo();
  initUploadImagen();
  initInstruccionales();
  initDiagramas();
  initEstadisticas();
  initForum();
  initLogout();
  initPerfil();
  loadProfesorContent();
});

/* ══════════════════════════════════════════════
   UI BÁSICA
══════════════════════════════════════════════ */
function initUI() {
  const nombre = profesor.nombre || 'Instructor';
  const estado = profesor.estado || 'pendiente';

  setTextSafe('profesor-name', nombre);
  setTextSafe('profesor-meta', `@${(profesor.email || '').split('@')[0]}`);
  setTextSafe('dashboard-title', `Hola, ${nombre.split(' ')[0]}`);
  setTextSafe('hero-estado-badge', estado);
  setTextSafe('estado-cuenta', estado);
  setTextSafe('payment-method', estado);
  setTextSafe('account-status', fmtDate(profesor.creado_en));
  refreshSidebarCounters();
}

function setTextSafe(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-BO', { year: 'numeric', month: 'short' });
}

function refreshSidebarCounters() {
  const total = store.videos.length + store.imagenes.length
    + store.instruccionales.length + store.diagramas.length;
  setTextSafe('total-contenido', `${total} elemento${total !== 1 ? 's' : ''}`);
  setTextSafe('footer-seguidores', '— alumnos te siguen');
  setTextSafe('total-videos', store.videos.length);
  setTextSafe('total-imagenes', store.imagenes.length);
  updateLastContentList();
}

function updateLastContentList() {
  const all = [
    ...store.videos.map(v        => ({ icon: '🎬', title: v.titulo,   meta: v.categoria })),
    ...store.imagenes.map(i      => ({ icon: '🖼️', title: i.titulo,   meta: i.tipo })),
    ...store.instruccionales.map(i => ({ icon: '📚', title: i.titulo, meta: i.nivel })),
    ...store.diagramas.map(d     => ({ icon: '🗺️', title: d.titulo,   meta: d.tipo })),
  ].slice(-5).reverse();

  const list = document.getElementById('ultimo-contenido-list');
  if (!list) return;

  if (all.length === 0) {
    list.innerHTML = '<p class="empty-state-msg">Aún no has subido contenido.</p>';
    return;
  }
  list.innerHTML = all.map(item => `
    <li class="session-item">
      <div>
        <p class="session-title">${item.icon} ${esc(item.title)}</p>
        <p class="session-time">${esc(item.meta || '')}</p>
      </div>
    </li>
  `).join('');
}
async function loadProfesorContent() {
  try {
    const [videosRes, imagenesRes, instruccionalesRes, diagramasRes] = await Promise.all([
      fetch(`${API}/profesor/videos?profesor_id=${profesor.id}`).then(res => res.json()),
      fetch(`${API}/profesor/imagenes?profesor_id=${profesor.id}`).then(res => res.json()),
      fetch(`${API}/profesor/instruccionales?profesor_id=${profesor.id}`).then(res => res.json()),
      fetch(`${API}/profesor/diagramas?profesor_id=${profesor.id}`).then(res => res.json()),
    ]);

    store.videos = (videosRes.videos || []).map(v => ({
      ...v,
      hashtags:    Array.isArray(v.hashtags) ? v.hashtags : [],
      url:         v.filename ? `/uploads/videos/${profesor.id}/${v.filename}` : '',
      fechaSubida: v.creado_en ? new Date(v.creado_en).toLocaleDateString('es-BO') : '—',
    }));
    store.imagenes = (imagenesRes.imagenes || []).map(i => ({
      ...i,
      hashtags:    Array.isArray(i.hashtags) ? i.hashtags : [],
      fechaSubida: i.creado_en ? new Date(i.creado_en).toLocaleDateString('es-BO') : '—',
    }));
    store.instruccionales = (instruccionalesRes.instruccionales || []).map(i => ({
      ...i,
      videosIds:     Array.isArray(i.videos_ids) ? i.videos_ids : [],
      fechaCreacion: i.creado_en ? new Date(i.creado_en).toLocaleDateString('es-BO') : '—',
    }));
    store.diagramas = (diagramasRes.diagramas || []).map(d => ({
      ...d,
      grafo: d.grafo || { nodes: [], edges: [] },
      fechaCreacion: d.creado_en ? new Date(d.creado_en).toLocaleDateString('es-BO') : '—',
    }));

    renderVideosList();
    renderImagenesGallery();
    renderInstList();
    renderDiagList();
    refreshDiagInstruccionalSelect();
    refreshSidebarCounters();
  } catch (error) {
    console.warn('Error cargando contenido de profesor:', error);
  }
}

async function loadNovedadesProfesor() {
  const novedadesList = document.getElementById('novedades-list');
  if (!novedadesList) return;
  novedadesList.innerHTML = '<p class="empty-state-msg">Cargando novedades…</p>';

  try {
    const [videosRes, imagenesRes, diagramasRes] = await Promise.all([
      fetch(`${API}/mod/videos`).then(res => res.json()),
      fetch(`${API}/mod/imagenes`).then(res => res.json()),
      fetch(`${API}/mod/diagramas`).then(res => res.json()),
    ]);

    const videos = videosRes.videos || [];
    const imagenes = imagenesRes.imagenes || [];
    const diagramas = diagramasRes.diagramas || [];

    const items = [
      ...videos.map(v => ({
        id: v.id,
        type: 'Video',
        icon: '🎬',
        title: v.titulo,
        meta: `${v.categoria || 'Sin categoría'} · ${v.dificultad || 'Sin nivel'}`,
        date: v.creado_en,
        extra: v.hashtags?.map(t => `#${t}`).join(' '),
      })),
      ...imagenes.map(i => ({
        id: i.id,
        type: 'Imagen',
        icon: '🖼️',
        title: i.titulo,
        meta: i.tipo || 'Sin tipo',
        date: i.creado_en,
        extra: i.hashtags?.map(t => `#${t}`).join(' '),
      })),
      ...diagramas.map(d => ({
        id: d.id,
        type: 'Diagrama',
        icon: '🗺️',
        title: d.titulo,
        meta: d.tipo || 'Sin tipo',
        date: d.creado_en,
        extra: d.descripcion || d.nodos || '',
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (!items.length) {
      novedadesList.innerHTML = '<p class="empty-state-msg">Aún no hay novedades recientes.</p>';
      return;
    }

    novedadesList.innerHTML = items.slice(0, 10).map(item => `
      <article class="novedad-card">
        <div class="novedad-icon">${item.icon}</div>
        <div class="novedad-content">
          <p class="novedad-type">${item.type}</p>
          <h3 class="novedad-title">${esc(item.title)}</h3>
          <p class="novedad-meta">${esc(item.meta)}</p>
          <p class="novedad-extra">${item.extra ? esc(item.extra) : ''}</p>
          <p class="novedad-date">${formatRelativeTime(item.date)}</p>
        </div>
      </article>
    `).join('');
  } catch (error) {
    novedadesList.innerHTML = `<p class="error-state">No se pudieron cargar novedades. ${error.message}</p>`;
  }
}

function initForum() {
  const forumImageInput = document.getElementById('forum-image-input');
  const forumImagePreviewWrap = document.getElementById('forum-image-preview-wrap');
  const forumImagePreview = document.getElementById('forum-image-preview');
  const removeBtn = document.getElementById('forum-image-remove-btn');

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

  removeBtn?.addEventListener('click', () => {
    if (forumImageInput) forumImageInput.value = '';
    forumImagePreviewWrap?.classList.add('hidden');
    if (forumImagePreview) forumImagePreview.src = '';
  });

  document.getElementById('publish-forum-btn')?.addEventListener('click', publishForumPostProfesor);
}

async function loadForumPostsProfesor() {
  const list = document.getElementById('forum-post-list');
  if (!list) return;
  list.innerHTML = '<p class="empty-state-msg">Cargando publicaciones del foro…</p>';

  try {
    const response = await fetch(`${API}/forum/posts?user_id=${profesor.id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'No se pudieron cargar las publicaciones');
    const posts = data.posts || [];
    renderForumPostsProfesor(posts);
  } catch (error) {
    list.innerHTML = `<p class="error-state">${esc(error.message || 'Error al cargar foro')}</p>`;
  }
}

function renderForumPostsProfesor(posts) {
  const list = document.getElementById('forum-post-list');
  if (!list) return;
  if (!posts.length) {
    list.innerHTML = '<p class="empty-state-msg">Aún no hay publicaciones en el foro.</p>';
    return;
  }
  list.innerHTML = posts.map(post => `
    <article class="forum-post">
      <div class="forum-post-meta">
        <span class="forum-author">${esc(post.autor || 'Usuario')}</span>
        <span class="forum-time">${formatRelativeTime(post.creado_en)}</span>
      </div>
      <h4>${esc((post.mensaje || '').split('\n')[0].slice(0, 120))}</h4>
      <p>${esc(post.mensaje || '')}</p>
      ${post.image_url ? `<img class="forum-post-image" src="${esc(post.image_url)}" alt="Imagen adjunta" loading="lazy" />` : ''}
      ${post.hashtags?.length ? `<div class="forum-item-tags">${post.hashtags.map(tag => `<span class="forum-tag">#${esc(tag)}</span>`).join('')}</div>` : ''}
    </article>
  `).join('');
}

async function publishForumPostProfesor() {
  const forumMessage = document.getElementById('forum-message');
  const forumImageInput = document.getElementById('forum-image-input');
  if (!forumMessage) return;
  const message = (forumMessage.value || '').trim();
  if (!message) return;

  const formData = new FormData();
  formData.append('user_id', profesor.id);
  formData.append('message', message);
  if (forumImageInput?.files?.[0]) {
    formData.append('image', forumImageInput.files[0]);
  }

  try {
    const response = await fetch(`${API}/forum/posts`, {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'No se pudo publicar en el foro');
    forumMessage.value = '';
    if (forumImageInput) forumImageInput.value = '';
    document.getElementById('forum-image-preview-wrap')?.classList.add('hidden');
    loadForumPostsProfesor();
  } catch (error) {
    alert(error.message || 'Error al publicar en el foro');
  }
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
/* ══════════════════════════════════════════════
   NAVEGACIÓN
══════════════════════════════════════════════ */
const SECTIONS = ['inicio','subir-video','subir-imagen',
                  'instruccionales','diagramas','estadisticas','comunidad','perfil',
                  'encyclopedia','puzzles','novedades'];

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
  SECTIONS.forEach(s => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.classList.toggle('hidden', s !== name);
  });
  document.querySelectorAll('.nav-item[data-section]').forEach(link => {
    link.classList.toggle('active', link.dataset.section === name);
  });
  if (name === 'estadisticas') renderEstadisticas();
  if (name === 'perfil')       initPerfilSection();
  if (name === 'novedades')    loadNovedadesProfesor();
  if (name === 'comunidad')    loadForumPostsProfesor();
  if (name === 'diagramas') {
    requestAnimationFrame(() => initDiagCanvasEditor());
  }

  // ── Enciclopedia ──────────────────────────────────────────────
  // El canvas necesita que su contenedor sea visible para medir
  // clientWidth/clientHeight correctamente. Se usa rAF para
  // garantizar que el browser pintó el layout antes de inicializar.
  if (name === 'encyclopedia') {
    requestAnimationFrame(() => {
      if (typeof initCanvas === 'function') {
        // Si ya fue inicializada, solo forzar un re-escaldo
        if (typeof initialized !== 'undefined' && initialized) {
          // Re-medir por si el panel cambió de tamaño mientras estaba oculto
          const wrap = document.getElementById('canvas-wrap');
          if (wrap) {
            const W2 = wrap.clientWidth;
            const H2 = wrap.clientHeight;
            if (W2 > 0 && H2 > 0) initCanvas();
          }
        } else {
          // Primera vez: inicializar desde cero
          initCanvas();
        }
      }
    });
  }
}

/* ══════════════════════════════════════════════
   SUBIR VIDEO
══════════════════════════════════════════════ */
function initUploadVideo() {
  const dropzone    = document.getElementById('video-dropzone');
  const fileInput   = document.getElementById('video-file-input');
  const preview     = document.getElementById('video-preview');
  const previewWrap = document.getElementById('video-preview-wrap');
  const fileNameEl  = document.getElementById('video-file-name');
  const submitBtn   = document.getElementById('video-submit-btn');
  const cancelBtn   = document.getElementById('video-cancel-btn');
  const feedback    = document.getElementById('video-feedback');

  if (!dropzone || !submitBtn) return;

  let selectedFile = null;

  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleVideoFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleVideoFile(fileInput.files[0]);
  });

  function handleVideoFile(file) {
    const allowed = ['video/mp4','video/webm','video/quicktime'];
    if (!allowed.includes(file.type)) {
      showFeedback(feedback, 'error', 'Formato no permitido. Usa MP4, WebM o MOV.');
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      showFeedback(feedback, 'error', 'El archivo supera los 500 MB.');
      return;
    }
    selectedFile = file;
    preview.src = URL.createObjectURL(file);
    fileNameEl.textContent = file.name;
    previewWrap.classList.remove('hidden');
    dropzone.style.display = 'none';
    hideFeedback(feedback);
  }

  function resetVideoForm() {
    selectedFile = null;
    if (preview.src) URL.revokeObjectURL(preview.src);
    preview.src = '';
    previewWrap.classList.add('hidden');
    dropzone.style.display = '';
    fileInput.value = '';
    ['video-titulo','video-descripcion','video-hashtags'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  cancelBtn.addEventListener('click', resetVideoForm);

  submitBtn.addEventListener('click', async () => {
    const titulo = document.getElementById('video-titulo').value.trim();
    if (!titulo)       { showFeedback(feedback, 'error', 'El título es obligatorio.'); return; }
    if (!selectedFile) { showFeedback(feedback, 'error', 'Selecciona un archivo de video.'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Publicando…';

    const formData = new FormData();
    formData.append('profesor_id', profesor.id);
    formData.append('titulo', titulo);
    formData.append('categoria', document.getElementById('video-categoria').value);
    formData.append('dificultad', document.getElementById('video-dificultad').value);
    formData.append('descripcion', document.getElementById('video-descripcion').value.trim());
    formData.append('hashtags', document.getElementById('video-hashtags').value.trim());
    formData.append('file', selectedFile);

    try {
      const res = await fetch(`${API}/profesor/videos`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error al subir el video');

      store.videos.unshift({
        id:          data.video.id,
        titulo,
        categoria:   document.getElementById('video-categoria').value,
        dificultad:  document.getElementById('video-dificultad').value,
        descripcion: document.getElementById('video-descripcion').value.trim(),
        hashtags:    parseHashtags(document.getElementById('video-hashtags').value),
        fileName:    selectedFile.name,
        url:         URL.createObjectURL(selectedFile),
        _blobUrl:    true,  // flag to know this is a temporary blob URL
        fechaSubida: new Date().toLocaleDateString('es-BO'),
      });
      renderVideosList();
      refreshSidebarCounters();
      resetVideoForm();
      showFeedback(feedback, 'success', `✅ Video "${titulo}" publicado correctamente.`);
    } catch (error) {
      showFeedback(feedback, 'error', error.message || 'No se pudo subir el video.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '⬆️ Publicar video';
    }
  });
}

function renderVideosList() {
  const list  = document.getElementById('videos-list');
  const count = document.getElementById('videos-count');
  if (!list) return;

  if (count) count.textContent = `${store.videos.length} video${store.videos.length !== 1 ? 's' : ''}`;

  if (store.videos.length === 0) {
    list.innerHTML = '<p class="empty-state-msg">Aún no has subido videos.</p>';
    return;
  }
  list.innerHTML = store.videos.map(v => `
    <div class="media-item">
      <div class="video-thumb-wrap" style="flex-shrink:0;width:96px;height:64px;border-radius:8px;overflow:hidden;background:#000;position:relative;">
        ${v.url
          ? `<video class="video-thumb"
               src="${esc(v.url)}"
               style="width:100%;height:100%;object-fit:cover;display:block;"
               preload="metadata"
               muted
               playsinline
               onmouseover="this.play()"
               onmouseout="this.pause();this.currentTime=0"
             ></video>
             <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:1.4rem;opacity:0.85;">▶️</span>`
          : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:1.75rem;">🎬</div>`
        }
      </div>
      <div class="media-item-body">
        <p class="media-item-title">${esc(v.titulo)}</p>
        <p class="media-item-meta">${esc(v.categoria || '—')} · ${esc(v.dificultad || '—')} · ${esc(v.fechaSubida)} · 👁️ ${v.vistas || 0} visualizaci${(v.vistas || 0) === 1 ? 'ón' : 'ones'}</p>
        <div class="media-item-tags">
          ${(v.hashtags || []).map(t => `<span class="media-tag">#${esc(t)}</span>`).join('')}
        </div>
      </div>
      <div class="media-item-actions">
        <button class="icon-btn" onclick="abrirComentarios('video', ${v.id}, ${JSON.stringify(esc(v.titulo))})">💬</button>
        <button class="icon-btn del" onclick="deleteVideo(${v.id})">🗑️</button>
      </div>
    </div>
  `).join('');
  refreshVideosSelector();
}

window.deleteVideo = id => {
  store.videos = store.videos.filter(v => v.id !== id);
  renderVideosList();
  refreshSidebarCounters();
};

/* ══════════════════════════════════════════════
   SUBIR IMAGEN
══════════════════════════════════════════════ */
function initUploadImagen() {
  const dropzone    = document.getElementById('imagen-dropzone');
  const fileInput   = document.getElementById('imagen-file-input');
  const preview     = document.getElementById('imagen-preview');
  const previewWrap = document.getElementById('imagen-preview-wrap');
  const fileNameEl  = document.getElementById('imagen-file-name');
  const submitBtn   = document.getElementById('imagen-submit-btn');
  const cancelBtn   = document.getElementById('imagen-cancel-btn');
  const feedback    = document.getElementById('imagen-feedback');

  if (!dropzone || !submitBtn) return;

  let selectedFile = null;
  let dataUrl      = null;

  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleImagenFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleImagenFile(fileInput.files[0]);
  });

  function handleImagenFile(file) {
    const allowed = ['image/jpeg','image/png','image/webp'];
    if (!allowed.includes(file.type)) {
      showFeedback(feedback, 'error', 'Formato no permitido. Usa JPG, PNG o WebP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showFeedback(feedback, 'error', 'La imagen supera los 10 MB.');
      return;
    }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = e2 => {
      dataUrl = e2.target.result;
      preview.src = dataUrl;
      fileNameEl.textContent = file.name;
      previewWrap.classList.remove('hidden');
      dropzone.style.display = 'none';
      hideFeedback(feedback);
    };
    reader.readAsDataURL(file);
  }

  function resetImagenForm() {
    selectedFile = null;
    dataUrl      = null;
    preview.src  = '';
    previewWrap.classList.add('hidden');
    dropzone.style.display = '';
    fileInput.value = '';
    ['imagen-titulo','imagen-descripcion','imagen-hashtags'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  cancelBtn.addEventListener('click', resetImagenForm);

  submitBtn.addEventListener('click', async () => {
    const titulo = document.getElementById('imagen-titulo').value.trim();
    if (!titulo)       { showFeedback(feedback, 'error', 'El título es obligatorio.'); return; }
    if (!selectedFile) { showFeedback(feedback, 'error', 'Selecciona un archivo de imagen.'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Publicando…';

    const formData = new FormData();
    formData.append('profesor_id', profesor.id);
    formData.append('titulo', titulo);
    formData.append('tipo', document.getElementById('imagen-tipo').value);
    formData.append('descripcion', document.getElementById('imagen-descripcion').value.trim());
    formData.append('hashtags', document.getElementById('imagen-hashtags').value.trim());
    formData.append('file', selectedFile);

    try {
      const res = await fetch(`${API}/profesor/imagenes`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error al subir la imagen');

      store.imagenes.unshift({
        id:          data.imagen.id,
        titulo,
        tipo:        document.getElementById('imagen-tipo').value,
        descripcion: document.getElementById('imagen-descripcion').value.trim(),
        hashtags:    parseHashtags(document.getElementById('imagen-hashtags').value),
        fileName:    selectedFile.name,
        url:         data.imagen.url,
        fechaSubida: data.imagen.creado_en ? new Date(data.imagen.creado_en).toLocaleDateString('es-BO') : new Date().toLocaleDateString('es-BO'),
      });
      renderImagenesGallery();
      refreshSidebarCounters();
      resetImagenForm();
      showFeedback(feedback, 'success', `✅ Imagen "${titulo}" publicada correctamente.`);
    } catch (error) {
      showFeedback(feedback, 'error', error.message || 'No se pudo subir la imagen.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '⬆️ Publicar imagen';
    }
  });
}

function renderImagenesGallery() {
  const grid  = document.getElementById('imagenes-grid');
  const count = document.getElementById('imagenes-count');
  if (!grid) return;

  if (count) count.textContent = `${store.imagenes.length} imagen${store.imagenes.length !== 1 ? 'es' : ''}`;

  if (store.imagenes.length === 0) {
    grid.innerHTML = '<p class="empty-state-msg">Aún no has subido imágenes.</p>';
    return;
  }
  grid.innerHTML = store.imagenes.map(img => {
    const src = img.dataUrl || img.url || '';
    return `
      <div class="gallery-img-wrap">
        <img class="gallery-img" src="${src}" alt="${esc(img.titulo)}" loading="eager" />
        <span style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.65);color:#fff;font-size:0.68rem;padding:2px 6px;border-radius:999px;">👁️ ${img.vistas || 0}</span>
        <div class="gallery-img-overlay">
          <p class="gallery-img-title">${esc(img.titulo)}</p>
          <button class="gallery-del-btn" onclick="deleteImagen(${img.id})">Eliminar</button>
        </div>
      </div>
    `;
  }).join('');
}

window.deleteImagen = id => {
  store.imagenes = store.imagenes.filter(i => i.id !== id);
  renderImagenesGallery();
  refreshSidebarCounters();
};

/* ══════════════════════════════════════════════
   INSTRUCCIONALES
══════════════════════════════════════════════ */
function initInstruccionales() {
  const submitBtn = document.getElementById('inst-submit-btn');
  const cancelBtn = document.getElementById('inst-cancel-btn');
  const feedback  = document.getElementById('inst-feedback');
  if (!submitBtn) return;

  cancelBtn.addEventListener('click', resetInstForm);

  submitBtn.addEventListener('click', async () => {
    const titulo = document.getElementById('inst-titulo').value.trim();
    if (!titulo) { showFeedback(feedback, 'error', 'El título es obligatorio.'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando…';

    const body = {
      profesor_id: profesor.id,
      titulo,
      descripcion: document.getElementById('inst-descripcion').value.trim(),
      nivel:       document.getElementById('inst-nivel').value,
      categoria:   document.getElementById('inst-categoria').value,
      videos_ids:  getSelectedVideoIds(),
    };

    try {
      const res = await fetch(`${API}/profesor/instruccionales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error al crear el instruccional');

      store.instruccionales.unshift({
        id:           data.instruccional.id,
        titulo,
        descripcion:  body.descripcion,
        nivel:        body.nivel,
        categoria:    body.categoria,
        videosIds:    body.videos_ids,
        fechaCreacion: data.instruccional.creado_en ? new Date(data.instruccional.creado_en).toLocaleDateString('es-BO') : new Date().toLocaleDateString('es-BO'),
      });
      renderInstList();
      refreshSidebarCounters();
      resetInstForm();
      showFeedback(feedback, 'success', `✅ Instruccional "${titulo}" creado.`);
    } catch (error) {
      showFeedback(feedback, 'error', error.message || 'No se pudo crear el instruccional.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Guardar instruccional';
    }
  });
}

function getSelectedVideoIds() {
  return Array.from(
    document.querySelectorAll('#inst-videos-selector input[type="checkbox"]:checked')
  ).map(cb => parseInt(cb.value));
}

function refreshVideosSelector() {
  const selector = document.getElementById('inst-videos-selector');
  if (!selector) return;
  if (store.videos.length === 0) {
    selector.innerHTML = '<p class="empty-state-msg">Primero sube videos desde "Subir video".</p>';
    return;
  }
  selector.innerHTML = store.videos.map(v => `
    <label class="video-check-item">
      <input type="checkbox" value="${v.id}" />
      🎬 ${esc(v.titulo)}
      <span style="color:#888;font-size:0.75rem;margin-left:auto">${esc(v.dificultad)}</span>
    </label>
  `).join('');
}

function renderInstList() {
  const list  = document.getElementById('inst-list');
  const count = document.getElementById('inst-count');
  if (!list) return;
  if (count) count.textContent = `${store.instruccionales.length} curso${store.instruccionales.length !== 1 ? 's' : ''}`;

  if (store.instruccionales.length === 0) {
    list.innerHTML = '<p class="empty-state-msg">No has creado instruccionales aún.</p>';
    return;
  }
  list.innerHTML = store.instruccionales.map(inst => {
    const ids = Array.isArray(inst.videosIds) ? inst.videosIds : [];
    const videoCount = ids.length;

    // Buscar los videos que pertenecen a este instruccional para miniaturas
    const linkedVideos = ids
      .map(vid => store.videos.find(v => v.id === vid))
      .filter(Boolean)
      .slice(0, 3);

    const thumbsHtml = linkedVideos.length > 0
      ? `<div style="display:flex;gap:4px;margin-top:6px;">
          ${linkedVideos.map(v => v.url
            ? `<div style="position:relative;width:64px;height:42px;border-radius:5px;overflow:hidden;background:#000;flex-shrink:0;">
                <video src="${esc(v.url)}" style="width:100%;height:100%;object-fit:cover;" preload="metadata" muted playsinline
                  onmouseover="this.play()" onmouseout="this.pause();this.currentTime=0"></video>
                <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:0.9rem;pointer-events:none;">▶</span>
              </div>`
            : `<div style="width:64px;height:42px;border-radius:5px;background:#1e1e2e;display:flex;align-items:center;justify-content:center;font-size:1.1rem;">🎬</div>`
          ).join('')}
          ${videoCount > 3 ? `<div style="width:64px;height:42px;border-radius:5px;background:#2a2a3e;display:flex;align-items:center;justify-content:center;font-size:0.75rem;color:#888;">+${videoCount - 3}</div>` : ''}
        </div>`
      : '';

    return `
      <div class="media-item">
        <span class="media-item-icon">📚</span>
        <div class="media-item-body">
          <p class="media-item-title">${esc(inst.titulo)}</p>
          <p class="media-item-meta">${esc(inst.nivel || '—')} · ${esc(inst.categoria || '—')} · ${videoCount} video${videoCount !== 1 ? 's' : ''} · ${esc(inst.fechaCreacion)} · 👁️ ${inst.vistas || 0} visualizaci${(inst.vistas || 0) === 1 ? 'ón' : 'ones'}</p>
          ${inst.descripcion ? `<p class="media-item-meta" style="margin-top:2px;font-size:0.75rem;">${esc(inst.descripcion)}</p>` : ''}
          ${thumbsHtml}
        </div>
        <div class="media-item-actions">
          <button class="icon-btn" onclick="abrirComentarios('instruccional', ${inst.id}, ${JSON.stringify(esc(inst.titulo))})">💬</button>
          <button class="icon-btn del" onclick="deleteInst(${inst.id})">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

function resetInstForm() {
  ['inst-titulo','inst-descripcion'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

window.deleteInst = id => {
  store.instruccionales = store.instruccionales.filter(i => i.id !== id);
  renderInstList();
  refreshSidebarCounters();
};

/* ══════════════════════════════════════════════
   DIAGRAMAS INTERACTIVOS
══════════════════════════════════════════════ */
let diagCanvasEditor = null;
let diagEditingId = null;
let diagGraphDraft = { nodes: [], edges: [] };

function initDiagCanvasEditor() {
  const host = document.getElementById('diag-canvas-host');
  if (!host || typeof DiagramCanvas === 'undefined') return;

  if (!diagCanvasEditor) {
    diagCanvasEditor = new DiagramCanvas(host, {
      mode: 'edit',
      onChange: data => { diagGraphDraft = data; },
    });
    diagCanvasEditor.observeResize(document.getElementById('section-diagramas'));
  }
  diagCanvasEditor.loadData(diagGraphDraft);
  diagCanvasEditor.init();
}

function refreshDiagInstruccionalSelect() {
  const sel = document.getElementById('diag-instruccional');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— Ninguno —</option>' +
    store.instruccionales.map(i =>
      `<option value="${i.id}">${esc(i.titulo)}</option>`
    ).join('');
  if (current) sel.value = current;
}

function initDiagramas() {
  const submitBtn = document.getElementById('diag-submit-btn');
  const cancelBtn = document.getElementById('diag-cancel-btn');
  const feedback  = document.getElementById('diag-feedback');
  if (!submitBtn) return;

  cancelBtn.addEventListener('click', resetDiagForm);

  submitBtn.addEventListener('click', async () => {
    const titulo = document.getElementById('diag-titulo').value.trim();
    if (!titulo) { showFeedback(feedback, 'error', 'El título es obligatorio.'); return; }

    const grafo = diagCanvasEditor ? diagCanvasEditor.getData() : diagGraphDraft;
    if (!grafo.nodes || grafo.nodes.length === 0) {
      showFeedback(feedback, 'error', 'Agrega al menos un nodo al lienzo.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando…';

    const body = {
      profesor_id: profesor.id,
      titulo,
      descripcion: document.getElementById('diag-descripcion').value.trim(),
      nodos: JSON.stringify(grafo),
      tipo: document.getElementById('diag-tipo').value,
      publicado: document.getElementById('diag-publicado').value === '1',
      instruccional_id: document.getElementById('diag-instruccional').value || null,
      enciclopedia_ref: document.getElementById('diag-enciclopedia').value.trim() || null,
    };

    try {
      const url = diagEditingId
        ? `${API}/profesor/diagramas/${diagEditingId}`
        : `${API}/profesor/diagramas`;
      const res = await fetch(url, {
        method: diagEditingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error al guardar');

      await loadProfesorContent();
      resetDiagForm();
      showFeedback(feedback, 'success', `✅ Diagrama "${titulo}" ${diagEditingId ? 'actualizado' : 'creado'}.`);
    } catch (error) {
      showFeedback(feedback, 'error', error.message || 'No se pudo guardar el diagrama.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '🗺️ Guardar diagrama';
    }
  });
}

function renderDiagList() {
  const list  = document.getElementById('diag-list');
  const count = document.getElementById('diag-count');
  if (!list) return;
  if (count) count.textContent = `${store.diagramas.length} diagrama${store.diagramas.length !== 1 ? 's' : ''}`;

  if (store.diagramas.length === 0) {
    list.innerHTML = '<p class="empty-state-msg">No has creado diagramas aún.</p>';
    return;
  }
  list.innerHTML = store.diagramas.map(d => `
    <div class="media-item">
      <span class="media-item-icon">🗺️</span>
      <div class="media-item-body">
        <p class="media-item-title">${esc(d.titulo)} ${d.publicado === false ? '<span style="color:#888;font-size:.72rem">(borrador)</span>' : ''}</p>
        <p class="media-item-meta">${esc(d.tipo)} · ${esc(d.fechaCreacion)} · 👁 ${d.vistas || 0} · ❤ ${d.likes || 0}</p>
        <p class="media-item-meta" style="font-size:0.72rem;margin-top:2px">${(d.grafo?.nodes?.length || 0)} nodos · ${(d.grafo?.edges?.length || 0)} conexiones</p>
      </div>
      <div class="media-item-actions">
        <button class="icon-btn" onclick="editDiag(${d.id})" title="Editar">✏️</button>
        <button class="icon-btn del" onclick="deleteDiag(${d.id})">🗑️</button>
      </div>
    </div>
  `).join('');
}

function resetDiagForm() {
  diagEditingId = null;
  diagGraphDraft = { nodes: [], edges: [] };
  ['diag-titulo', 'diag-descripcion', 'diag-enciclopedia'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const tipo = document.getElementById('diag-tipo');
  const pub = document.getElementById('diag-publicado');
  const inst = document.getElementById('diag-instruccional');
  if (tipo) tipo.value = 'arbol_decision';
  if (pub) pub.value = '1';
  if (inst) inst.value = '';
  const badge = document.getElementById('diag-edit-badge');
  const formTitle = document.getElementById('diag-form-title');
  if (badge) badge.style.display = 'none';
  if (formTitle) formTitle.textContent = 'Nuevo diagrama';
  if (diagCanvasEditor) diagCanvasEditor.loadData(diagGraphDraft);
}

window.editDiag = id => {
  const d = store.diagramas.find(x => x.id === id);
  if (!d) return;
  diagEditingId = id;
  document.getElementById('diag-titulo').value = d.titulo || '';
  document.getElementById('diag-descripcion').value = d.descripcion || '';
  document.getElementById('diag-tipo').value = d.tipo || 'arbol_decision';
  document.getElementById('diag-publicado').value = d.publicado === false ? '0' : '1';
  document.getElementById('diag-instruccional').value = d.instruccional_id || '';
  document.getElementById('diag-enciclopedia').value = d.enciclopedia_ref || '';
  diagGraphDraft = d.grafo || { nodes: [], edges: [] };
  const badge = document.getElementById('diag-edit-badge');
  const formTitle = document.getElementById('diag-form-title');
  if (badge) badge.style.display = '';
  if (formTitle) formTitle.textContent = 'Editar diagrama';
  showSection('diagramas');
  requestAnimationFrame(() => {
    initDiagCanvasEditor();
    if (diagCanvasEditor) diagCanvasEditor.loadData(diagGraphDraft);
  });
};

window.deleteDiag = async id => {
  if (!confirm('¿Eliminar este diagrama?')) return;
  try {
    const res = await fetch(`${API}/profesor/diagramas/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profesor_id: profesor.id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    store.diagramas = store.diagramas.filter(d => d.id !== id);
    renderDiagList();
    refreshSidebarCounters();
    if (diagEditingId === id) resetDiagForm();
  } catch (e) {
    alert(e.message || 'No se pudo eliminar');
  }
};

/* ══════════════════════════════════════════════
   ESTADÍSTICAS — visualizaciones
══════════════════════════════════════════════ */
const VISTAS_CHART_PALETTE = ['#5B8DEF','#F0A500','#34D399','#F87171','#A78BFA','#38BDF8'];
const VISTAS_TIPO_LABELS   = { video: 'Videos', imagen: 'Imágenes', instruccional: 'Instruccionales' };

let estadisticasData   = null; // última respuesta de /api/profesor/estadisticas
let chartVistasTiempo  = null;
let chartVistasTipo    = null;

function initEstadisticas() {
  document.getElementById('estadisticas-rango')?.addEventListener('change', () => loadEstadisticas());
  document.getElementById('top-contenido-tipo')?.addEventListener('change', () => renderTopContenido());
}

async function renderEstadisticas() {
  setTextSafe('stat-videos', store.videos.length);
  setTextSafe('stat-imagenes', store.imagenes.length);
  setTextSafe('stat-inst', store.instruccionales.length);
  await loadEstadisticas();
}

async function loadEstadisticas() {
  const rango = document.getElementById('estadisticas-rango')?.value || '30';
  const list  = document.getElementById('top-contenido-list');

  try {
    const res  = await fetch(`${API}/profesor/estadisticas?profesor_id=${profesor.id}&dias=${rango}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudieron cargar las estadísticas');

    estadisticasData = data;
    const r = data.resumen;

    setTextSafe('stat-vistas-totales', r.vistas_totales);
    setTextSafe('stat-seguidores', r.seguidores);
    setTextSafe('hero-alumnos', r.seguidores);
    setTextSafe('stat-videos', r.total_videos);
    setTextSafe('stat-imagenes', r.total_imagenes);
    setTextSafe('stat-inst', r.total_instruccionales);
    setTextSafe('stat-videos-vistas', `👁️ ${r.vistas_videos} visualizaci${r.vistas_videos === 1 ? 'ón' : 'ones'}`);
    setTextSafe('stat-imagenes-vistas', `👁️ ${r.vistas_imagenes} visualizaci${r.vistas_imagenes === 1 ? 'ón' : 'ones'}`);
    setTextSafe('stat-inst-vistas', `👁️ ${r.vistas_instruccionales} visualizaci${r.vistas_instruccionales === 1 ? 'ón' : 'ones'}`);

    renderChartVistasTiempo(data.serie_diaria);
    renderChartVistasTipo(r);
    renderTopContenido();
  } catch (error) {
    console.warn('Error cargando estadísticas:', error);
    if (list) list.innerHTML = `<p class="error-state">${esc(error.message || 'Error al cargar estadísticas')}</p>`;
  }
}

function renderChartVistasTiempo(serie) {
  const canvas = document.getElementById('chart-vistas-tiempo');
  const empty  = document.getElementById('chart-vistas-tiempo-empty');
  if (!canvas) return;

  const hasData = Array.isArray(serie) && serie.some(d => (d.total || 0) > 0);
  canvas.style.display = hasData ? '' : 'none';
  empty?.classList.toggle('hidden', hasData);
  if (!hasData) {
    if (chartVistasTiempo) { chartVistasTiempo.destroy(); chartVistasTiempo = null; }
    return;
  }

  const labels = serie.map(d => new Date(d.fecha).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' }));

  if (chartVistasTiempo) chartVistasTiempo.destroy();
  chartVistasTiempo = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Videos',         data: serie.map(d => d.video || 0),         borderColor: VISTAS_CHART_PALETTE[0], backgroundColor: 'transparent', tension: 0.3 },
        { label: 'Imágenes',       data: serie.map(d => d.imagen || 0),        borderColor: VISTAS_CHART_PALETTE[1], backgroundColor: 'transparent', tension: 0.3 },
        { label: 'Instruccionales',data: serie.map(d => d.instruccional || 0), borderColor: VISTAS_CHART_PALETTE[2], backgroundColor: 'transparent', tension: 0.3 },
        { label: 'Total',          data: serie.map(d => d.total || 0),         borderColor: '#e8e8f0', backgroundColor: 'rgba(230,57,70,0.08)', borderWidth: 2, fill: true, tension: 0.3 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#cfcfe6', boxWidth: 14 } } },
      scales: {
        x: { ticks: { color: '#aaa', autoSkip: true, maxRotation: 0 }, grid: { color: 'rgba(255,255,255,0.06)' } },
        y: { beginAtZero: true, ticks: { color: '#aaa', precision: 0 }, grid: { color: 'rgba(255,255,255,0.06)' } },
      },
    },
  });
}

function renderChartVistasTipo(resumen) {
  const canvas = document.getElementById('chart-vistas-tipo');
  const empty  = document.getElementById('chart-vistas-tipo-empty');
  if (!canvas) return;

  const values = [resumen.vistas_videos, resumen.vistas_imagenes, resumen.vistas_instruccionales];
  const hasData = values.some(v => v > 0);
  canvas.style.display = hasData ? '' : 'none';
  empty?.classList.toggle('hidden', hasData);
  if (!hasData) {
    if (chartVistasTipo) { chartVistasTipo.destroy(); chartVistasTipo = null; }
    return;
  }

  if (chartVistasTipo) chartVistasTipo.destroy();
  chartVistasTipo = new Chart(canvas.getContext('2d'), {
    type: 'pie',
    data: {
      labels: ['Videos','Imágenes','Instruccionales'],
      datasets: [{ data: values, backgroundColor: VISTAS_CHART_PALETTE.slice(0,3), borderWidth: 1 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: '#cfcfe6', boxWidth: 14 } } },
    },
  });
}

function renderTopContenido() {
  const list = document.getElementById('top-contenido-list');
  if (!list) return;

  const filtro = document.getElementById('top-contenido-tipo')?.value || 'todos';

  if (!estadisticasData) {
    list.innerHTML = '<p class="empty-state-msg">Las estadísticas estarán disponibles una vez tengas contenido publicado.</p>';
    return;
  }

  const all = [
    ...estadisticasData.videos.map(v => ({
      tipo: 'video', icon: '🎬', title: v.titulo,
      meta: `Video · ${v.categoria || 'Sin categoría'} · ${v.dificultad || '—'}`,
      vistas: v.vistas || 0,
    })),
    ...estadisticasData.imagenes.map(i => ({
      tipo: 'imagen', icon: '🖼️', title: i.titulo,
      meta: `Imagen · ${i.tipo || 'Sin tipo'}`,
      vistas: i.vistas || 0,
    })),
    ...estadisticasData.instruccionales.map(i => ({
      tipo: 'instruccional', icon: '📚', title: i.titulo,
      meta: `Instruccional · ${i.nivel || '—'} · ${i.categoria || '—'}`,
      vistas: i.vistas || 0,
    })),
  ];

  const filtered = (filtro === 'todos' ? all : all.filter(item => item.tipo === filtro))
    .sort((a, b) => b.vistas - a.vistas);

  if (filtered.length === 0) {
    list.innerHTML = '<p class="empty-state-msg">Las estadísticas estarán disponibles una vez tengas contenido publicado.</p>';
    return;
  }

  list.innerHTML = filtered.map(item => `
    <div class="media-item">
      <span class="media-item-icon">${item.icon}</span>
      <div class="media-item-body">
        <p class="media-item-title">${esc(item.title)}</p>
        <p class="media-item-meta">${esc(item.meta)}</p>
      </div>
      <div class="media-item-actions">
        <span class="media-tag" style="white-space:nowrap;font-weight:600">👁️ ${item.vistas}</span>
      </div>
    </div>
  `).join('');
}

/* ══════════════════════════════════════════════
   LOGOUT
══════════════════════════════════════════════ */
function initLogout() {
  const btn = document.getElementById('logout-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    localStorage.removeItem('lutaedanca_user');
    localStorage.removeItem('currentUser');
    sessionStorage.removeItem('lutaedanca_user');
    window.location.href = 'login.html';
  });
}

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
function showFeedback(el, type, msg) {
  if (!el) return;
  el.textContent = msg;
  el.className = `feedback-msg ${type}`;
  el.classList.remove('hidden');
  if (type === 'success') setTimeout(() => hideFeedback(el), 4000);
}

function hideFeedback(el) {
  if (!el) return;
  el.classList.add('hidden');
  el.textContent = '';
}

function parseHashtags(str) {
  return str.match(/#([A-Za-z0-9_áéíóúÁÉÍÓÚñÑ]+)/g)
    ?.map(t => t.slice(1).toLowerCase()) || [];
}

function simulateProgress(wrapperId, barId, onDone) {
  const wrap = document.getElementById(wrapperId);
  const bar  = document.getElementById(barId);
  if (!wrap || !bar) { onDone(); return; }
  wrap.classList.remove('hidden');
  let p = 0;
  const interval = setInterval(() => {
    p += Math.random() * 18 + 5;
    if (p >= 100) {
      p = 100;
      bar.style.width = '100%';
      clearInterval(interval);
      setTimeout(() => {
        wrap.classList.add('hidden');
        bar.style.width = '0%';
        onDone();
      }, 400);
    } else {
      bar.style.width = `${p}%`;
    }
  }, 120);
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ══════════════════════════════════════════════
   PERFIL + MODERADOR
══════════════════════════════════════════════ */

// Se llama una vez en DOMContentLoaded para registrar los listeners
function initPerfil() {

  // ── Guardar cambios de perfil ───────────────
  document.getElementById('perfil-save-btn')?.addEventListener('click', async () => {
    const nombre           = document.getElementById('perfil-nombre').value.trim();
    const email            = document.getElementById('perfil-email').value.trim();
    const passwordActual   = document.getElementById('perfil-password-actual').value;
    const passwordNueva    = document.getElementById('perfil-password-nueva').value;
    const fb = document.getElementById('perfil-feedback');

    if (!nombre || !email || !passwordActual) {
      showFeedback(fb, 'error', 'Nombre, email y contraseña actual son obligatorios.');
      return;
    }

    try {
      const res = await fetch('/api/mod/perfil', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id:         profesor.id,
          nombre,
          email,
          password_actual: passwordActual,
          password_nueva:  passwordNueva || null,
        }),
      });
      const data = await res.json();

      if (data.success) {
        // Actualizar sesión local con los nuevos datos
        const updated = { ...profesor, nombre: data.user.nombre, email: data.user.email };
        localStorage.setItem('lutaedanca_user', JSON.stringify(updated));
        localStorage.setItem('currentUser',     JSON.stringify(updated));
        // Reflejar en sidebar sin recargar
        setTextSafe('profesor-name',  updated.nombre);
        setTextSafe('profesor-meta',  `@${updated.email.split('@')[0]}`);
        setTextSafe('dashboard-title',`Hola, ${updated.nombre.split(' ')[0]}`);
        // Actualizar panel de info
        renderPerfilInfo(updated);
        showFeedback(fb, 'success', '✅ Perfil actualizado correctamente.');
        document.getElementById('perfil-password-actual').value = '';
        document.getElementById('perfil-password-nueva').value  = '';
      } else {
        showFeedback(fb, 'error', data.message || 'Error al guardar.');
      }
    } catch (e) {
      showFeedback(fb, 'error', 'Error de conexión con el servidor.');
    }
  });

  // ── Convertirse en moderador ────────────────
  document.getElementById('mod-register-btn')?.addEventListener('click', async () => {
    const codigo = document.getElementById('mod-codigo').value.trim();
    const fb     = document.getElementById('mod-register-feedback');

    if (!codigo) {
      showFeedback(fb, 'error', 'Ingresa el código de autorización.');
      return;
    }

    const btn = document.getElementById('mod-register-btn');
    btn.disabled = true;
    btn.textContent = 'Verificando…';

    try {
      const res = await fetch('/api/register-moderador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: profesor.id, codigo }),
      });
      const data = await res.json();

      if (data.success) {
        // Actualizar sesión con el nuevo rol
        const updated = { ...profesor, rol: 'moderador' };
        localStorage.setItem('lutaedanca_user', JSON.stringify(updated));
        localStorage.setItem('currentUser',     JSON.stringify(updated));
        showFeedback(fb, 'success', '✅ Cuenta convertida a moderador. Redirigiendo…');
        setTimeout(() => { window.location.href = 'moderador-dashboard.html'; }, 1800);
      } else {
        showFeedback(fb, 'error', data.message || 'Código incorrecto.');
        btn.disabled = false;
        btn.textContent = '🛡️ Convertirme en moderador';
      }
    } catch (e) {
      showFeedback(fb, 'error', 'Error de conexión con el servidor.');
      btn.disabled = false;
      btn.textContent = '🛡️ Convertirme en moderador';
    }
  });
}
/* ════════════════════════════════════════════════
   (initLogout ya definido arriba)
════════════════════════════════════════════════ */

// Se llama cada vez que se navega a la sección perfil
function initPerfilSection() {
  const user = JSON.parse(
    localStorage.getItem('lutaedanca_user') ||
    localStorage.getItem('currentUser')
  ) || profesor;

  document.getElementById('perfil-nombre').value = user.nombre || '';
  document.getElementById('perfil-email').value  = user.email  || '';
  document.getElementById('perfil-password-actual').value = '';
  document.getElementById('perfil-password-nueva').value  = '';
  document.getElementById('mod-codigo').value             = '';

  renderPerfilInfo(user);
}

function renderPerfilInfo(user) {
  setTextSafe('perfil-info-nombre', user.nombre    || '—');
  setTextSafe('perfil-info-email',  user.email     || '—');
  setTextSafe('perfil-info-estado', user.estado    || '—');
  setTextSafe('perfil-info-desde',  fmtDate(user.creado_en));
}

/* ══════════════════════════════════════════════
   SISTEMA DE COMENTARIOS CON RESPUESTAS
══════════════════════════════════════════════ */

// Estado del modal
const comState = {
  tipo:        null,   // 'video' | 'instruccional' | 'imagen'
  contenidoId: null,
  titulo:      null,
  parentId:    null,   // null = comentario raíz; número = reply
  parentAutor: null,
  comentarios: [],     // árbol en memoria
};

/* ── Abrir modal ────────────────────────────────── */
window.abrirComentarios = async function(tipo, contenidoId, titulo) {
  comState.tipo        = tipo;
  comState.contenidoId = contenidoId;
  comState.titulo      = titulo;
  comState.parentId    = null;
  comState.parentAutor = null;

  document.getElementById('com-modal-eyebrow').textContent =
    tipo === 'video' ? '🎬 Video' : tipo === 'instruccional' ? '📚 Instruccional' : '🖼️ Imagen';
  document.getElementById('com-modal-title').textContent = titulo;

  const myAvatar = document.getElementById('com-my-avatar');
  if (myAvatar) myAvatar.textContent = (profesor?.nombre || '?')[0].toUpperCase();

  resetReplyBanner();
  document.getElementById('com-input').value = '';
  document.getElementById('com-char-left').textContent = '2000';
  document.getElementById('com-feedback')?.classList.add('hidden');

  const overlay = document.getElementById('comentarios-modal-overlay');
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  await cargarComentarios();
  document.getElementById('com-input')?.focus();
};

/* ── Cerrar modal ───────────────────────────────── */
function cerrarComentariosModal() {
  document.getElementById('comentarios-modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  comState.tipo = null;
  comState.contenidoId = null;
}

/* ── Cargar y renderizar comentarios ────────────── */
async function cargarComentarios() {
  const thread = document.getElementById('com-thread');
  thread.innerHTML = '<p class="com-loading">Cargando…</p>';

  try {
    const res  = await fetch(`${API}/contenido/${comState.tipo}/${comState.contenidoId}/comentarios`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    comState.comentarios = data.comentarios || [];
    renderThread();
  } catch (err) {
    thread.innerHTML = `<p class="com-empty" style="color:#e63946">Error: ${esc(err.message)}</p>`;
  }
}

/* ── Renderizar hilo completo ────────────────────── */
function renderThread() {
  const thread   = document.getElementById('com-thread');
  const emptyMsg = document.getElementById('com-empty-msg');

  if (comState.comentarios.length === 0) {
    thread.innerHTML = '<p class="com-empty">Aún no hay comentarios. ¡Sé el primero!</p>';
    return;
  }

  thread.innerHTML = comState.comentarios.map(c => renderComentarioHTML(c, false)).join('');
}

function avatarLetra(nombre) {
  return (nombre || '?')[0].toUpperCase();
}

function rolBadge(rol) {
  if (rol === 'profesor')  return '<span class="com-rol-badge prof">Profesor</span>';
  if (rol === 'moderador') return '<span class="com-rol-badge mod">Mod</span>';
  return '';
}

function renderComentarioHTML(c, esReply) {
  const esPropio = c.usuario_id === profesor?.id;
  const esDueño  = comState.tipo && c.usuario_id === profesor?.id; // el profesor ve su botón siempre
  const puedeEliminar = c.usuario_id === profesor?.id;

  const repliesHTML = (c.replies || []).map(r => renderComentarioHTML(r, true)).join('');

  return `
    <div class="com-item ${esReply ? 'com-reply' : 'com-root'}" data-id="${c.id}">
      <div class="com-avatar com-avatar-sm">${avatarLetra(c.autor_nombre)}</div>
      <div class="com-item-body">
        <div class="com-item-header">
          <span class="com-autor">${esc(c.autor_nombre)}</span>
          ${rolBadge(c.autor_rol)}
          <span class="com-fecha">${fmtDate(c.creado_en)}</span>
          ${puedeEliminar ? `<button class="com-del-btn" onclick="eliminarComentario(${c.id})" title="Eliminar">🗑</button>` : ''}
        </div>
        <p class="com-mensaje">${esc(c.mensaje).replace(/\n/g, '<br>')}</p>
        ${!esReply ? `<button class="com-reply-btn" onclick="iniciarReply(${c.id}, ${JSON.stringify(esc(c.autor_nombre))})">↩ Responder</button>` : ''}
      </div>
    </div>
    ${repliesHTML ? `<div class="com-replies-wrap">${repliesHTML}</div>` : ''}
  `;
}

/* ── Iniciar respuesta a un comentario ──────────── */
window.iniciarReply = function(parentId, autorNombre) {
  comState.parentId    = parentId;
  comState.parentAutor = autorNombre;

  const banner = document.getElementById('com-reply-banner');
  const label  = document.getElementById('com-reply-label');
  banner.classList.remove('hidden');
  label.textContent = `Respondiendo a @${autorNombre}`;

  document.getElementById('com-input').focus();
};

function resetReplyBanner() {
  comState.parentId    = null;
  comState.parentAutor = null;
  document.getElementById('com-reply-banner')?.classList.add('hidden');
}

/* ── Enviar comentario / respuesta ──────────────── */
async function enviarComentario() {
  const input    = document.getElementById('com-input');
  const feedback = document.getElementById('com-feedback');
  const sendBtn  = document.getElementById('com-send-btn');
  const mensaje  = (input?.value || '').trim();

  if (!mensaje) return;

  sendBtn.disabled    = true;
  sendBtn.textContent = '…';

  try {
    const res  = await fetch(
      `${API}/contenido/${comState.tipo}/${comState.contenidoId}/comentarios`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          usuario_id: profesor.id,
          mensaje,
          parent_id:  comState.parentId,
        }),
      }
    );
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    // Insertar el nuevo comentario en el árbol local sin recargar
    const nuevo = data.comentario;
    if (nuevo.parent_id) {
      const padre = comState.comentarios.find(c => c.id === nuevo.parent_id);
      if (padre) padre.replies.push(nuevo);
    } else {
      comState.comentarios.push(nuevo);
    }

    renderThread();
    input.value = '';
    document.getElementById('com-char-left').textContent = '2000';
    resetReplyBanner();
    feedback?.classList.add('hidden');

    // Scroll al nuevo comentario
    document.getElementById(`com-item-${nuevo.id}`)?.scrollIntoView({ behavior: 'smooth' });
    const thread = document.getElementById('com-thread');
    thread.scrollTop = thread.scrollHeight;

  } catch (err) {
    if (feedback) {
      feedback.textContent = err.message || 'Error al enviar';
      feedback.className   = 'feedback-msg error';
      feedback.classList.remove('hidden');
    }
  } finally {
    sendBtn.disabled    = false;
    sendBtn.textContent = 'Enviar';
  }
}

/* ── Eliminar comentario ────────────────────────── */
window.eliminarComentario = async function(comentarioId) {
  if (!confirm('¿Eliminar este comentario? Sus respuestas también se borrarán.')) return;

  try {
    const res  = await fetch(
      `${API}/contenido/comentarios/${comentarioId}?usuario_id=${profesor.id}`,
      { method: 'DELETE' }
    );
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    // Quitar del árbol local
    comState.comentarios = comState.comentarios.filter(c => c.id !== comentarioId);
    comState.comentarios.forEach(c => {
      c.replies = (c.replies || []).filter(r => r.id !== comentarioId);
    });
    renderThread();
  } catch (err) {
    alert('No se pudo eliminar: ' + err.message);
  }
};

/* ── Listeners del modal ────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('com-close-btn')?.addEventListener('click', cerrarComentariosModal);

  document.getElementById('comentarios-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarComentariosModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') cerrarComentariosModal();
  });

  document.getElementById('com-reply-cancel')?.addEventListener('click', () => {
    resetReplyBanner();
    document.getElementById('com-input')?.focus();
  });

  const input = document.getElementById('com-input');
  input?.addEventListener('input', () => {
    const left = 2000 - (input.value || '').length;
    document.getElementById('com-char-left').textContent = Math.max(0, left);
  });

  // Enviar con Ctrl+Enter o Cmd+Enter
  input?.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      enviarComentario();
    }
  });

  document.getElementById('com-send-btn')?.addEventListener('click', enviarComentario);
});