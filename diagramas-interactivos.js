/**
 * diagramas-interactivos.js
 * Motor de lienzo interactivo para mapas de conocimiento BJJ.
 * Modos: 'edit' (profesor) | 'view' (estudiante)
 */
(function (global) {
  'use strict';

  const CAT_COLOR = {
    guard: '#4a9eff', pass: '#ff7a45', sweep: '#a8e063',
    submission: '#d97aff', escape: '#ffca45', takedown: '#45e8c8',
    position: '#38bdf8', transition: '#fb7185', concept: '#a3e635',
  };

  const CAT_LABELS = {
    guard: 'Guardia', pass: 'Pase', sweep: 'Barrida',
    submission: 'Sumisión', escape: 'Escape', takedown: 'Derribo',
    position: 'Posición', transition: 'Transición', concept: 'Concepto',
  };

  let _uid = 0;
  function uid(prefix) { return `${prefix}-${++_uid}-${Date.now().toString(36)}`; }

  class DiagramCanvas {
    constructor(hostEl, options = {}) {
      this.host = hostEl;
      this.mode = options.mode || 'view';
      this.onChange = options.onChange || null;
      this.onNodeSelect = options.onNodeSelect || null;
      this.data = { nodes: [], edges: [] };
      this.selectedNodeId = null;
      this.connectFrom = null;
      this.connectMode = false;
      this.draggingNode = null;
      this.panning = false;
      this.lastX = 0;
      this.lastY = 0;
      this.camX = 0;
      this.camY = 0;
      this.scale = 1;
      this.hoveredNode = null;
      this.W = 0;
      this.H = 0;
      this.initialized = false;
      this._buildDOM();
    }

    _buildDOM() {
      this.host.innerHTML = '';
      this.host.classList.add('di-wrap');

      const toolbar = document.createElement('div');
      toolbar.className = 'di-toolbar';
      toolbar.innerHTML = this.mode === 'edit'
        ? `<button type="button" class="di-btn primary" data-action="add-node">+ Nodo</button>
           <button type="button" class="di-btn" data-action="connect">🔗 Conectar</button>
           <button type="button" class="di-btn" data-action="delete">🗑️ Eliminar</button>
           <span class="di-spacer"></span>
           <button type="button" class="di-btn" data-action="zoom-in">+</button>
           <button type="button" class="di-btn" data-action="zoom-out">−</button>
           <button type="button" class="di-btn" data-action="reset">⊙</button>
           <span class="di-hint">Arrastra nodos · Rueda = zoom</span>`
        : `<span class="di-hint">Clic en un nodo para ver detalles · Arrastra para mover el lienzo</span>
           <span class="di-spacer"></span>
           <button type="button" class="di-btn" data-action="zoom-in">+</button>
           <button type="button" class="di-btn" data-action="zoom-out">−</button>
           <button type="button" class="di-btn" data-action="reset">⊙</button>`;
      this.host.appendChild(toolbar);
      this.toolbar = toolbar;

      const body = document.createElement('div');
      body.className = 'di-body';

      const canvasWrap = document.createElement('div');
      canvasWrap.className = 'di-canvas-wrap';
      this.canvas = document.createElement('canvas');
      this.minimap = document.createElement('canvas');
      this.minimap.className = 'di-minimap';
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'di-tooltip';
      canvasWrap.appendChild(this.canvas);
      canvasWrap.appendChild(this.minimap);
      canvasWrap.appendChild(this.tooltip);
      body.appendChild(canvasWrap);
      this.wrap = canvasWrap;
      this.ctx = this.canvas.getContext('2d');
      this.mctx = this.minimap.getContext('2d');

      const panel = document.createElement('aside');
      panel.className = 'di-sidepanel' + (this.mode === 'view' ? '' : '');
      panel.innerHTML = `<div class="di-panel-head"><h4 id="di-panel-title">—</h4><p id="di-panel-sub">Selecciona un nodo</p></div>
        <div class="di-panel-body" id="di-panel-body"><p class="di-node-empty">Haz clic en un nodo del lienzo.</p></div>`;
      body.appendChild(panel);
      this.panel = panel;
      this.panelTitle = panel.querySelector('#di-panel-title');
      this.panelSub = panel.querySelector('#di-panel-sub');
      this.panelBody = panel.querySelector('#di-panel-body');

      this.host.appendChild(body);
      toolbar.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        this._handleAction(btn.dataset.action, btn);
      });
    }

    loadData(data) {
      const src = data || { nodes: [], edges: [] };
      this.data = {
        nodes: (src.nodes || []).map(n => ({ ...n })),
        edges: (src.edges || []).map(e => ({ ...e })),
      };
      this.nodeMap = {};
      this.data.nodes.forEach(n => { this.nodeMap[n.id] = n; });
      if (this.initialized) this._drawLoop();
    }

    getData() {
      return JSON.parse(JSON.stringify(this.data));
    }

    init() {
      const w = this.wrap.clientWidth;
      const h = this.wrap.clientHeight;
      if (w === 0 || h === 0) return false;

      this.W = w;
      this.H = h;
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(dpr, dpr);

      this.minimap.width = 120 * dpr;
      this.minimap.height = 80 * dpr;
      this.mctx.setTransform(1, 0, 0, 1, 0, 0);
      this.mctx.scale(dpr, dpr);

      if (!this.initialized) {
        this.initialized = true;
        this._bindEvents();
        this._drawLoop();
      }
      return true;
    }

    destroy() {
      this.initialized = false;
      if (this._ro) this._ro.disconnect();
    }

    observeResize(sectionEl) {
      this._ro = new ResizeObserver(() => {
        if (sectionEl && sectionEl.classList.contains('hidden')) return;
        this.init();
      });
      this._ro.observe(this.wrap);
    }

    _handleAction(action, btn) {
      if (action === 'add-node') this._addNode();
      else if (action === 'connect') {
        this.connectMode = !this.connectMode;
        this.connectFrom = null;
        btn.classList.toggle('active', this.connectMode);
        this.wrap.classList.toggle('connecting', this.connectMode);
      } else if (action === 'delete') this._deleteSelected();
      else if (action === 'zoom-in') this._zoom(1.2);
      else if (action === 'zoom-out') this._zoom(0.85);
      else if (action === 'reset') { this.scale = 1; this.camX = 0; this.camY = 0; }
    }

    _addNode() {
      const id = uid('node');
      const node = {
        id,
        label: 'Nuevo nodo',
        x: -this.camX + (Math.random() * 120 - 60),
        y: -this.camY + (Math.random() * 120 - 60),
        cat: 'position',
        desc: '',
        imagen: '',
        video: '',
      };
      this.data.nodes.push(node);
      this.nodeMap[id] = node;
      this._selectNode(id);
      this._emitChange();
    }

    _deleteSelected() {
      if (!this.selectedNodeId) return;
      const id = this.selectedNodeId;
      this.data.nodes = this.data.nodes.filter(n => n.id !== id);
      this.data.edges = this.data.edges.filter(e => e.from !== id && e.to !== id);
      delete this.nodeMap[id];
      this.selectedNodeId = null;
      this._renderPanel(null);
      this._emitChange();
    }

    _emitChange() {
      if (this.onChange) this.onChange(this.getData());
    }

    _worldToScreen(x, y) {
      return [(x + this.camX) * this.scale + this.W / 2, (y + this.camY) * this.scale + this.H / 2];
    }

    _screenToWorld(sx, sy) {
      return [(sx - this.W / 2) / this.scale - this.camX, (sy - this.H / 2) / this.scale - this.camY];
    }

    _hitTest(wx, wy) {
      for (let i = this.data.nodes.length - 1; i >= 0; i--) {
        const n = this.data.nodes[i];
        const r = n.root ? 28 : 22;
        const dx = n.x - wx, dy = n.y - wy;
        if (dx * dx + dy * dy < r * r * 1.5) return n.id;
      }
      return null;
    }

    _zoom(f) {
      const cx = this.W / 2, cy = this.H / 2;
      const [wx, wy] = this._screenToWorld(cx, cy);
      this.scale = Math.min(3, Math.max(0.2, this.scale * f));
      const [nsx, nsy] = this._worldToScreen(wx, wy);
      this.camX += (cx - nsx) / this.scale;
      this.camY += (cy - nsy) / this.scale;
    }

    _selectNode(id) {
      this.selectedNodeId = id;
      const node = id ? this.nodeMap[id] : null;
      this._renderPanel(node);
      if (this.onNodeSelect) this.onNodeSelect(node);
    }

    _renderPanel(node) {
      if (!node) {
        this.panelTitle.textContent = '—';
        this.panelSub.textContent = this.mode === 'edit' ? 'Selecciona o crea un nodo' : 'Selecciona un nodo';
        this.panelBody.innerHTML = '<p class="di-node-empty">Haz clic en un nodo del lienzo.</p>';
        return;
      }
      this.panelTitle.textContent = node.label || 'Sin título';
      this.panelSub.textContent = CAT_LABELS[node.cat] || node.cat || '';

      if (this.mode === 'edit') {
        this.panelBody.innerHTML = `
          <div class="form-group"><label class="form-label">Título</label>
            <input class="form-input di-f-label" value="${esc(node.label)}" /></div>
          <div class="form-group"><label class="form-label">Descripción</label>
            <textarea class="form-input di-f-desc">${esc(node.desc || '')}</textarea></div>
          <div class="form-group"><label class="form-label">Categoría</label>
            <select class="form-input di-f-cat">${Object.keys(CAT_LABELS).map(k =>
              `<option value="${k}"${node.cat === k ? ' selected' : ''}>${CAT_LABELS[k]}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">URL imagen</label>
            <input class="form-input di-f-img" placeholder="https://..." value="${esc(node.imagen || '')}" /></div>
          <div class="form-group"><label class="form-label">URL video</label>
            <input class="form-input di-f-vid" placeholder="https://..." value="${esc(node.video || '')}" /></div>`;

        const sync = () => {
          node.label = this.panelBody.querySelector('.di-f-label').value;
          node.desc = this.panelBody.querySelector('.di-f-desc').value;
          node.cat = this.panelBody.querySelector('.di-f-cat').value;
          node.imagen = this.panelBody.querySelector('.di-f-img').value.trim();
          node.video = this.panelBody.querySelector('.di-f-vid').value.trim();
          this.panelTitle.textContent = node.label;
          this._emitChange();
        };
        this.panelBody.querySelectorAll('input,textarea,select').forEach(el => {
          el.addEventListener('input', sync);
          el.addEventListener('change', sync);
        });
      } else {
        let html = node.desc ? `<p style="font-size:13px;color:#ccc;line-height:1.5;margin:0 0 12px">${esc(node.desc)}</p>` : '';
        if (node.imagen) {
          html += `<div class="di-media-preview"><img src="${esc(node.imagen)}" alt="" loading="lazy" /></div>`;
        }
        if (node.video) {
          const v = node.video;
          if (/\.(mp4|webm|mov)(\?|$)/i.test(v) || v.startsWith('/uploads/')) {
            html += `<div class="di-media-preview"><video src="${esc(v)}" controls playsinline></video></div>`;
          } else {
            html += `<p style="font-size:12px;margin-top:8px"><a href="${esc(v)}" target="_blank" rel="noopener" style="color:var(--primary,#b91c1c)">Ver video ↗</a></p>`;
          }
        }
        if (!html) html = '<p class="di-node-empty">Sin descripción adicional.</p>';
        this.panelBody.innerHTML = html;
      }
    }

    _bindEvents() {
      this.wrap.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        const rect = this.wrap.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const [wx, wy] = this._screenToWorld(sx, sy);
        const hit = this._hitTest(wx, wy);

        if (this.mode === 'edit' && hit && !this.connectMode) {
          this.draggingNode = hit;
          this._selectNode(hit);
        } else if (hit) {
          this._selectNode(hit);
        } else {
          this.panning = true;
          this.lastX = e.clientX;
          this.lastY = e.clientY;
          this.wrap.classList.add('grabbing');
        }
      });

      window.addEventListener('mousemove', e => {
        const rect = this.wrap.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        if (this.draggingNode) {
          const [wx, wy] = this._screenToWorld(sx, sy);
          const n = this.nodeMap[this.draggingNode];
          if (n) { n.x = wx; n.y = wy; this._emitChange(); }
          return;
        }

        if (this.panning) {
          this.camX += (e.clientX - this.lastX) / this.scale;
          this.camY += (e.clientY - this.lastY) / this.scale;
          this.lastX = e.clientX;
          this.lastY = e.clientY;
          return;
        }

        const [wx, wy] = this._screenToWorld(sx, sy);
        const hit = this._hitTest(wx, wy);
        if (hit !== this.hoveredNode) {
          this.hoveredNode = hit;
          if (hit && this.mode === 'view') {
            const nd = this.nodeMap[hit];
            this.tooltip.textContent = nd.desc || nd.label;
            this.tooltip.style.left = Math.min(sx + 12, this.W - 180) + 'px';
            this.tooltip.style.top = Math.max(sy - 24, 4) + 'px';
            this.tooltip.style.opacity = '1';
          } else {
            this.tooltip.style.opacity = '0';
          }
        }
      });

      window.addEventListener('mouseup', () => {
        if (this.connectMode && this.draggingNode) {
          /* handled on click */
        }
        this.draggingNode = null;
        this.panning = false;
        this.wrap.classList.remove('grabbing');
      });

      this.wrap.addEventListener('click', e => {
        if (this.mode !== 'edit' || !this.connectMode) return;
        const rect = this.wrap.getBoundingClientRect();
        const [wx, wy] = this._screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const hit = this._hitTest(wx, wy);
        if (!hit) return;
        if (!this.connectFrom) {
          this.connectFrom = hit;
        } else if (this.connectFrom !== hit) {
          const exists = this.data.edges.some(ed => ed.from === this.connectFrom && ed.to === hit);
          if (!exists) {
            this.data.edges.push({ from: this.connectFrom, to: hit });
            this._emitChange();
          }
          this.connectFrom = null;
        }
      });

      this.wrap.addEventListener('wheel', e => {
        e.preventDefault();
        const rect = this.wrap.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const [wx, wy] = this._screenToWorld(sx, sy);
        this.scale = Math.min(3, Math.max(0.2, this.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
        const [nsx, nsy] = this._worldToScreen(wx, wy);
        this.camX += (sx - nsx) / this.scale;
        this.camY += (sy - nsy) / this.scale;
      }, { passive: false });

      this.wrap.addEventListener('dblclick', e => {
        if (this.mode !== 'edit') return;
        const rect = this.wrap.getBoundingClientRect();
        const [wx, wy] = this._screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        if (this._hitTest(wx, wy)) return;
        const id = uid('node');
        const node = { id, label: 'Nuevo nodo', x: wx, y: wy, cat: 'position', desc: '', imagen: '', video: '' };
        this.data.nodes.push(node);
        this.nodeMap[id] = node;
        this._selectNode(id);
        this._emitChange();
      });
    }

    _drawLoop() {
      if (!this.initialized) return;
      this._draw();
      requestAnimationFrame(() => this._drawLoop());
    }

    _draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.W, this.H);

      this.data.edges.forEach(e => {
        const a = this.nodeMap[e.from], b = this.nodeMap[e.to];
        if (!a || !b) return;
        const [ax, ay] = this._worldToScreen(a.x, a.y);
        const [bx, by] = this._worldToScreen(b.x, b.y);
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        const dx = bx - ax, dy = by - ay;
        const cx2 = mx - dy * 0.15, cy2 = my + dx * 0.15;

        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(cx2, cy2, bx, by);
        ctx.stroke();
        ctx.restore();
      });

      const t = Date.now() / 1000;
      this.data.nodes.forEach(n => {
        const [sx, sy] = this._worldToScreen(n.x, n.y);
        if (sx < -80 || sx > this.W + 80 || sy < -60 || sy > this.H + 60) return;

        const col = CAT_COLOR[n.cat] || '#888';
        const isSel = n.id === this.selectedNodeId;
        const isHov = n.id === this.hoveredNode;
        const r = n.root ? 28 : 22;
        const scaledR = r * Math.max(0.45, this.scale);

        ctx.save();
        if (isHov || isSel) { ctx.shadowColor = col; ctx.shadowBlur = isSel ? 22 : 14; }

        if (n.root) {
          const pulse = 1 + 0.07 * Math.sin(t * 2);
          ctx.beginPath();
          ctx.arc(sx, sy, scaledR * pulse * 1.35, 0, Math.PI * 2);
          ctx.strokeStyle = col;
          ctx.globalAlpha = 0.15;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        ctx.beginPath();
        ctx.arc(sx, sy, scaledR, 0, Math.PI * 2);
        ctx.fillStyle = '#0f0f0f';
        ctx.fill();
        ctx.strokeStyle = isSel ? '#fff' : col;
        ctx.lineWidth = isSel ? 3 : 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(sx, sy, scaledR * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.globalAlpha = isHov ? 0.95 : 0.55;
        ctx.fill();
        ctx.restore();

        if (this.scale > 0.35) {
          ctx.save();
          ctx.fillStyle = isHov || isSel ? col : '#aaa';
          ctx.font = `${Math.min(11, 10 * this.scale)}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(n.label, sx, sy + scaledR + 12);
          ctx.restore();
        }
      });

      this.mctx.clearRect(0, 0, 120, 80);
      this.mctx.fillStyle = '#0a0a0a';
      this.mctx.fillRect(0, 0, 120, 80);
      const ms = 0.08, ox = 60, oy = 40;
      this.data.nodes.forEach(n => {
        this.mctx.beginPath();
        this.mctx.arc(n.x * ms + ox, n.y * ms + oy, 2.5, 0, Math.PI * 2);
        this.mctx.fillStyle = CAT_COLOR[n.cat] || '#555';
        this.mctx.fill();
      });
    }
  }

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizarGrafo(raw) {
    let src;
    if (raw == null) src = {};
    else if (typeof raw === 'string') {
      const t = raw.trim();
      if (!t) src = {};
      else {
        try { src = JSON.parse(t); }
        catch (_e) { return { nodes: [], edges: [], legacy_text: raw }; }
      }
    } else src = raw;

    const GRID_COLS = 4, GRID_X = 70, GRID_Y = 70, GRID_DX = 180, GRID_DY = 140;

    const rawNodes = src.nodes || src.nodos || [];
    const nodeList = Array.isArray(rawNodes)
      ? rawNodes
      : Object.values(rawNodes).filter(n => n && typeof n === 'object');

    const nodes = (nodeList || []).map((n, i) => {
      const id = n.id != null ? n.id : 'n' + (i + 1);
      return {
        id,
        label: n.label || n.nombre || n.name || String(id),
        cat: n.cat || n.categoria || 'position',
        x: n.x,
        y: n.y,
        desc: n.desc || n.descripcion || '',
        imagen: n.imagen || n.imagen_path || '',
        video: n.video || '',
        root: !!n.root,
      };
    });

    nodes.forEach((n, i) => {
      if (n.x == null || n.y == null || isNaN(n.x) || isNaN(n.y)) {
        const col = i % GRID_COLS, fila = Math.floor(i / GRID_COLS);
        n.x = GRID_X + col * GRID_DX;
        n.y = GRID_Y + fila * GRID_DY;
      }
    });

    let edges = [];
    if (Array.isArray(src.edges)) {
      edges = src.edges.map(e => ({
        from: e.from != null ? e.from : (Array.isArray(e) ? e[0] : null),
        to: e.to != null ? e.to : (Array.isArray(e) ? e[1] : null),
      }));
    } else if (Array.isArray(src.conexiones)) {
      edges = src.conexiones.map(c => ({ from: c[0], to: c[1] }));
    }
    edges = edges.filter(e => e.from != null && e.to != null);

    return { nodes, edges };
  }

  global.DiagramCanvas = DiagramCanvas;
  global.normalizarGrafo = normalizarGrafo;
  global.DIAG_CAT_COLOR = CAT_COLOR;
  global.DIAG_CAT_LABELS = CAT_LABELS;
})(typeof window !== 'undefined' ? window : global);
