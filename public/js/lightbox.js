// Menu photo viewer: click a dish photo to open it full screen and zoom in / out.
// Zoom with the + / − buttons, mouse wheel, double-click/double-tap or a two-finger pinch;
// drag to move around a zoomed photo. Arrow keys / ‹ › switch photos, Esc closes.
(function () {
  const photos = document.querySelectorAll('.gallery-track img');
  if (!photos.length) return;

  const MIN = 1;
  const MAX = 5;
  const STEP = 0.5;

  const box = document.createElement('div');
  box.className = 'lightbox';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Photo viewer');
  box.innerHTML = `
    <div class="lb-stage"><img class="lb-img" alt="" draggable="false"></div>
    <button type="button" class="lb-btn lb-close" aria-label="Close">✕</button>
    <button type="button" class="lb-btn lb-prev" aria-label="Previous photo">‹</button>
    <button type="button" class="lb-btn lb-next" aria-label="Next photo">›</button>
    <div class="lb-bar">
      <button type="button" class="lb-btn" data-zoom="out" aria-label="Zoom out">−</button>
      <span class="lb-level" aria-live="polite">100%</span>
      <button type="button" class="lb-btn" data-zoom="in" aria-label="Zoom in">+</button>
      <button type="button" class="lb-btn lb-reset" data-zoom="reset" aria-label="Reset zoom">⟲</button>
      <span class="lb-count"></span>
    </div>`;
  document.body.appendChild(box);

  const stage = box.querySelector('.lb-stage');
  const img = box.querySelector('.lb-img');
  const level = box.querySelector('.lb-level');
  const count = box.querySelector('.lb-count');
  const prevBtn = box.querySelector('.lb-prev');
  const nextBtn = box.querySelector('.lb-next');

  let set = []; // photos of the dish that was clicked
  let index = 0;
  let scale = 1;
  let x = 0;
  let y = 0;
  let opener = null;

  function render() {
    img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    level.textContent = `${Math.round(scale * 100)}%`;
    stage.classList.toggle('zoomed', scale > 1);
    box.querySelector('[data-zoom="out"]').disabled = scale <= MIN;
    box.querySelector('[data-zoom="in"]').disabled = scale >= MAX;
  }

  // Keep a zoomed photo from being dragged completely off screen.
  function clamp() {
    const maxX = (img.offsetWidth * (scale - 1)) / 2;
    const maxY = (img.offsetHeight * (scale - 1)) / 2;
    x = Math.max(-maxX, Math.min(maxX, x));
    y = Math.max(-maxY, Math.min(maxY, y));
  }

  // Zoom to `next`, keeping the point under (cx, cy) in place (screen coords; default = centre).
  function zoomTo(next, cx, cy) {
    const target = Math.max(MIN, Math.min(MAX, next));
    const rect = stage.getBoundingClientRect();
    const px = (cx === undefined ? rect.width / 2 : cx - rect.left) - rect.width / 2;
    const py = (cy === undefined ? rect.height / 2 : cy - rect.top) - rect.height / 2;
    x = px - ((px - x) * target) / scale;
    y = py - ((py - y) * target) / scale;
    scale = target;
    if (scale === MIN) { x = 0; y = 0; }
    clamp();
    render();
  }

  function show(i) {
    index = (i + set.length) % set.length;
    img.src = set[index].src;
    img.alt = set[index].alt;
    scale = 1; x = 0; y = 0;
    render();
    count.textContent = set.length > 1 ? `${index + 1} / ${set.length}` : '';
    prevBtn.hidden = nextBtn.hidden = set.length < 2;
  }

  function open(photo) {
    set = Array.from(photo.closest('.gallery-track').querySelectorAll('img'));
    opener = photo;
    box.hidden = false;
    document.body.classList.add('lb-open');
    show(set.indexOf(photo));
    box.querySelector('.lb-close').focus();
  }

  function close() {
    box.hidden = true;
    document.body.classList.remove('lb-open');
    if (opener) opener.focus();
  }

  // Make every dish photo clickable (and keyboard-openable).
  photos.forEach((photo) => {
    photo.tabIndex = 0;
    photo.setAttribute('role', 'button');
    photo.setAttribute('aria-label', `View larger: ${photo.alt}`);
    photo.addEventListener('click', () => open(photo));
    photo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(photo); }
    });
  });

  box.querySelector('.lb-close').addEventListener('click', close);
  prevBtn.addEventListener('click', () => show(index - 1));
  nextBtn.addEventListener('click', () => show(index + 1));
  box.querySelectorAll('[data-zoom]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.zoom;
      if (action === 'reset') zoomTo(1);
      else zoomTo(scale + (action === 'in' ? STEP : -STEP));
    });
  });

  // Click on the dark background (not the photo) closes the viewer.
  stage.addEventListener('click', (e) => { if (e.target === stage) close(); });

  document.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft' && set.length > 1) show(index - 1);
    else if (e.key === 'ArrowRight' && set.length > 1) show(index + 1);
    else if (e.key === '+' || e.key === '=') zoomTo(scale + STEP);
    else if (e.key === '-') zoomTo(scale - STEP);
    else if (e.key === 'Tab') {
      // Keep keyboard focus inside the viewer.
      const items = Array.from(box.querySelectorAll('button:not([hidden]):not(:disabled)'));
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Mouse wheel zooms towards the pointer.
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomTo(scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY);
  }, { passive: false });

  // Drag to pan, two-finger pinch to zoom (pointer events cover mouse + touch).
  const pointers = new Map();
  let pinchStart = null;
  let lastTap = 0;
  let lastPointerType = 'mouse';

  // Double-click toggles between 100% and 250% (touch double-tap is handled below).
  img.addEventListener('dblclick', (e) => {
    if (lastPointerType !== 'touch') zoomTo(scale > 1 ? 1 : 2.5, e.clientX, e.clientY);
  });

  stage.addEventListener('pointerdown', (e) => {
    lastPointerType = e.pointerType;
    if (e.target !== img) return;
    img.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
    }
    // Double-tap on touch screens
    if (e.pointerType === 'touch' && pointers.size === 1) {
      if (Date.now() - lastTap < 300) zoomTo(scale > 1 ? 1 : 2.5, e.clientX, e.clientY);
      lastTap = Date.now();
    }
  });

  stage.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinchStart) {
      const [a, b] = Array.from(pointers.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      zoomTo(pinchStart.scale * (dist / pinchStart.dist), (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (pointers.size === 1 && scale > 1) {
      x += e.clientX - prev.x;
      y += e.clientY - prev.y;
      clamp();
      render();
    }
  });

  const release = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
})();
