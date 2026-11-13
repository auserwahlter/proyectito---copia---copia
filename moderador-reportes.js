(() => {
  const PAGE_SIZE = 100;
  const COLORS = [
    '#5B8DEF', '#F0A500', '#34D399', '#F87171', '#A78BFA',
    '#38BDF8', '#FB923C', '#4ADE80', '#F472B6', '#94A3B8',
    '#FBBF24', '#22D3EE',
  ];
  let reportData = null;
  let reportChart = null;
  let chartType = 'pie';
  let initialized = false;
  let downloadBlob = null;
  let downloadName = '';

  async function getAllPages(url, pageSize = PAGE_SIZE) {
    const items = [];
    let page = 1;
    let pages = 1;
    do {
      const separator = url.includes('?') ? '&' : '?';
      const data = await API.get(`${url}${separator}page=${page}&limit=${pageSize}`);
      const currentItems = data.items || [];
      items.push(...currentItems);
      pages = data.pagination
        ? data.pagination.pages
        : currentItems.length === pageSize ? page + 1 : page;
      page += 1;
    } while (page <= pages);
    return items;
  }

  async function refreshReportData() {
    const [usuarios, videos, imagenes, instruccionales, diagramas, posts, stats] = await Promise.all([
      getAllPages('/api/mod/usuarios'),
      getAllPages('/api/contenido/video'),
      getAllPages('/api/contenido/imagen'),
      getAllPages('/api/contenido/instruccional'),
      getAllPages('/api/contenido/diagrama'),
      getAllPages('/api/foro', 50),
      API.get('/api/mod/estadisticas/diagramas'),
    ]);

    const usersById = new Map(usuarios.map(user => [String(user.id), user.nombre]));
    const diagramStats = new Map((stats.estadisticas || []).map(item => [String(item.id), item]));
    const byAuthor = items => items.map(item => ({
      ...item,
      profesor_nombre: usersById.get(String(item.autor_id)) || `Miembro ${item.autor_id}`,
    }));

    reportData = {
      usuarios,
      videos: byAuthor(videos),
      imagenes: byAuthor(imagenes),
      instruccionales: byAuthor(instruccionales),
      diagramas: byAuthor(diagramas).map(item => ({
        ...item,
        ...diagramStats.get(String(item.id)),
        tipo: item.tipo,
      })),
      posts,
    };
  }

  function parseGraph(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch (_error) { return {}; }
  }

  function countBy(items, key, fallback = '—') {
    return items.reduce((counts, item) => {
      const value = item[key] || fallback;
      counts[value] = (counts[value] || 0) + 1;
      return counts;
    }, {});
  }

  function chartDataset(metric) {
    const d = reportData;
    switch (metric) {
      case 'usuarios_rol': {
        const counts = countBy(d.usuarios, 'rol');
        return { labels: Object.keys(counts), values: Object.values(counts), title: 'Usuarios por rol' };
      }
      case 'usuarios_estado': {
        const counts = countBy(d.usuarios, 'estado', 'pendiente');
        return { labels: Object.keys(counts), values: Object.values(counts), title: 'Usuarios por estado' };
      }
      case 'alumnos_rango': {
        const members = d.usuarios.filter(user => user.rol === 'miembro');
        const counts = countBy(members, 'rango', 'Sin rango');
        return { labels: Object.keys(counts), values: Object.values(counts), title: 'Miembros por rango' };
      }
      case 'contenido_tipo':
        return {
          labels: ['Videos', 'Imágenes', 'Instruccionales', 'Diagramas'],
          values: [d.videos.length, d.imagenes.length, d.instruccionales.length, d.diagramas.length],
          title: 'Contenido por tipo',
        };
      case 'videos_dificultad': {
        const counts = countBy(d.videos, 'dificultad', 'Sin definir');
        return { labels: Object.keys(counts), values: Object.values(counts), title: 'Videos por dificultad' };
      }
      case 'contenido_por_profesor': {
        const totals = {};
        [...d.videos, ...d.imagenes, ...d.instruccionales, ...d.diagramas].forEach(item => {
          const author = item.profesor_nombre || `Miembro ${item.autor_id}`;
          totals[author] = (totals[author] || 0) + 1;
        });
        const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 10);
        return { labels: top.map(item => item[0]), values: top.map(item => item[1]), title: 'Contenido por creador (top 10)' };
      }
      case 'foro_actividad':
        return {
          labels: ['Publicaciones', 'Me gusta', 'Respuestas'],
          values: [
            d.posts.length,
            d.posts.reduce((sum, post) => sum + Number(post.likes_count || 0), 0),
            d.posts.reduce((sum, post) => sum + Number(post.respuestas_count || 0), 0),
          ],
          title: 'Actividad del foro',
        };
      case 'resumen_general':
        return {
          labels: ['Miembros', 'Moderadores', 'Administradores', 'Videos', 'Imágenes', 'Instruccionales', 'Diagramas', 'Posts del foro'],
          values: [
            d.usuarios.filter(user => user.rol === 'miembro').length,
            d.usuarios.filter(user => user.rol === 'moderador').length,
            d.usuarios.filter(user => user.rol === 'admin').length,
            d.videos.length, d.imagenes.length, d.instruccionales.length, d.diagramas.length, d.posts.length,
          ],
          title: 'Resumen general de la plataforma',
        };
      case 'registros_por_mes': {
        const counts = {};
        d.usuarios.forEach(user => {
          if (!user.creado_en) return;
          const date = new Date(user.creado_en);
          if (Number.isNaN(date.getTime())) return;
          const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          counts[month] = (counts[month] || 0) + 1;
        });
        const labels = Object.keys(counts).sort();
        return { labels, values: labels.map(label => counts[label]), title: 'Registros de usuarios por mes', timeSeries: true };
      }
      default:
        return { labels: [], values: [], title: '' };
    }
  }

  function drawChart() {
    const canvas = document.getElementById('report-chart');
    const empty = document.getElementById('chart-empty-msg');
    if (!canvas || !empty || !reportData) return;
    const { labels, values, title, timeSeries } = chartDataset(document.getElementById('chart-metric').value);
    const hasData = values.some(value => value > 0);
    empty.style.display = hasData ? 'none' : '';
    canvas.style.display = hasData ? '' : 'none';
    if (reportChart) {
      reportChart.destroy();
      reportChart = null;
    }
    if (!hasData) return;
    if (typeof Chart === 'undefined') {
      empty.textContent = 'No se pudo cargar Chart.js. Revisa la conexión e intenta actualizar la página.';
      empty.style.display = '';
      canvas.style.display = 'none';
      return;
    }

    const type = chartType;
    reportChart = new Chart(canvas.getContext('2d'), {
      type,
      data: {
        labels,
        datasets: [{
          label: title,
          data: values,
          backgroundColor: type === 'line' ? 'rgba(91,141,239,.2)' : labels.map((_, index) => COLORS[index % COLORS.length]),
          borderColor: type === 'line' ? '#5B8DEF' : labels.map((_, index) => COLORS[index % COLORS.length]),
          borderWidth: type === 'line' ? 2 : 1,
          fill: type === 'line',
          tension: type === 'line' ? 0.3 : 0,
          pointRadius: type === 'line' ? 4 : 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: title, color: '#f1f1f1' },
          legend: { display: type === 'pie', position: 'right', labels: { color: '#d0d0d0' } },
          tooltip: { mode: 'index', intersect: false },
        },
        scales: type === 'pie' ? {} : {
          x: {
            ticks: { color: '#aaa', autoSkip: false, maxRotation: timeSeries ? 0 : 40 },
            grid: { color: 'rgba(255,255,255,.06)' },
          },
          y: { beginAtZero: true, ticks: { color: '#aaa', precision: 0 }, grid: { color: 'rgba(255,255,255,.06)' } },
        },
      },
    });
  }

  function escapeHtml(value) {
    return API.esc(value == null ? '' : String(value));
  }

  function renderPreview(headers, rows) {
    const wrap = document.getElementById('report-preview-wrap');
    if (!rows.length) {
      wrap.innerHTML = '<p class="span-mut">El reporte no contiene registros.</p>';
      return;
    }
    wrap.innerHTML = `<table class="tabla"><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
      <tbody>${rows.slice(0, 50).map(row => `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      ${rows.length > 50 ? `<p class="span-mut">Mostrando 50 de ${rows.length} filas. La descarga incluye todos los registros.</p>` : ''}`;
  }

  function reportFor(type) {
    const d = reportData;
    if (type === 'usuarios') {
      const role = document.getElementById('reporte-usuarios-rol').value;
      const state = document.getElementById('reporte-usuarios-estado').value;
      const users = d.usuarios.filter(user => (!role || user.rol === role) && (!state || user.estado === state));
      const rows = users.map(user => ({
        id: user.id, nombre: user.nombre, email: user.email, rol: user.rol,
        estado: user.estado || '—', rango: user.rango || '—', creado_en: user.creado_en || '—',
      }));
      return { data: rows, headers: ['ID', 'Nombre', 'Email', 'Rol', 'Estado', 'Rango', 'Registro'], tableRows: rows.map(user => Object.values(user)) };
    }
    if (type === 'contenido') {
      const rows = [
        ...d.videos.map(item => ({ tipo: 'video', id: item.id, profesor_id: item.autor_id, titulo: item.titulo, detalle1: item.categoria || '—', detalle2: item.dificultad || '—', hashtags: (item.hashtags || []).join(' '), creado_en: item.creado_en || '—' })),
        ...d.imagenes.map(item => ({ tipo: 'imagen', id: item.id, profesor_id: item.autor_id, titulo: item.titulo, detalle1: item.tipo || '—', detalle2: '—', hashtags: (item.hashtags || []).join(' '), creado_en: item.creado_en || '—' })),
        ...d.instruccionales.map(item => ({ tipo: 'instruccional', id: item.id, profesor_id: item.autor_id, titulo: item.titulo, detalle1: item.nivel || '—', detalle2: item.categoria || '—', hashtags: '—', creado_en: item.creado_en || '—' })),
      ];
      const headers = ['Tipo', 'ID', 'Creador ID', 'Título', 'Detalle 1', 'Detalle 2', 'Hashtags', 'Creado'];
      return { data: rows, headers, tableRows: rows.map(row => Object.values(row)) };
    }
    if (type === 'foro') {
      const rows = d.posts.map(post => ({
        id: post.id, autor: post.autor_nombre || '—', mensaje: (post.mensaje || '').replace(/\n/g, ' '),
        hashtags: (post.hashtags || []).join(' '), likes: post.likes_count || 0,
        respuestas: post.respuestas_count || 0, creado_en: post.creado_en || '—',
      }));
      const headers = ['ID', 'Autor', 'Mensaje (truncado)', 'Hashtags', 'Likes', 'Respuestas', 'Fecha'];
      return { data: rows, headers, tableRows: rows.map(row => [row.id, row.autor, `${row.mensaje.slice(0, 60)}${row.mensaje.length > 60 ? '…' : ''}`, row.hashtags, row.likes, row.respuestas, row.creado_en]) };
    }
    if (type === 'diagramas') {
      const rows = d.diagramas.map(item => {
        const graph = parseGraph(item.nodos);
        return {
          id: item.id, profesor: item.profesor_nombre || item.autor_id, titulo: item.titulo, tipo: item.tipo,
          publicado: item.publicado !== false, vistas: item.vistas || 0, likes: item.likes || 0,
          comentarios: item.comentarios_count || 0,
          nodos: (graph.nodes || graph.nodos || []).length || 0,
          conexiones: (graph.edges || graph.conexiones || []).length || 0,
          creado_en: item.creado_en || '—',
        };
      });
      const headers = ['ID', 'Creador', 'Título', 'Tipo', 'Publicado', 'Vistas', 'Likes', 'Comentarios', 'Nodos', 'Conexiones', 'Creado'];
      return { data: rows, headers, tableRows: rows.map(row => Object.values(row)) };
    }

    const summary = {
      total_usuarios: d.usuarios.length,
      miembros: d.usuarios.filter(user => user.rol === 'miembro').length,
      moderadores: d.usuarios.filter(user => user.rol === 'moderador').length,
      administradores: d.usuarios.filter(user => user.rol === 'admin').length,
      usuarios_activos: d.usuarios.filter(user => user.estado === 'activo').length,
      usuarios_pendientes: d.usuarios.filter(user => user.estado === 'pendiente').length,
      usuarios_suspendidos: d.usuarios.filter(user => user.estado === 'suspendido').length,
      total_videos: d.videos.length, total_imagenes: d.imagenes.length,
      total_instruccionales: d.instruccionales.length, total_diagramas: d.diagramas.length,
      total_posts_foro: d.posts.length,
      total_likes_foro: d.posts.reduce((sum, post) => sum + Number(post.likes_count || 0), 0),
    };
    return {
      data: { generado_en: new Date().toISOString(), resumen: summary },
      headers: ['Métrica', 'Valor'],
      tableRows: Object.entries(summary),
    };
  }

  function csvCell(value) {
    let text = value == null ? '' : String(value);
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function toCsv(headers, rows) {
    return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  }

  async function generateReport(type, format) {
    const title = document.getElementById('report-preview-title');
    const download = document.getElementById('report-download-btn');
    title.textContent = `Generando reporte ${type}…`;
    download.hidden = true;
    await refreshReportData();
    const report = reportFor(type);
    renderPreview(report.headers, report.tableRows);
    title.textContent = `${type.charAt(0).toUpperCase()}${type.slice(1)} · ${format.toUpperCase()}`;
    const isSummary = type === 'general';
    const csvRows = isSummary ? report.tableRows : report.data.map(item => Object.values(item));
    const csvHeaders = isSummary ? report.headers : (report.data.length ? Object.keys(report.data[0]) : report.headers);
    const mime = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
    const content = format === 'csv'
      ? toCsv(csvHeaders, csvRows)
      : JSON.stringify(report.data, null, 2);
    downloadBlob = new Blob([content], { type: mime });
    downloadName = `reporte_${type}_${new Date().toISOString().slice(0, 10)}.${format}`;
    download.textContent = `Descargar ${downloadName}`;
    download.hidden = false;
  }

  function downloadReport() {
    if (!downloadBlob) return;
    const url = URL.createObjectURL(downloadBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.initReportesModerador = async function initReportesModerador() {
    if (!initialized) {
      initialized = true;
      document.querySelectorAll('[data-reporte]').forEach(button => button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await generateReport(button.dataset.reporte, button.dataset.formato);
        } catch (error) {
          API.toast(error.message, 'err');
          document.getElementById('report-preview-title').textContent = 'No se pudo generar el reporte';
        } finally {
          button.disabled = false;
        }
      }));
      document.getElementById('report-download-btn').addEventListener('click', downloadReport);
      document.getElementById('chart-metric').addEventListener('change', drawChart);
      document.getElementById('chart-type-toggle').querySelectorAll('[data-type]').forEach(button => {
        button.addEventListener('click', () => {
          chartType = button.dataset.type;
          document.querySelectorAll('#chart-type-toggle [data-type]').forEach(item => item.classList.toggle('activo', item === button));
          drawChart();
        });
      });
      document.getElementById('chart-download-btn').addEventListener('click', () => {
        if (!reportChart) {
          API.toast('Primero selecciona un gráfico con datos para descargar', 'err');
          return;
        }
        const link = document.createElement('a');
        link.href = reportChart.toBase64Image('image/png', 1);
        link.download = `grafico_${document.getElementById('chart-metric').value}_${new Date().toISOString().slice(0, 10)}.png`;
        link.click();
      });
      document.getElementById('chart-refresh-btn').addEventListener('click', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          await refreshReportData();
          drawChart();
          API.toast('Datos de reportes actualizados', 'ok');
        } catch (error) {
          API.toast(error.message, 'err');
        } finally {
          button.disabled = false;
        }
      });
    }

    await refreshReportData();
    drawChart();
  };
})();
