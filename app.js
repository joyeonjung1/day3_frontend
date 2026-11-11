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

async function load() {
  try {
    const [health, summary, rows] = await Promise.all([
      getJSON('/health'),
      getJSON('/air/summary'),
      getJSON('/air/latest'),
    ]);

    $('status').textContent =
      `연결됨 · ${API} · 모드: ${health.mode === 'demo' ? '연습 데이터' : '에어코리아 실데이터'} · 저장소: ${health.store}`;
    $('status').className = 'status ok';

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
  const p = $('pred');
  p.hidden = false;
  p.textContent = '예측 중…';
  try {
    const d = await getJSON('/air/predict?station=' + encodeURIComponent(btn.dataset.st));
    p.innerHTML = d.ready
      ? `<b>${esc(d.station)}</b> 1시간 뒤 PM10 약 <b>${esc(d.next_pm10)}</b> ${badge(d.next_grade)} ` +
        `<small>(평균 오차 ±${esc(d.avg_error)} · 학습 데이터 ${esc(d.points)}개 · ${esc(d.model)})</small>`
      : esc(d.message);
  } catch (e) {
    p.textContent = '예측 실패: ' + e.message;
  }
});

load();
