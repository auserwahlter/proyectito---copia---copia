/* ════════════════════════════════════════════════
   registrar-visualizacion.js
   ───────────────────────────────────────────────
   Snippet para integrar en student-dashboard.js (o donde
   el alumno abra/reproduzca un video, imagen o instruccional).

   Llama a esta función UNA VEZ cuando el alumno abre el
   contenido (al abrir el modal/reproductor, no en cada
   "play" si el usuario pausa y reanuda).
   ════════════════════════════════════════════════ */

/**
 * Registra una visualización en el backend.
 * @param {'video'|'imagen'|'instruccional'} tipo
 * @param {number} contenidoId
 */
async function registrarVisualizacion(tipo, contenidoId) {
  try {
    const user = JSON.parse(
      localStorage.getItem('lutaedanca_user') || localStorage.getItem('currentUser') || 'null'
    );
    await fetch('/api/visualizaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo,
        contenido_id: contenidoId,
        usuario_id: user?.id || null,
      }),
    });
  } catch (e) {
    // Falla silenciosa: no bloquear la reproducción si la red falla.
    console.warn('No se pudo registrar la visualización:', e);
  }
}

/* ── Ejemplos de uso ──────────────────────────────

// 1) Al abrir un video (ej. dentro de un modal de reproducción):
videoElement.addEventListener('play', () => {
  if (!videoElement.dataset.vistaRegistrada) {
    registrarVisualizacion('video', videoId);
    videoElement.dataset.vistaRegistrada = '1';
  }
}, { once: true });

// Alternativa usando el endpoint de detalle (ya incrementa solo):
// fetch(`/api/videos/${videoId}?registrar_vista=1&usuario_id=${user.id}`)

// 2) Al abrir una imagen técnica en grande:
function openImagenModal(imagenId) {
  registrarVisualizacion('imagen', imagenId);
  // ... resto de la lógica para mostrar el modal
}

// 3) Al entrar a un instruccional:
function openInstruccional(instId) {
  registrarVisualizacion('instruccional', instId);
  // ... resto de la lógica
}

──────────────────────────────────────────────── */