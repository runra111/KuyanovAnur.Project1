/* ═══════════════════════════════════════════════════════════════
   Роберт Паттинсон — эссе-сайт
   «Режиссёр»: кіру экраны → эдит (1-слайд) → 12 слайд, скроллға байланған
   баяу көшулер. Стек: GSAP + ScrollTrigger + ScrollTo.
   Reduce-motion / GSAP жоқ → stack-режим. Баптаулар: assets/manifest.js
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad2 = n => String(n).padStart(2, '0');
  const wait = ms => new Promise(r => setTimeout(r, ms));

  const root   = document.documentElement;
  const stage  = $('#stage');
  const track  = $('#track');
  const scenes = $$('.scene');
  const N      = scenes.length;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pinned = !!(window.gsap && window.ScrollTrigger) && !reduce && !/[?&]stack\b/.test(location.search);
  const portrait = () => matchMedia('(max-aspect-ratio: 1/1)').matches;

  const els = {
    loader: $('#loader'), loaderWord: $('#loaderWord'), loaderCount: $('#loaderCount'), loaderBar: $('#loaderBar'),
    gate: $('#gate'), enterSound: $('#enterSound'), enterMute: $('#enterMute'),
    cur: $('#cur'), name: $('#slideName'), ticks: $('#ticks'), tc: $('#tc'), live: $('#live'),
    index: $('#index'), indexList: $('#indexList'), indexBtn: $('#indexBtn'), indexClose: $('#indexClose'),
    sound: $('#soundBtn'), volPanel: $('#volPanel'), volRange: $('#volRange'), volOut: $('#volOut'), pauseMark: $('#pauseMark'), again: $('#again'), bark: $('#bark'),
    edit: $('#edit'), heroVideo: $('#heroVideo'),
  };

  track.style.setProperty('--n', N);
  const MEDIA = Object.assign({ audio: null, bpm: 123, loopStart: 0, video: null, family: {} }, window.SITE_MEDIA || {});
  const BEAT = 60 / (MEDIA.bpm || 123);

  let tl = null;          // мастер-таймлайн (скролл)
  let E = null;           // эдит-таймлайн (1-слайд)
  let cur = -1;           // белсенді слайд
  let dragging = false;   // прокрутка ползунокын тышқанмен тартып жатыр
  let goTarget = null;    // бағдарламалық өту кезіндегі нысана слайд
  let hashTimer = 0, liveTimer = 0;
  let editOn = false, eClock = 0;

  /* ───────────────────────── Дайындық ───────────────────────── */

  // Мәтінді сөздерге бөлу (экранды оқу құралы үшін түпнұсқа сақталады)
  $$('[data-split]').forEach(el => {
    const text = el.textContent.trim().replace(/\s+/g, ' ');
    const words = text.split(' ').map(w => `<span class="w"><span class="w__i">${w}</span></span>`).join(' ');
    el.innerHTML = `<span class="sr-only">${text}</span><span aria-hidden="true">${words}</span>`;
  });

  // Жаңбыр тамшылары
  const rain = $('.s6__rain');
  if (rain) {
    for (let i = 0; i < 40; i++) {
      const d = document.createElement('i');
      d.style.left = (Math.random() * 100).toFixed(1) + '%';
      d.style.height = (40 + Math.random() * 110).toFixed(0) + 'px';
      d.style.animationDuration = (1.1 + Math.random() * 1).toFixed(2) + 's';
      d.style.animationDelay = (-Math.random() * 2).toFixed(2) + 's';
      d.style.opacity = (.25 + Math.random() * .5).toFixed(2);
      rain.appendChild(d);
    }
  }

  // Слайд индикаторлары мен мазмұны
  const titles = scenes.map(s => s.dataset.title);
  titles.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tick'; b.dataset.goto = i;
    b.setAttribute('aria-label', `Слайд ${i + 1}: ${t}`);
    els.ticks.appendChild(b);

    const li = document.createElement('li');
    li.innerHTML = `<a href="#s${i + 1}" data-goto="${i}"><span>${pad2(i + 1)}</span>${t}</a>`;
    els.indexList.appendChild(li);
  });

  // Сурет авторлары (CC лицензиясы бойынша міндетті)
  const creditsList = $('#creditsList');
  (window.CREDITS || []).forEach(c => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = c.page; a.target = '_blank'; a.rel = 'noopener'; a.textContent = c.title;
    li.append(`${c.label}: `, a, ` — ${c.author || 'автор көрсетілмеген'}, ${c.license}`);
    creditsList.appendChild(li);
  });

  // Отбасы суреттері (қаласа, manifest.js арқылы)
  $$('img[data-family]').forEach(img => {
    const src = MEDIA.family && MEDIA.family[img.dataset.family];
    if (!src) return;
    img.src = src; img.hidden = false;
    img.closest('.fcard').classList.add('has-img');
  });

  // Дайын эдит-видео болса, 1-слайдтың фоны болады
  if (MEDIA.video) {
    els.heroVideo.src = MEDIA.video;
    els.heroVideo.hidden = false;
    $('.s1').classList.add('has-video');
  }

  /* ───────────────────────── Әріптерді өлшемге келтіру ───────────────────────── */
  const meas = document.createElement('span');
  meas.className = 'word';
  meas.setAttribute('aria-hidden', 'true');
  meas.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;font-size:100px;pointer-events:none';
  document.body.appendChild(meas);
  const textWidth = t => { meas.textContent = t; return meas.getBoundingClientRect().width; };
  // innerText visibility:hidden ішінде бос қайтады, сондықтан жолдарды қолмен жинаймыз
  function linesOf(el) {
    let s = '';
    el.childNodes.forEach(n => {
      if (n.nodeType === 3) s += n.textContent;
      else if (n.nodeName === 'BR') { if (getComputedStyle(n).display !== 'none') s += '\n'; }
      else s += n.textContent;
    });
    return s.split('\n').map(x => x.trim()).filter(Boolean);
  }

  function fitWords() {
    const W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H) return;
    $$('[data-fit]').forEach(el => {
      const pct = +((portrait() && el.dataset.fitP) || el.dataset.fit);
      const lines = linesOf(el);
      if (!lines.length) return;
      const w = Math.max(...lines.map(textWidth));
      let fs = 100 * (pct / 100) * W / w;
      if (el.dataset.maxh) fs = Math.min(fs, 100 * (+el.dataset.maxh / 100) * H / (lines.length * .78 * 100));
      el.style.fontSize = fs.toFixed(1) + 'px';
    });
  }
  let fitTimer = 0;
  addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(fitWords, 120); });

  /* ───────────────────────── Музыка (эдитпен бірге циклданады) ───────────────────────── */
  const LOOP_START = MEDIA.loopStart || 0;           // әннің сол «сәті» басталатын секунд
  const DUCK = .12;                                  // 1-слайдтан кеткенде дыбыс осыған дейін тыныштайды
  let ac = null, gainNode = null, srcNode = null, musicBuf = null, musicT0 = 0, htmlAudio = null;
  let userVol = .15, started = false, paused = false, unlocked = false;
  const levelFor = i => (i === 0 ? 1 : DUCK);

  let audioReady = Promise.resolve();                // музыка ойнауға дайын болғанда орындалады
  function audioBytes() {                            // base64 (assets/music-data.js) → file:// ашқанда да жұмыс істейді
    if (window.SITE_AUDIO_B64) {
      const bin = atob(window.SITE_AUDIO_B64), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return Promise.resolve(u8.buffer);
    }
    return fetch(MEDIA.audio).then(r => { if (!r.ok) throw new Error('audio'); return r.arrayBuffer(); });
  }
  function prepareAudio() {                          // дыбысты алдын ала жүктеу/декодтау
    if (!MEDIA.audio) return;
    const fallback = () => new Promise(res => {      // Web Audio болмаса: <audio> (blob URL file:// кезінде де жұмыс істейді)
      htmlAudio = new Audio(); htmlAudio.preload = 'auto'; htmlAudio.volume = 0;
      htmlAudio.addEventListener('canplaythrough', () => res(), { once: true });
      audioBytes().then(b => new Blob([b], { type: 'audio/mpeg' })).then(blob => URL.createObjectURL(blob), () => MEDIA.audio)
        .then(src => { htmlAudio.src = src; htmlAudio.load(); });
      setTimeout(res, 12000);
    });
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { audioReady = fallback(); return; }
    try {
      ac = new AC();
      gainNode = ac.createGain(); gainNode.gain.value = 0; gainNode.connect(ac.destination);
      audioReady = audioBytes()
        .then(b => new Promise((res, rej) => ac.decodeAudioData(b, res, rej)))
        .then(buf => { musicBuf = buf; })
        .catch(() => { try { ac.close(); } catch (e) { /* ignore */ } ac = null; gainNode = null; return fallback(); });
    } catch (e) { ac = null; audioReady = fallback(); }
  }

  // барлық суреттер алдын ала декодталады, сонда эдитте сурет «жоғалып» қалмайды
  function imagesReady() {
    return Promise.all($$('img').filter(i => i.getAttribute('src')).map(i => new Promise(res => {
      const done = () => res();
      if (i.complete) { (i.decode ? Promise.race([i.decode().catch(() => {}), wait(1500)]) : Promise.resolve()).then(done); return; }
      i.addEventListener('load', done, { once: true });
      i.addEventListener('error', done, { once: true });
    })));
  }
  function loopLen() { return E ? E._loop : 11.7; }

  function applyGain(instant) {
    const g = clamp(userVol * levelFor(cur), 0, 1);
    if (gainNode && ac) {
      if (instant) gainNode.gain.setValueAtTime(g, ac.currentTime);
      else gainNode.gain.setTargetAtTime(g, ac.currentTime, .5);
    }
    if (htmlAudio) {
      if (window.gsap && !instant) gsap.to(htmlAudio, { volume: g, duration: 1.4, ease: 'power2.out', overwrite: true });
      else htmlAudio.volume = g;
    }
  }

  function unlockAudio() {                           // пайдаланушы жесті ішінде
    unlocked = true;
    if (ac) ac.resume().catch(() => {});
    if (htmlAudio) {                                 // <audio> бұғатын ашамыз
      htmlAudio.muted = true;
      htmlAudio.play().then(() => { htmlAudio.pause(); htmlAudio.muted = false; }).catch(() => { htmlAudio.muted = false; });
    }
  }

  function startMusicAt(pos) {                       // pos = эдит уақыты (секунд)
    if (!MEDIA.audio || started) return;
    started = true;
    const len = loopLen();
    if (ac && musicBuf) {
      srcNode = ac.createBufferSource(); srcNode.buffer = musicBuf; srcNode.loop = true;
      srcNode.loopStart = LOOP_START; srcNode.loopEnd = LOOP_START + len;
      srcNode.connect(gainNode);
      musicT0 = ac.currentTime - pos;
      srcNode.start(0, LOOP_START + pos);
    } else if (htmlAudio) {
      try { htmlAudio.currentTime = LOOP_START + pos; } catch (e) { /* metadata әлі жоқ */ }
      htmlAudio.play().catch(() => {});
    }
    applyGain(true);
  }

  function musicPos() {                              // эдит циклындағы орны (секунд) немесе null
    if (!started || paused) return null;
    const len = loopLen();
    if (srcNode && ac && ac.state === 'running') {
      let ct = ac.currentTime;                       // дыбыс шығу кідірісін ескереміз (құлаққап/Bluetooth), сонда кадр естілгенмен дәл түседі
      try { const o = ac.getOutputTimestamp && ac.getOutputTimestamp(); if (o && o.contextTime > 0 && o.contextTime <= ct) ct = o.contextTime; } catch (e) { /* ignore */ }
      return (((ct - musicT0) % len) + len) % len;
    }
    if (htmlAudio && !htmlAudio.paused && htmlAudio.readyState > 1) {
      let t = htmlAudio.currentTime - LOOP_START;
      if (t >= len || t < -.05) { t = ((t % len) + len) % len; try { htmlAudio.currentTime = LOOP_START + t; } catch (e) { /* ignore */ } }
      return Math.max(0, t);
    }
    return null;
  }

  function setUserVol(v) {
    userVol = clamp(v, 0, 1);
    els.sound.setAttribute('aria-pressed', String(userVol > 0));
    els.volRange.value = Math.round(userVol * 100);
    els.volOut.textContent = Math.round(userVol * 100);
    applyGain(true);
  }

  function startMusic(on) {                          // кіру экранындағы батырма
    unlockAudio();
    setUserVol(on ? .15 : 0);
  }

  function togglePause(force) {                      // 1-слайдтың ортасына басу / P пернесі
    paused = typeof force === 'boolean' ? force : !paused;
    els.pauseMark.hidden = !paused;
    if (ac && started) { if (paused) ac.suspend(); else ac.resume(); }
    if (htmlAudio && started) { if (paused) htmlAudio.pause(); else htmlAudio.play().catch(() => {}); }
    if (!els.heroVideo.hidden) { if (paused) els.heroVideo.pause(); else els.heroVideo.play().catch(() => {}); }
  }

  // дыбыс батырмасы → ползунок ашылады
  els.sound.addEventListener('click', () => {
    const open = els.volPanel.hidden;
    els.volPanel.hidden = !open;
    els.sound.setAttribute('aria-expanded', String(open));
    if (open && started === false && unlocked === false) unlockAudio();
  });
  els.volRange.addEventListener('input', () => {
    setUserVol(+els.volRange.value / 100);
    if (!unlocked) unlockAudio();
    if (!started && E) startMusicAt(eClock);
  });
  document.addEventListener('click', e => {
    if (!els.volPanel.hidden && !e.target.closest('#vol')) { els.volPanel.hidden = true; els.sound.setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (ac && started) ac.suspend(); if (htmlAudio) htmlAudio.pause(); }
    else if (!paused) { if (ac && started) ac.resume(); if (htmlAudio && started) htmlAudio.play().catch(() => {}); }
  });
  window.__music = () => ({ started, paused, userVol, gain: gainNode ? +gainNode.gain.value.toFixed(3) : null, pos: musicPos(), webaudio: !!(ac && musicBuf) });

  /* ───────────────────────── Белсенді слайд / HUD ───────────────────────── */
  function setActive(i) {
    if (i === cur) return;
    const first = cur === -1;
    cur = i;

    scenes.forEach((s, k) => s.classList.toggle('is-active', k === i));
    stage.classList.toggle('is-hero', i === 0);
    els.cur.textContent = pad2(i + 1);
    els.name.textContent = titles[i];
    $$('.tick', els.ticks).forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
    $$('a', els.indexList).forEach((a, k) => a.setAttribute('aria-current', String(k === i)));

    if (els.heroVideo && !els.heroVideo.hidden) { if (i === 0) els.heroVideo.play().catch(() => {}); else els.heroVideo.pause(); }
    if (!first) {
      if (i !== 0 && paused) togglePause(false);     // басқа слайдқа өтсек, қойылған пауза алынады
      applyGain(false);                              // 1-слайдтан кетсек дыбыс өшпейді, тек тыныштайды
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => { els.live.textContent = `Слайд ${i + 1} / ${N}: ${titles[i]}`; }, 350);
      clearTimeout(hashTimer);
      hashTimer = setTimeout(() => history.replaceState(null, '', '#s' + (i + 1)), 400);
    }
  }

  function timecode(t) {
    const sec = (t / (N - 1)) * N;                   // 13 слайд = 13 секунд
    const s = Math.floor(sec), f = Math.floor((sec - s) * 24);
    els.tc.textContent = `00:${pad2(s)}:${pad2(f)}`;
  }

  function frame(t) {
    setActive(clamp(Math.round(t), 0, N - 1));
    timecode(t);
  }

  /* ───────────────────────── 1-слайд: ЭДИТ (музыка ұрысына сәйкес) ───────────────────────── */
  const EDIT_E = {
    slam:   [{ autoAlpha: 0, scale: 1.25 },               { autoAlpha: 1, scale: 1, duration: .55, ease: 'power3.out' }],
    fade:   [{ autoAlpha: 0, y: 18 },                     { autoAlpha: 1, y: 0, duration: .7, ease: 'power2.out' }],
    rise:   [{ autoAlpha: 0, yPercent: 8 },               { autoAlpha: 1, yPercent: 0, duration: .8, ease: 'power3.out' }],
    slideR: [{ autoAlpha: 0, x: () => innerWidth * .12 }, { autoAlpha: 1, x: 0, duration: .8, ease: 'power3.out' }],
  };

  function buildEdit() {
    const shots = $$('.shot', els.edit);
    const tcEls = $$('[data-tc]', els.edit);
    const e = gsap.timeline({ paused: true, defaults: { ease: 'none' } });

    e.set(shots, { autoAlpha: 0 }, 0);
    let t = 0;
    const starts = [], durs = [];
    shots.forEach((s, si) => {
      const d = (+s.dataset.beats) * BEAT;             // әр кадр = бүтін ұрыс саны
      starts[si] = t; durs[si] = d;
      e.set(s, { autoAlpha: 1 }, t);                   // қатты склейка (hard cut)
      // жиектен түсетін жарық (light leak): әр кадрда әртүрлі бұрыштар
      ['a', 'b', 'c'].forEach((k, ki) => {
        if (!((si + ki) % 2 === 0 || (si * (ki + 1)) % 3 === 1)) return;
        const lk = document.createElement('i'); lk.className = 'leak leak--' + k; s.appendChild(lk);
        const up = Math.min(.5, d * .35);
        e.fromTo(lk, { opacity: 0 }, { opacity: .85, duration: up, ease: 'power2.out' }, t + ki * .06);
        e.to(lk, { opacity: .3, duration: Math.max(.2, d - up - ki * .06), ease: 'none' }, t + up + ki * .06);
      });
      e.fromTo(s, { scale: 1.04 }, { scale: 1, duration: Math.min(.9, d), ease: 'power2.out' }, t);
      $$('[data-e]', s).forEach(el => {
        const delay = +(el.dataset.d || 0);
        if (el.dataset.e === 'drift') { e.fromTo(el, { scale: 1 }, { scale: 1.1, duration: d, ease: 'none' }, t); return; }
        const spec = EDIT_E[el.dataset.e];
        if (spec) e.fromTo(el, spec[0], spec[1], t + delay);
      });
      e.set(s, { autoAlpha: 0 }, t + d);
      t += d;
    });
// папарацци жарқылдары: [кадр индексі, кадр ішіндегі үлес, x%, y%]
    const PF = [
      [0, .45, 22, 32], [0, .8, 80, 26],
      [1, .12, 18, 30], [1, .38, 80, 24], [1, .6, 64, 58], [1, .85, 28, 66],
      [5, .1, 22, 28], [5, .35, 82, 30], [5, .6, 50, 16], [5, .85, 72, 62],
      [6, .1, 16, 36], [6, .3, 84, 40], [6, .5, 28, 70], [6, .7, 72, 24], [6, .88, 50, 52],
      [7, .15, 25, 30], [7, .4, 75, 34], [7, .65, 30, 72], [7, .85, 70, 68],
      [8, .08, 16, 30], [8, .2, 82, 26], [8, .35, 22, 62], [8, .5, 78, 58], [8, .65, 50, 20], [8, .8, 34, 42], [8, .92, 66, 50],
    ];
    const layer = document.createElement('div'); layer.className = 'fxlayer'; els.edit.appendChild(layer);
    const veil = document.createElement('i'); veil.className = 'pveil'; layer.appendChild(veil);
    PF.forEach(([si, f, x, y]) => {
      if (starts[si] === undefined) return;
      const tt = starts[si] + f * durs[si];
      const el = document.createElement('i'); el.className = 'pf'; el.style.left = x + '%'; el.style.top = y + '%'; layer.appendChild(el);
      e.fromTo(el, { opacity: 0, scale: .3 }, { opacity: 1, scale: 1, duration: .07, ease: 'power2.out' }, tt);
      e.to(el, { opacity: 0, scale: 1.25, duration: .4, ease: 'power2.out' }, tt + .07);
      e.fromTo(veil, { opacity: .2 }, { opacity: 0, duration: .35, ease: 'power2.out' }, tt);
    });

        e.add(() => {}, t + 0.5);                        // соңғы жарқыл құйрығы циклдан шықпасын
    e._loop = t;
    e._tc = tcEls;
    return e;
  }

  function editTick(time, dt) {
    if (!E || !editOn || cur !== 0 || document.hidden || paused) return;
    const loop = E._loop;
    const mp = musicPos();
    if (mp !== null) eClock = mp; else eClock = (eClock + dt / 1000) % loop;
    E.time(eClock, false);
    const s = Math.floor(eClock), f = Math.floor((eClock - s) * 24);
    const str = `00:${pad2(s)}:${pad2(f)}`;
    E._tc.forEach(el => { el.textContent = str; });
  }

  /* ───────────────────────── Мастер-таймлайн (баяу жабу-көшулер) ───────────────────────── */
  const ENTER = {
    slam:    [{ autoAlpha: 0, scale: 1.18 },                        { autoAlpha: 1, scale: 1, ease: 'power3.out' }],
    fade:    [{ autoAlpha: 0, y: 24 },                              { autoAlpha: 1, y: 0, ease: 'power2.out' }],
    rise:    [{ autoAlpha: 0, y: 50 },                              { autoAlpha: 1, y: 0, ease: 'power3.out' }],
    drop:    [{ autoAlpha: 0, y: -60 },                             { autoAlpha: 1, y: 0, ease: 'power3.out' }],
    pop:     [{ autoAlpha: 0, scale: .6 },                          { autoAlpha: 1, scale: 1, ease: 'power3.out' }],
    slideL:  [{ autoAlpha: 0, x: -60 },                             { autoAlpha: 1, x: 0, ease: 'power3.out' }],
    slideR:  [{ autoAlpha: 0, x: 60 },                              { autoAlpha: 1, x: 0, ease: 'power3.out' }],
    subject: [{ autoAlpha: 0, yPercent: 8, scale: 1.04, transformOrigin: '50% 100%' }, { autoAlpha: 1, yPercent: 0, scale: 1, ease: 'power3.out' }],
    stamp:   [{ autoAlpha: 0, scale: 1.8 },                         { autoAlpha: 1, scale: 1, ease: 'power3.out' }],
    bar:     [{ scaleX: 0, transformOrigin: '0% 50%' },             { scaleX: 1, ease: 'power3.inOut' }],
    ruler:   [{ scaleY: 0 },                                        { scaleY: 1, ease: 'power3.inOut' }],
    panelL:  [{ xPercent: -40, autoAlpha: 0 },                      { xPercent: 0, autoAlpha: 1, ease: 'power3.out' }],
    panelR:  [{ xPercent: 40, autoAlpha: 0 },                       { xPercent: 0, autoAlpha: 1, ease: 'power3.out' }],
  };

  // слайд i-ге элементтердің кіру терезесі: [i-.6, i]; барлығы i-ге дейін аяқталады (snap нүктесі)
  function enter(el, i) {
    const type = el.dataset.in;
    const d = parseFloat(el.dataset.d || 0);
    const t0 = i - .6 + d * .3;
    const rem = .6 - d * .3 - .02;

    if (type === 'split') {
      const ws = $$('.w__i', el);
      const dur = Math.min(.3, rem);
      const stag = ws.length > 1 ? Math.min(.04, Math.max(0, (rem - dur) / (ws.length - 1))) : 0;
      tl.fromTo(ws, { yPercent: 115 }, { yPercent: 0, duration: dur, ease: 'power3.out', stagger: stag }, t0);
      return;
    }
    if (type === 'stars') {
      tl.fromTo(el.children, { autoAlpha: 0, scale: .4 },
        { autoAlpha: 1, scale: 1, duration: .2, ease: 'power3.out', stagger: .05 }, t0);
      return;
    }
    const spec = ENTER[type];
    if (!spec) return;
    tl.fromTo(el, spec[0], { ...spec[1], duration: Math.min(.34, rem) }, t0);
  }

  // Скролл тоқтағанда қозғалыс бағытындағы келесі слайдқа тұрады.
  // eps — дробты қателік салдарынан дәл слайдта тұрғанда артық секіруді болдырмайды.
  function snapSlide(p, self) {
    if (goTarget !== null) return goTarget / (N - 1);
    if (dragging) return p;                          // ползунокты тартып жатқанда өздігінен жылжытпаймыз
    const x = p * (N - 1), eps = .002, dir = self && self.direction;
    const k = dir > 0 ? Math.ceil(x - eps) : dir < 0 ? Math.floor(x + eps) : Math.round(x);
    return clamp(k, 0, N - 1) / (N - 1);
  }

  function buildTimeline() {
    gsap.registerPlugin(ScrollTrigger);
    if (window.ScrollToPlugin) gsap.registerPlugin(ScrollToPlugin);
    ScrollTrigger.config({ ignoreMobileResize: true });

    tl = gsap.timeline({
      defaults: { ease: 'none' },
      onUpdate: () => frame(tl.time()),
      scrollTrigger: {
        trigger: track, start: 'top top', end: 'bottom bottom', scrub: .9, invalidateOnRefresh: true,
        snap: { snapTo: snapSlide, inertia: false, duration: { min: .6, max: 1.2 }, delay: .15, ease: 'power2.inOut' },
      },
    });

    scenes.forEach((sc, i) => {
      if (i === 0) return;
      const t0 = i - .8, prev = scenes[i - 1];
      // жаңа слайд төменнен жұмсақ «жабылып» шығады; ескісі баяу күңгірттенеді
      tl.fromTo(sc, { autoAlpha: 0 }, { autoAlpha: 1, duration: .001 }, t0);
      tl.fromTo(sc, { clipPath: 'inset(100% 0% 0% 0%)', scale: 1.05 },
                    { clipPath: 'inset(0% 0% 0% 0%)', scale: 1, duration: .6, ease: 'power2.inOut' }, t0);
      tl.fromTo(prev, { '--dim': 0, scale: 1 }, { '--dim': .6, scale: 1.04, duration: .6, ease: 'power2.inOut', immediateRender: false }, t0);
      tl.fromTo(prev, { autoAlpha: 1 }, { autoAlpha: 0, duration: .001, immediateRender: false }, i - .2);

      $$('[data-in]', sc).forEach(el => enter(el, i));
      $$('[data-count]', sc).forEach(el => {
        const to = +el.dataset.count, from = +(el.dataset.from || 0), pad = +(el.dataset.pad || 1);
        const o = { v: from };
        tl.fromTo(o, { v: from }, {
          v: to, duration: .34, ease: 'power2.out',
          onUpdate: () => { el.textContent = String(Math.round(o.v)).padStart(pad, '0'); },
        }, i - .55);
      });
    });

    // 11-слайд: күн / түн нүктесі кіру кезінде жолдан өтеді
    const dot = $('.s11__dot');
    const dotIdx = scenes.indexOf($('.s11'));
    if (dot) {
      tl.fromTo(dot, { left: '0%' }, { left: '95%', duration: .5, ease: 'power1.inOut' }, dotIdx - .55);
      tl.fromTo(dot, { backgroundColor: '#ffffff' }, { backgroundColor: '#000000', duration: .15, ease: 'none' }, dotIdx - .25);
    }

    tl.add(() => {}, N - 1);                         // ұзақтық = N-1 (бір слайд = 1 бірлік)
    return tl;
  }

  function yFor(i) {
    const st = tl.scrollTrigger;
    return st.start + (st.end - st.start) * (clamp(i, 0, N - 1) / (N - 1));
  }

  function goTo(i) {
    i = clamp(i, 0, N - 1);
    if (!pinned) { scenes[i].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); return; }
    const y = yFor(i);
    if (window.ScrollToPlugin) {
      goTarget = i;
      gsap.to(window, { scrollTo: { y, autoKill: false }, duration: Math.min(2.2, .9 + Math.abs(i - cur) * .16), ease: 'power3.inOut', overwrite: true, onComplete: () => { setTimeout(() => { goTarget = null; }, 250); } });
    } else {
      window.scrollTo({ top: y });
    }
  }

  /* ───────────────────────── Кіру (прелоадерден кейін) ───────────────────────── */
  const HERO_UI = '.s1__kicker, .s1__scroll, .rec';

  function heroPrep() {
    gsap.set(HERO_UI, { autoAlpha: 0 });
    gsap.set('.hud, .vf', { autoAlpha: 0 });
  }

  function heroPlay() {
    const h = gsap.timeline();
    h.fromTo(HERO_UI, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: .9, ease: 'power3.out', stagger: .12 }, .5)
     .to('.hud, .vf', { autoAlpha: 1, duration: .8, stagger: .06, ease: 'power2.out' }, .4);
    eClock = 0;
    editOn = true;
    startMusicAt(0);                                 // эдит пен музыка бір мезетте басталады
    return h;
  }

  /* ───────────────────────── Прелоадер ───────────────────────── */
  const LOADER_WORDS = [[0, 'Robert'], [24, 'Pattinson'], [48, '1986'], [70, 'Actor'], [90, 'Robert']];

  function fitLoaderWord(w) {
    const vw = Math.max(innerWidth, root.clientWidth, 320), vh = Math.max(innerHeight, root.clientHeight, 320);
    const fs = Math.min(vw * .34, vh * .48, (vw * .9) / (w.length * .44));
    els.loaderWord.style.fontSize = fs + 'px';
    els.loaderWord.textContent = w;
  }

  async function runLoader() {
    root.classList.add('is-loading');
    await Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), wait(2200)]);
    await new Promise(resolve => {
      const o = { v: 0 };
      let last = -1;
      fitLoaderWord(LOADER_WORDS[0][1]);
      gsap.to(o, {
        v: 100, duration: 2.4, ease: 'steps(28)',
        onUpdate: () => {
          const v = Math.round(o.v);
          els.loaderCount.textContent = String(v).padStart(3, '0');
          els.loaderBar.style.transform = `scaleX(${v / 100})`;
          for (let k = LOADER_WORDS.length - 1; k >= 0; k--) {
            if (v >= LOADER_WORDS[k][0]) {
              if (k !== last) { last = k; fitLoaderWord(LOADER_WORDS[k][1]); els.loader.classList.toggle('is-paper', k % 2 === 1); }
              break;
            }
          }
        },
        onComplete: resolve,
      });
    });
    // браузер дыбысты тек пайдаланушы басқаннан кейін ғана қосады, сондықтан кіру экраны
    els.loader.classList.remove('is-paper');
    fitLoaderWord('Robert');
    els.gate.hidden = false;
    els.enterSound.disabled = els.enterMute.disabled = true;   // сурет пен музыка дайын болғанша күтеміз
    const gateLabel = els.gate.querySelector('p'), gateText = gateLabel.textContent;
    gateLabel.textContent = 'Loading photos & music…';
    await Promise.race([Promise.all([audioReady, imagesReady()]), wait(20000)]);
    els.enterSound.disabled = els.enterMute.disabled = false; gateLabel.textContent = gateText;
    return new Promise(resolve => {
      els.enterSound.addEventListener('click', () => { startMusic(true); resolve(true); }, { once: true });
      els.enterMute.addEventListener('click', () => { startMusic(false); resolve(false); }, { once: true });
      els.enterSound.focus({ preventScroll: true });
    });
  }

  function openShutter() {
    return new Promise(resolve => {
      gsap.fromTo(els.loader, { clipPath: 'inset(0% 0 0% 0)' }, {
        clipPath: 'inset(50% 0 50% 0)', duration: 1, ease: 'expo.inOut',
        onComplete: () => { els.loader.remove(); resolve(); },
      });
    });
  }

  /* ───────────────────────── Мазмұны (оверлей) ───────────────────────── */
  let overlayOpen = false, lastFocus = null;
  function openIndex() {
    if (overlayOpen) return;
    overlayOpen = true; lastFocus = document.activeElement;
    els.index.hidden = false;
    root.classList.add('lock');
    track.inert = true;
    gsap.fromTo(els.index, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: .9, ease: 'power3.out' });
    gsap.fromTo($$('li', els.indexList), { yPercent: 30, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: .7, ease: 'power3.out', stagger: .04, delay: .2 });
    els.indexBtn.setAttribute('aria-expanded', 'true');
    setTimeout(() => (els.indexList.querySelector('[aria-current="true"]') || els.indexClose).focus(), 80);
  }
  function closeIndex(cb) {
    if (!overlayOpen) return;
    overlayOpen = false;
    gsap.to(els.index, {
      clipPath: 'inset(100% 0 0 0)', duration: .7, ease: 'power3.inOut',
      onComplete: () => {
        els.index.hidden = true; root.classList.remove('lock'); track.inert = false;
        els.indexBtn.setAttribute('aria-expanded', 'false');
        if (cb) cb(); else if (lastFocus && lastFocus.focus) lastFocus.focus();
      },
    });
  }
  els.indexBtn.addEventListener('click', () => (window.gsap ? openIndex() : null));
  els.indexClose.addEventListener('click', () => closeIndex());

  /* ───────────────────────── Басқару ───────────────────────── */
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-goto]');
    if (!a) return;
    e.preventDefault();
    const i = +a.dataset.goto;
    if (overlayOpen) closeIndex(() => goTo(i)); else goTo(i);
  });
  // «Басыңыз» батырмасы: ит ~0.7 сек үреді; қайта бассаң алдыңғысы үзіліп, қайтадан басталады
  const BARK_LEN = .7;
  let barkBuf = null, barkCtx = null, barkEl = null, barkNode = null;
  function barkBytes() {
    const bin = atob(window.SITE_BARK_B64 || ''), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  }
  function playBark() {
    els.bark.classList.add('is-bark'); setTimeout(() => els.bark.classList.remove('is-bark'), 160);
    if (!window.SITE_BARK_B64) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    const viaTag = () => {                            // Web Audio болмаса / декодталмаса: <audio>
      if (!barkEl) {
        barkEl = new Audio(URL.createObjectURL(new Blob([barkBytes()], { type: 'audio/mpeg' })));
        barkEl.addEventListener('timeupdate', () => { if (barkEl.currentTime > BARK_LEN) barkEl.pause(); });
      }
      barkEl.currentTime = 0; barkEl.volume = .9; barkEl.play().catch(() => {});
    };
    if (!AC) return viaTag();
    try {
      barkCtx = barkCtx || ac || new AC();
      barkCtx.resume().catch(() => {});
      const fire = () => {
        const t = barkCtx.currentTime;
        if (barkNode) {                               // алдыңғы дыбысты тез өшіреміз
          try { barkNode.g.gain.cancelScheduledValues(t); barkNode.g.gain.setTargetAtTime(0, t, .008); barkNode.s.stop(t + .05); } catch (e) { /* ignore */ }
        }
        const s = barkCtx.createBufferSource(), g = barkCtx.createGain();
        s.buffer = barkBuf; s.connect(g); g.connect(barkCtx.destination);
        g.gain.setValueAtTime(.95, t);
        g.gain.setValueAtTime(.95, t + BARK_LEN - .08);
        g.gain.linearRampToValueAtTime(0, t + BARK_LEN);
        s.start(t, 0, BARK_LEN);
        barkNode = { s, g };
      };
      if (barkBuf) return fire();
      barkCtx.decodeAudioData(barkBytes(), b => { barkBuf = b; fire(); }, viaTag);
    } catch (e) { viaTag(); }
  }  els.bark.addEventListener('click', playBark);
  els.again.addEventListener('click', () => goTo(0));
  ['wheel', 'touchstart', 'pointerdown'].forEach(ev => addEventListener(ev, () => {
    if (goTarget !== null) { goTarget = null; if (window.gsap) gsap.killTweensOf(window); }
  }, { passive: true }));

