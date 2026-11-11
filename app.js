// 프론트에는 가공·등급 계산·예측 코드가 한 줄도 없습니다.
// fetch로 FastAPI에게 결과만 받아서 색칠만 합니다. (역할 분리)
const API = window.APP_CONFIG.API_BASE;
const $ = (id) => document.getElementById(id);

function badge(grade) {
  if (!grade) return '<span class="badge none">-</span>';
  const span = document.createElement('span');
  span.className = 'badge g-' + grade;
  span.textContent = grade;
  return span.outerHTML;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

async function getJSON(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

// 시간별 기록(실선)과 1시간 뒤 예측값(점선·빨간 점)을 한 그래프로
function drawChart(station, hist, predicted) {
  const pts = hist.filter((h) => h.pm10 != null);
  if (pts.length < 2) return '<small>그래프를 그릴 기록이 아직 부족합니다.</small>';
  const W = 640, H = 170, L = 38, R = 14, T = 14, B = 30;
  const vals = pts.map((p) => p.pm10);
  const all = predicted != null ? vals.concat(predicted) : vals;
  const lo = Math.max(0, Math.floor(Math.min(...all) / 10) * 10 - 10);
  const hi = Math.ceil(Math.max(...all) / 10) * 10 + 10;
  const n = pts.length + (predicted != null ? 1 : 0);
  const x = (i) => L + (i * (W - L - R)) / Math.max(1, n - 1);
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.pm10).toFixed(1)}`).join(' ');
  const last = pts.length - 1;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(station)} PM10 시간별 추이">`;
  for (const g of [lo, (lo + hi) / 2, hi]) {
    svg += `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" class="grid"/>` +
           `<text x="${L - 6}" y="${y(g) + 4}" text-anchor="end" class="axis">${Math.round(g)}</text>`;
  }
  svg += `<polyline points="${line}" class="series"/>`;
  if (predicted != null) {
    svg += `<line x1="${x(last)}" y1="${y(vals[last])}" x2="${x(last + 1)}" y2="${y(predicted)}" class="forecast"/>` +
           `<circle cx="${x(last + 1)}" cy="${y(predicted)}" r="5" class="predpt"/>` +
           `<text x="${x(last + 1)}" y="${y(predicted) - 9}" text-anchor="end" class="axis">예측 ${predicted}</text>`;
  }
  svg += `<text x="${L}" y="${H - 8}" class="axis">${esc(pts[0].time.slice(5))}</text>` +
         `<text x="${x(last)}" y="${H - 8}" text-anchor="end" class="axis">${esc(pts[last].time.slice(5))}</text></svg>`;
  return `<b>${esc(station)}</b> PM10 시간별 기록 <small>(DB에 쌓인 ${pts.length}개${predicted != null ? ' + 1시간 뒤 예측' : ''})</small>${svg}`;
}

async function load() {
  try {
    const [health, summary, rows, stats] = await Promise.all([
      getJSON('/health'),
      getJSON('/air/summary'),
      getJSON('/air/latest'),
      getJSON('/air/stats'),
    ]);

    $('status').textContent =
      `연결됨 · ${API} · 모드: ${health.mode === 'demo' ? '연습 데이터' : '에어코리아 실데이터'}` +
      `${health.demo_reason ? ' (' + health.demo_reason + ')' : ''} · 저장소: ${health.store}`;
    $('status').className = 'status ok';

    // Supabase에 실제로 쌓이고 있는지 한눈에
    const d = $('dbstat');
    d.hidden = false;
    d.innerHTML =
      `<b>🗄 DB 저장 현황</b> (${esc(stats.mode === 'demo' ? '연습' : '실데이터')}) · ` +
      `누적 <b>${esc(stats.rows)}</b>건 · 수집 <b>${esc(stats.runs)}</b>회` +
      (stats.first ? ` · ${esc(stats.first)} ~ ${esc(stats.last)}` : '') +
      `<br><small>서버가 1시간마다 새 값을 받아 같은 측정소·같은 시각은 덮어쓰고, 새 시각은 계속 쌓습니다.</small>`;

    const s = $('summary');
    s.hidden = false;
    s.innerHTML =
      `<div><b>${esc(summary.stations)}</b><span>측정소</span></div>` +
      `<div><b>${esc(summary.avg_pm10 ?? '-')}</b><span>평균 PM10 ${badge(summary.avg_pm10_grade)}</span></div>` +
      `<div><b>${esc(summary.avg_pm25 ?? '-')}</b><span>평균 PM2.5</span></div>` +
      `<div><b>${esc(summary.worst_station?.station ?? '-')}</b><span>가장 나쁜 곳</span></div>`;

    $('rows').innerHTML = rows.map((r) => `
      <tr>
        <td>${esc(r.station)}</td>
        <td>${esc(r.time.slice(11))}</td>
        <td>${esc(r.pm10 ?? '-')} ${badge(r.pm10_grade)}</td>
        <td>${esc(r.pm25 ?? '-')} ${badge(r.pm25_grade)}</td>
        <td><button data-st="${esc(r.station)}">1시간 뒤?</button></td>
      </tr>`).join('');
  } catch (e) {
    $('status').textContent = `백엔드에 연결할 수 없습니다 (${API}) — 서버가 켜져 있는지, FRONT_ORIGINS가 맞는지 확인하세요. ${e.message}`;
    $('status').className = 'status err';
  }
}

$('rows').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-st]');
  if (!btn) return;
  const p = $('pred'), c = $('chart');
  const st = encodeURIComponent(btn.dataset.st);
  p.hidden = false;
  p.textContent = '예측 중…';
  try {
    const [d, hist] = await Promise.all([
      getJSON('/air/predict?station=' + st),
      getJSON('/air/history?limit=48&station=' + st),
    ]);
    p.innerHTML = d.ready
      ? `<b>${esc(d.station)}</b> 1시간 뒤 PM10 약 <b>${esc(d.next_pm10)}</b> ${badge(d.next_grade)} ` +
        `<small>(평균 오차 ±${esc(d.avg_error)} · 학습 데이터 ${esc(d.points)}개 · ${esc(d.model)})</small>`
      : esc(d.message);
    c.hidden = false;
    c.innerHTML = drawChart(btn.dataset.st, hist, d.ready ? d.next_pm10 : null);
  } catch (e) {
    p.textContent = '예측 실패: ' + e.message;
    c.hidden = true;
  }
});

load();
