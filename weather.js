// 전국 실시간 날씨 — Open-Meteo (https://open-meteo.com, API 키 필요 없음)
//
// 검색 방법
//  1) 첫 글자만 쳐도(예: '서') cities.js 목록에서 추천이 바로 뜹니다. (초성 'ㅅ' 도 됩니다)
//  2) 목록에 없는 지역은 한글을 영어(로마자)로 자동 변환해서 Open-Meteo 지오코딩에 묻습니다.
//     예) 평택 → Pyeongtaek      (Open-Meteo 지오코딩은 영어 이름으로 찾는 게 정확하기 때문)
//  3) 영어로 직접 입력해도 됩니다. (Seoul, Busan …)
// 브라우저에서 바로 호출하며 비밀 값이 없으므로 프론트에 둬도 안전합니다.
(function () {
  const DEFAULT = { name: '제주', label: '제주 (Jeju) · 제주특별자치도', lat: 33.4996, lng: 126.5312 };
  const REGION = {
    서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시', 인천: '인천광역시', 광주: '광주광역시',
    대전: '대전광역시', 울산: '울산광역시', 세종: '세종특별자치시', 경기: '경기도', 강원: '강원특별자치도',
    충북: '충청북도', 충남: '충청남도', 전북: '전북특별자치도', 전남: '전라남도', 경북: '경상북도',
    경남: '경상남도', 제주: '제주특별자치도',
  };
  const REFRESH_MS = 10 * 60 * 1000; // 10분마다 갱신

  // WMO 날씨 코드 → [이모지, 한글 설명]
  const CODES = {
    0: ['☀️', '맑음'], 1: ['🌤️', '대체로 맑음'], 2: ['⛅', '구름 많음'], 3: ['☁️', '흐림'],
    45: ['🌫️', '안개'], 48: ['🌫️', '서리 안개'],
    51: ['🌦️', '약한 이슬비'], 53: ['🌦️', '이슬비'], 55: ['🌧️', '강한 이슬비'],
    56: ['🌧️', '약한 어는 비'], 57: ['🌧️', '어는 비'],
    61: ['🌧️', '약한 비'], 63: ['🌧️', '비'], 65: ['🌧️', '강한 비'],
    66: ['🌧️', '약한 어는 비'], 67: ['🌧️', '강한 어는 비'],
    71: ['🌨️', '약한 눈'], 73: ['🌨️', '눈'], 75: ['❄️', '강한 눈'], 77: ['🌨️', '싸락눈'],
    80: ['🌦️', '약한 소나기'], 81: ['🌦️', '소나기'], 82: ['⛈️', '강한 소나기'],
    85: ['🌨️', '약한 눈보라'], 86: ['❄️', '강한 눈보라'],
    95: ['⛈️', '뇌우'], 96: ['⛈️', '우박 동반 뇌우'], 99: ['⛈️', '강한 우박 뇌우'],
  };
  const DIRS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];

  const card = document.getElementById('weather');
  const input = document.getElementById('w-q');
  const list = document.getElementById('w-list');
  const hint = document.getElementById('w-hint');
  if (!card) return;

  // ─────────────── 한글 → 영어(로마자, 국어의 로마자 표기법) ───────────────
  const CHO = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
  const JUNG = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo',
                'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
  const JONG = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l',
                'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
  // 받침이 다음 글자 첫소리로 넘어갈 때(연음)의 소리: 받침 번호 → 영어
  const LINK = { 1: 'g', 2: 'kk', 4: 'n', 7: 'd', 8: 'r', 16: 'm', 17: 'b', 19: 's', 20: 'ss', 22: 'j', 23: 'ch', 24: 'k', 25: 't', 26: 'p' };

  function isSyllable(ch) { const c = ch.charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3; }
  function hasHangul(s) { return /[ㄱ-ㆎ가-힣]/.test(s); }

  function romanize(text) {
    // 시·군 같은 행정 구역 꼬리는 지오코딩 이름에 없으므로 뗍니다 (평택시 → 평택)
    let t = text.trim();
    if (t.length > 2 && /[시군]$/.test(t)) t = t.slice(0, -1);
    const syl = [...t].map((ch) => {
      if (!isSyllable(ch)) return { raw: ch };
      const n = ch.charCodeAt(0) - 0xac00;
      return { cho: Math.floor(n / 588), jung: Math.floor((n % 588) / 28), jong: n % 28 };
    });
    let out = '';
    for (let i = 0; i < syl.length; i++) {
      const s = syl[i];
      if (s.raw !== undefined) { out += /[\s-]/.test(s.raw) ? ' ' : s.raw; continue; }
      const next = syl[i + 1] && syl[i + 1].raw === undefined ? syl[i + 1] : null;
      let cho = s.cho === 11 ? '' : CHO[s.cho];
      if (s._cho !== undefined) cho = s._cho;
      let jong = s.jong;
      let tail = JONG[jong];
      if (next && jong) {
        if (next.cho === 11 && LINK[jong]) {            // 연음: 한옥 → hanok
          tail = ''; next._cho = LINK[jong];
        } else if (['k', 't', 'p'].includes(tail) && (next.cho === 2 || next.cho === 6)) {
          tail = { k: 'ng', t: 'n', p: 'm' }[tail];      // 비음화: 독립 → dongnip
        } else if (jong === 4 && next.cho === 5) {        // 신라 → silla
          tail = 'l'; next._cho = 'l';
        } else if (jong === 8 && next.cho === 2) {        // 칠낭 → chillang
          next._cho = 'l';
        }
      }
      out += cho + JUNG[s.jung] + tail;
    }
    return out.replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());
  }

  // 초성 검색 ('ㅅ' → 서울, 수원 …)
  const CHO_JAMO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const isJamoOnly = (s) => s.length > 0 && [...s].every((c) => CHO_JAMO.includes(c));
  function choseong(s) {
    return [...s].map((ch) => isSyllable(ch)
      ? CHO_JAMO[Math.floor((ch.charCodeAt(0) - 0xac00) / 588)] : ch).join('');
  }

  // ─────────────── 추천 목록 ───────────────
  let items = [];     // 화면에 보이는 추천
  let active = -1;    // 키보드로 고른 줄
  let seq = 0;        // 늦게 도착한 응답 무시용
  let timer = null;

  function localMatches(q) {
    if (hasHangul(q) && q.length > 2 && /[시군]$/.test(q)) q = q.slice(0, -1); // 평택시 → 평택
    const low = q.toLowerCase();
    const cities = window.KR_CITIES || [];
    const hit = (c) => {
      if (isJamoOnly(q)) return choseong(c[0]).startsWith(q);
      if (hasHangul(q)) return c[0].startsWith(q);
      return c[1].toLowerCase().startsWith(low);
    };
    let r = cities.filter(hit);
    if (!r.length && hasHangul(q) && !isJamoOnly(q)) r = cities.filter((c) => c[0].includes(q));
    return r.slice(0, 8).map((c) => ({
      name: c[0], sub: c[4] + ' · ' + c[1], lat: c[2], lng: c[3],
      label: `${c[0]} (${c[1]}) · ${REGION[c[4]] || c[4]}`,
    }));
  }

  async function geocode(en) {
    const u = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(en) +
      '&count=8&language=ko&countryCode=KR&format=json';
    const r = await fetch(u);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    return (d.results || []).map((x) => {
      const sub = [x.admin2, x.admin1].filter(Boolean).join(' ') || '대한민국';
      return { name: x.name, sub, lat: x.latitude, lng: x.longitude, label: `${x.name} · ${sub}` };
    });
  }

  function showList() {
    list.textContent = '';
    items.forEach((it, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      if (i === active) li.className = 'on';
      const b = document.createElement('b'); b.textContent = it.name;
      const s = document.createElement('small'); s.textContent = ' ' + it.sub;
      li.append(b, s);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(it); });
      list.appendChild(li);
    });
    list.hidden = items.length === 0;
  }

  async function onType() {
    const q = input.value.trim();
    clearTimeout(timer);
    if (!q) { items = []; active = -1; showList(); hint.textContent = ''; return; }
    items = localMatches(q); active = items.length ? 0 : -1;
    showList();
    hint.textContent = '';
    // 목록에서 충분히 못 찾았으면(그리고 2글자 이상이면) 영어로 바꿔 지오코딩 검색
    if (items.length < 3 && q.length >= 2 && !isJamoOnly(q)) {
      const en = hasHangul(q) ? romanize(q) : q;
      if (hasHangul(q)) hint.textContent = `'${q}' → 영어로 변환해 검색: ${en}`;
      const my = ++seq;
      timer = setTimeout(async () => {
        try {
          const extra = await geocode(en);
          if (my !== seq || input.value.trim() !== q) return;
          const seen = new Set(items.map((x) => x.lat.toFixed(2) + ',' + x.lng.toFixed(2)));
          for (const e of extra) {
            const k = e.lat.toFixed(2) + ',' + e.lng.toFixed(2);
            if (!seen.has(k)) { seen.add(k); items.push(e); }
          }
          if (active < 0 && items.length) active = 0;
          showList();
          if (!items.length) hint.textContent = (hint.textContent ? hint.textContent + ' · ' : '') + '검색 결과가 없습니다';
        } catch (e) {
          hint.textContent = '지역 검색 실패: ' + e.message;
        }
      }, 300);
    }
  }

  function choose(it) {
    input.value = it.name;
    items = []; active = -1; showList(); hint.textContent = '';
    current = it;
    loadWeather(true);
  }

  // [검색] 버튼 / Enter: 추천에서 고른 것이 있으면 그것, 없으면 첫 추천,
  // 추천이 아직 없으면(영어 변환 검색이 진행 중) 지금 바로 검색해서 첫 결과를 보여 줍니다.
  async function doSearch() {
    const q = input.value.trim();
    if (!q) { hint.textContent = '지역 이름을 입력하세요'; return; }
    if (items[active] || items[0]) { choose(items[active] || items[0]); return; }
    card.hidden = false; card.className = 'weather loading'; card.textContent = '불러오는 중…';
    clearTimeout(timer); seq++;
    try {
      const found = localMatches(q);
      const hit = found[0] || (await geocode(hasHangul(q) ? romanize(q) : q))[0];
      if (!hit) { card.hidden = true; hint.textContent = `'${q}' 검색 결과가 없습니다`; return; }
      choose(hit);
    } catch (e) {
      card.className = 'weather err';
      card.textContent = '지역 검색 실패: ' + e.message;
    }
  }

  document.getElementById('w-form').addEventListener('submit', (e) => { e.preventDefault(); doSearch(); });
  input.addEventListener('input', onType);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && items.length) { active = (active + 1) % items.length; showList(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && items.length) { active = (active - 1 + items.length) % items.length; showList(); e.preventDefault(); }
    else if (e.key === 'Escape') { items = []; showList(); }
  });
  input.addEventListener('blur', () => { items = []; showList(); });

  // ─────────────── 날씨 표시 ───────────────
  let current = DEFAULT;

  function num(v, d) { return typeof v === 'number' ? v.toFixed(d) : '-'; }

  function render(place, d) {
    const c = d.current;
    const [icon, text] = CODES[c.weather_code] || ['🌡️', '알 수 없음'];
    card.hidden = false;
    card.className = 'weather';
    card.innerHTML =
      '<div class="w-place"></div>' +
      '<div class="w-main"><span class="w-icon"></span><b class="w-temp"></b></div>' +
      '<div class="w-desc"></div>' +
      '<dl class="w-grid">' +
      '<div><dt>체감온도</dt><dd class="w-feel"></dd></div>' +
      '<div><dt>습도</dt><dd class="w-hum"></dd></div>' +
      '<div><dt>풍속</dt><dd class="w-wind"></dd></div>' +
      '<div><dt>강수량</dt><dd class="w-rain"></dd></div>' +
      '</dl><small class="w-note"></small>';
    const set = (sel, v) => { card.querySelector(sel).textContent = v; };
    set('.w-place', place.label || place.name);
    set('.w-icon', icon);
    set('.w-temp', num(c.temperature_2m, 0) + '°C');
    set('.w-desc', text);
    set('.w-feel', num(c.apparent_temperature, 0) + '°C');
    set('.w-hum', num(c.relative_humidity_2m, 0) + '%');
    set('.w-wind', num(c.wind_speed_10m, 0) + ' km/h');
    set('.w-rain', num(c.precipitation, 1) + ' mm');
    set('.w-note', `기준 시각: ${String(c.time).replace('T', ' ')} (현지) · 출처 Open-Meteo`);
  }

  async function loadWeather(showLoading) {
    const place = current;
    if (showLoading) { card.hidden = false; card.className = 'weather loading'; card.textContent = '불러오는 중…'; }
    const u = 'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${place.lat}&longitude=${place.lng}` +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m' +
      '&wind_speed_unit=kmh&timezone=Asia%2FSeoul';
    try {
      const r = await fetch(u);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (place !== current) return;   // 그 사이 다른 지역을 골랐으면 버림
      render(place, d);
    } catch (e) {
      card.hidden = false;
      card.className = 'weather err';
      card.textContent = '날씨를 불러오지 못했습니다 (' + e.message + ')';
    }
  }

  loadWeather(true);
  setInterval(() => loadWeather(false), REFRESH_MS);
})();