// Ползунокты (scrollbar) тартқанда сайт өзі жылжымайды; жібергенде ең жақын слайдқа тұрады
  addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.clientX >= root.clientWidth - 1) dragging = true;
  }, true);
  ['pointerup', 'mouseup', 'blur'].forEach(ev => addEventListener(ev, () => {
    if (!dragging) return;
    dragging = false;
    if (!tl) return;
    setTimeout(() => {
      const st = tl.scrollTrigger, x = ((scrollY - st.start) / (st.end - st.start)) * (N - 1);
      goTo(Math.round(x));
    }, 140);
  }, true));

  // 1-слайдтың ортасына басу = эдитті тоқтату / жалғастыру
  $('.s1').addEventListener('click', e => {
    if (e.target.closest('button, a, input')) return;
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (Math.abs(x - .5) < .22 && Math.abs(y - .5) < .3) togglePause();
  });

    document.addEventListener('keydown', e => {
    if (overlayOpen) { if (e.key === 'Escape') { e.preventDefault(); closeIndex(); } return; }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const interactive = e.target.closest && e.target.closest('button, a, input, textarea, select');
    const k = e.key;
    let to = null;
    if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !e.shiftKey && !interactive)) to = cur + 1;
    else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && e.shiftKey && !interactive)) to = cur - 1;
    else if (k === 'Home') to = 0;
    else if (k === 'End') to = N - 1;
    else if ((k === 'm' || k === 'M' || k === 'ь') && window.gsap) { openIndex(); return; }
    else if ((k === 'p' || k === 'P' || k === 'з') && cur === 0) { togglePause(); return; }
    if (to === null) return;
    e.preventDefault();
    goTo(to);
  });

  // тышқан параллаксы (тек дәл курсор құрылғыларында, өте жұмсақ)
  function initParallax() {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const subs = $$('.subject').map(el => ({ el, x: gsap.quickTo(el, 'x', { duration: 1.2, ease: 'power3.out' }), y: gsap.quickTo(el, 'y', { duration: 1.2, ease: 'power3.out' }) }));
    const wrds = $$('.s3__bg, .s5__bg, .s7__bg, .s8__bg, .s10__bg, .s11__bg').map(el => ({ el, x: gsap.quickTo(el, 'x', { duration: 1.4, ease: 'power3.out' }) }));
    addEventListener('pointermove', e => {
      const nx = e.clientX / innerWidth - .5, ny = e.clientY / innerHeight - .5;
      subs.forEach(s => { s.x(nx * 14); s.y(ny * 6); });
      wrds.forEach(w => w.x(nx * -22));
    }, { passive: true });
  }

  /* ───────────────────────── Stack-режим ───────────────────────── */
  function initStack() {
    root.classList.add('stack');
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) setActive(scenes.indexOf(en.target)); });
    }, { threshold: .55 });
    scenes.forEach(s => io.observe(s));
    setActive(0);
    els.loader && els.loader.remove();
    root.classList.remove('is-loading');
    els.indexBtn.hidden = true;
  }

  /* ───────────────────────── Іске қосу ───────────────────────── */
  async function boot() {
    if (!pinned) {
      if (document.fonts) await Promise.race([document.fonts.ready, wait(1500)]);
      fitWords();
      initStack();
      return;
    }

    heroPrep();
    buildTimeline();
    setActive(0);
    initParallax();
    window.scrollTo(0, 0);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    E = MEDIA.video ? null : buildEdit();
    window.__edit = E;
    prepareAudio();
    gsap.ticker.add(editTick);

    // ?dev — кіру экранынсыз ашу + таймлайнды қолмен басқару (тексеру үшін)
    if (/[?&]dev\b/.test(location.search)) {
      if (document.fonts) await Promise.race([document.fonts.ready, wait(1500)]);
      fitWords();
      window.__tl = tl; window.__go = goTo; window.__fit = fitWords;
      els.loader.remove(); root.classList.remove('is-loading');
      gsap.set(HERO_UI + ', .hud, .vf', { autoAlpha: 1 });
      if (/[?&]dev=static\b/.test(location.search)) { tl.scrollTrigger.kill(); }
      else { editOn = true; }
      return;
    }

    fitWords();
    await runLoader();
    fitWords();
    const shutter = openShutter();
    heroPlay();
    await shutter;

    root.classList.remove('is-loading');
    ScrollTrigger.refresh();
    fitWords();

    // терең сілтеме: #s7 → 7-слайд
    const m = /^#s(\d+)$/.exec(location.hash);
    if (m) setTimeout(() => goTo(+m[1] - 1), 900);
  }

  boot();
})();
