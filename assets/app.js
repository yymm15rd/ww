/* ==========================================================================
   作品集 · 全站动效脚本（纯原生，零依赖，离线可用）
   模块：WebGL 背景 / 拆字入场 / 错峰揭示 / 数字计数 / 滚动进度 /
        视差 / 导航高亮 / 卡片 3D 倾斜 / 光标光晕 / 磁吸按钮 /
        弹窗 / 卡片点击 / 分类筛选 / 平滑锚点
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  var isNarrow = function () { return window.innerWidth <= 820; };
  // 重动效开关：桌面端且用户未要求减少动效
  var heavyOK = !reduce && !isTouch;

  /* ------------------------------------------------------------------ */
  /* 1. WebGL 背景：极低对比度流动渐变场（着色器源码内联，file:// 可用） */
  /* ------------------------------------------------------------------ */
  function initBackground() {
    var canvas = $('#bg-canvas');
    if (!canvas) return;

    var gl = null;
    try {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power' })
        || canvas.getContext('experimental-webgl');
    } catch (e) { gl = null; }
    if (!gl) { document.body.classList.add('webgl-off'); return; }

    var VERT = [
      'attribute vec2 a_pos;',
      'void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }'
    ].join('\n');

    var FRAG = [
      'precision mediump float;',
      'uniform vec2 u_res;',
      'uniform float u_time;',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }',
      'float noise(vec2 p){',
      '  vec2 i = floor(p), f = fract(p);',
      '  vec2 u = f * f * (3.0 - 2.0 * f);',
      '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),',
      '             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);',
      '}',
      'float fbm(vec2 p){',
      '  float v = 0.0, a = 0.5;',
      '  for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }',
      '  return v;',
      '}',
      'void main(){',
      '  vec2 uv = gl_FragCoord.xy / u_res;',
      '  vec2 p = uv * vec2(u_res.x / u_res.y, 1.0);',
      '  float t = u_time * 0.045;',
      '  float n1 = fbm(p * 1.7 + vec2(t, -t * 0.7));',
      '  float n2 = fbm(p * 2.5 + vec2(-t * 0.6, t * 0.5) + n1);',
      '  vec3 violet = vec3(0.545, 0.361, 0.965);',
      '  vec3 cyan   = vec3(0.133, 0.827, 0.933);',
      '  vec3 col = mix(violet, cyan, clamp(n2, 0.0, 1.0));',
      '  float vig = smoothstep(1.30, 0.10, length(uv - 0.5) * 1.5);',
      '  float amt = n1 * 0.42 * vig;',
      '  vec3 base = vec3(0.027, 0.027, 0.051);',
      '  gl_FragColor = vec4(base + col * amt, 1.0);',
      '}'
    ].join('\n');

    function compile(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        if (window.console) console.warn('shader:', gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    }

    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { document.body.classList.add('webgl-off'); return; }

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      document.body.classList.add('webgl-off');
      return;
    }
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var uRes = gl.getUniformLocation(prog, 'u_res');
    var uTime = gl.getUniformLocation(prog, 'u_time');

    var dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      var w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      var h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    var start = performance.now();
    var running = true;
    var t = 0;

    function draw(now) {
      if (t === 0) t = now;
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    if (reduce) {
      // 减少动效：只画一帧静态背景
      draw(performance.now());
      document.body.classList.add('webgl-static');
      return;
    }

    function frame(now) {
      if (running) draw(now);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    document.addEventListener('visibilitychange', function () { running = !document.hidden; });

    // 上下文丢失兜底
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      running = false;
      document.body.classList.add('webgl-off');
    }, false);
  }

  /* ------------------------------------------------------------------ */
  /* 2. 首屏标题拆字入场                                                */
  /* ------------------------------------------------------------------ */
  function splitHero() {
    var h1 = $('.hero h1');
    if (!h1 || reduce) return;
    var idx = 0;
    var frag = document.createDocumentFragment();

    Array.prototype.slice.call(h1.childNodes).forEach(function (node) {
      if (node.nodeType === 3) {                       // 文本节点 → 逐字
        var text = node.nodeValue;
        for (var i = 0; i < text.length; i++) {
          var ch = text[i];
          var sp = document.createElement('span');
          sp.className = 'ch';
          sp.style.setProperty('--i', idx++);
          sp.textContent = ch;
          frag.appendChild(sp);
        }
      } else if (node.nodeType === 1) {                // 元素节点（渐变词）→ 整体
        var el = node.cloneNode(true);
        el.classList.add('ch');
        el.style.setProperty('--i', idx++);
        frag.appendChild(el);
      }
    });

    h1.innerHTML = '';
    h1.appendChild(frag);
  }

  /* ------------------------------------------------------------------ */
  /* 3. 错峰揭示（在原有 .reveal 基础上按组递增延迟）                    */
  /* ------------------------------------------------------------------ */
  function initReveal() {
    var targets = $$('.reveal');

    // 将若干组内元素纳入揭示系统
    $$('.skill-tags .tag, .hero-meta .m, .flow, .section-head').forEach(function (el) {
      if (!el.classList.contains('reveal')) {
        el.classList.add('reveal');
        targets.push(el);
      }
    });

    // 组内错峰：给每组子项按顺序赋 --i
    ['.work-grid', '.hero-meta', '.skill-tags', '.ctas'].forEach(function (sel) {
      $$(sel).forEach(function (g) {
        $$(':scope > *', g).forEach(function (el, i) {
          el.style.setProperty('--i', Math.min(i, 12));
        });
      });
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        io.unobserve(el);
        el.style.transitionDelay = 'calc(var(--i, 0) * 55ms)';
        el.classList.add('in');
        el.addEventListener('transitionend', function done(ev) {
          if (ev.propertyName !== 'opacity') return;
          el.removeEventListener('transitionend', done);
          el.style.transitionDelay = '';
          // 卡片揭示完成后移除类，恢复正常 hover 过渡手感
          if (el.classList.contains('work-card')) el.classList.remove('reveal', 'in');
        });
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });

    targets.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------ */
  /* 4. 数字滚动计数                                                    */
  /* ------------------------------------------------------------------ */
  function initCounters() {
    var els = $$('.hero-meta .m b');
    if (!els.length) return;
    if (reduce) return;

    els.forEach(function (el) {
      var raw = (el.textContent || '').trim();
      var target = parseInt(raw, 10);
      if (isNaN(target)) return;
      el.setAttribute('data-target', target);
      el.textContent = '0';
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        io.unobserve(el);
        var target = parseInt(el.getAttribute('data-target'), 10) || 0;
        var t0 = performance.now(), dur = 1100;
        (function step(now) {
          var k = Math.min(1, (now - t0) / dur);
          var eased = 1 - Math.pow(1 - k, 3);
          el.textContent = Math.round(target * eased);
          if (k < 1) requestAnimationFrame(step);
          else el.textContent = target;
        })(t0);
      });
    }, { threshold: 0.5 });

    els.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------ */
  /* 5. 滚动：进度条 + 首屏视差 + 导航高亮                              */
  /* ------------------------------------------------------------------ */
  function initScroll() {
    var bar = $('#progress');
    var heroInner = $('.hero-inner');
    var hero = $('.hero');
    var navLinks = $$('.nav-links a[href^="#"]');
    var sections = navLinks.map(function (a) { return $(a.getAttribute('href')); }).filter(Boolean);
    var ticking = false;
    var lastY = -1;

    function update() {
      ticking = false;
      var y = window.pageYOffset || document.documentElement.scrollTop;

      if (bar) {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        var p = max > 0 ? Math.min(1, y / max) : 0;
        bar.style.transform = 'scaleX(' + p + ')';
      }

      if (heroInner && hero && heavyOK && Math.abs(y - lastY) > 1) {
        var h = hero.offsetHeight || 1;
        var k = Math.min(1, y / h);
        heroInner.style.transform = 'translate3d(0,' + (k * 60) + 'px,0)';
        heroInner.style.opacity = String(Math.max(0, 1 - k * 1.05));
      }
      lastY = y;

      if (sections.length) {
        var mid = y + window.innerHeight * 0.32;
        var active = sections[0];
        sections.forEach(function (s) { if (s.offsetTop <= mid) active = s; });
        navLinks.forEach(function (a) {
          a.classList.toggle('active', a.getAttribute('href') === '#' + active.id);
        });
      }
    }

    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }

  /* ------------------------------------------------------------------ */
  /* 6. 卡片 3D 倾斜（桌面端）                                          */
  /* ------------------------------------------------------------------ */
  function initTilt() {
    if (!heavyOK) return;
    var MAX = 7;
    $$('.work-card .thumb').forEach(function (el) {
      var raf = 0, tx = 0, ty = 0, cx = 0, cy = 0, active = false;

      function loop() {
        cx += (tx - cx) * 0.16;
        cy += (ty - cy) * 0.16;
        el.style.transform = 'rotateX(' + (-cy).toFixed(2) + 'deg) rotateY(' + cx.toFixed(2) + 'deg)';
        if (Math.abs(tx - cx) > 0.04 || Math.abs(ty - cy) > 0.04) {
          raf = requestAnimationFrame(loop);
        } else {
          raf = 0;
          if (!active) el.style.transform = '';
        }
      }

      el.addEventListener('mousemove', function (e) {
        if (isNarrow()) return;
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        tx = ((e.clientX - r.left) / r.width - 0.5) * MAX * 2;
        ty = ((e.clientY - r.top) / r.height - 0.5) * MAX * 2;
        active = true;
        if (!raf) raf = requestAnimationFrame(loop);
      });
      el.addEventListener('mouseleave', function () {
        active = false; tx = 0; ty = 0;
        if (!raf) raf = requestAnimationFrame(loop);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* 7. 光标光晕 + 磁吸按钮（桌面端）                                   */
  /* ------------------------------------------------------------------ */
  function initPointer() {
    if (!heavyOK) return;

    // 光晕
    var glow = document.createElement('div');
    glow.className = 'cursor-glow';
    document.body.appendChild(glow);
    var mx = window.innerWidth / 2, my = window.innerHeight / 2, gx = mx, gy = my, seeded = false;

    window.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      if (!seeded) { gx = mx; gy = my; seeded = true; glow.classList.add('on'); }
    }, { passive: true });

    (function loop() {
      gx += (mx - gx) * 0.12;
      gy += (my - gy) * 0.12;
      glow.style.transform = 'translate3d(' + gx + 'px,' + gy + 'px,0)';
      requestAnimationFrame(loop);
    })();

    // 可交互元素上放大
    $$('a, button, .work-card, .fil').forEach(function (el) {
      el.addEventListener('mouseenter', function () { glow.classList.add('big'); });
      el.addEventListener('mouseleave', function () { glow.classList.remove('big'); });
    });

    // 磁吸按钮
    $$('.hero-actions .btn').forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        btn.style.transform = 'translate(' + (dx * 10).toFixed(1) + 'px,' + (dy * 8 - 2).toFixed(1) + 'px)';
      });
      btn.addEventListener('mouseleave', function () { btn.style.transform = ''; });
    });
  }

  /* ------------------------------------------------------------------ */
  /* 8. 弹窗（迁移并增强）                                              */
  /* ------------------------------------------------------------------ */
  function initModal() {
    var modal = $('#modal');
    if (!modal) return;
    var modalVideo = $('#modalVideo');
    var modalImg = $('#modalImg');
    var modalCap = $('#modalCap');

    function openModal(o) {
      modal.classList.add('open');
      modalCap.textContent = o.cap || '';
      if (o.type === 'img') {
        modalVideo.style.display = 'none';
        modalVideo.pause();
        modalVideo.removeAttribute('src');
        try { modalVideo.load(); } catch (e) {}
        modalImg.style.display = 'block';
        modalImg.src = o.img;
      } else {
        modalImg.style.display = 'none';
        modalImg.removeAttribute('src');
        modalVideo.style.display = 'block';
        modalVideo.src = o.src;
        var p = modalVideo.play();
        if (p && p.catch) p.catch(function () {});
      }
    }
    function closeModal() {
      modalVideo.pause();
      modalVideo.removeAttribute('src');
      try { modalVideo.load(); } catch (e) {}
      modalImg.removeAttribute('src');
      modal.classList.remove('open');
    }
    window.__openVideo = function (src, cap) { openModal({ src: src, cap: cap, type: 'video' }); };

    $$('[data-video]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        openModal({ src: a.dataset.video, cap: a.dataset.cap, type: 'video' });
      });
    });
    $$('#videoGrid .work-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var h3 = card.querySelector('h3');
        var dur = card.querySelector('.dur');
        var img = card.querySelector('img');
        if (!h3 || !img) return;
        var poster = img.getAttribute('src') || '';
        var file = poster.replace('posters/', '').replace(/\.(jpg|jpeg|png)$/i, '');
        if (file) openModal({ src: 'videos/' + file + '.mp4', cap: h3.textContent + ' · ' + (dur ? dur.textContent : ''), type: 'video' });
      });
    });
    $$('#aiGrid .work-card, #posterGrid .work-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var img = card.querySelector('img'), h3 = card.querySelector('h3');
        if (!img || !h3) return;
        openModal({ img: img.getAttribute('src'), cap: h3.textContent, type: 'img' });
      });
    });
    $$('.featured .shots figure').forEach(function (fig) {
      fig.addEventListener('click', function () {
        var img = fig.querySelector('img'), cap = fig.querySelector('figcaption');
        if (!img) return;
        openModal({ img: img.getAttribute('src'), cap: cap ? cap.textContent : '', type: 'img' });
      });
    });

    var closeBtn = $('#modalClose');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  }

  /* ------------------------------------------------------------------ */
  /* 9. 分类筛选（带淡出/淡入过渡）                                     */
  /* ------------------------------------------------------------------ */
  function initFilters() {
    var wrap = $('#videoFilters');
    if (!wrap) return;
    var grid = $('#videoGrid');
    var cards = $$('#videoGrid .work-card');

    wrap.addEventListener('click', function (e) {
      var btn = e.target.closest('.fil');
      if (!btn) return;
      $$('.fil', wrap).forEach(function (b) { b.classList.remove('on'); });
      btn.classList.add('on');
      var f = btn.dataset.f;

      if (reduce || !grid) {
        cards.forEach(function (c) { c.style.display = (f === 'all' || c.dataset.cat === f) ? '' : 'none'; });
        return;
      }
      grid.classList.add('filtering');
      window.setTimeout(function () {
        cards.forEach(function (c) {
          var show = (f === 'all' || c.dataset.cat === f);
          c.style.display = show ? '' : 'none';
          if (show) { c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; }
        });
        grid.classList.remove('filtering');
      }, 180);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 10. 平滑锚点（带导航高度偏移）                                      */
  /* ------------------------------------------------------------------ */
  function initAnchors() {
    $$('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        if (!id || id.length < 2) return;
        var t = document.querySelector(id);
        if (!t) return;
        e.preventDefault();
        window.scrollTo({ top: t.offsetTop - 60, behavior: reduce ? 'auto' : 'smooth' });
      });
    });
  }

  /* ------------------------------------------------------------------ */
  function init() {
    initBackground();
    splitHero();
    initReveal();
    initCounters();
    initScroll();
    initTilt();
    initPointer();
    initModal();
    initFilters();
    initAnchors();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
