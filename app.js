// ТЭЦ Симулятор. Тик 1 сек. DOM для ползунков строится один раз (иначе drag ломается).
const MAX_MW = 60;      // пар с одного котла на 100%
const TURB_MAX = 60;    // электричество с одной турбины на 100% нагрузки
const SHIFT_LEN = 600;
const BOOM_TEMP = 480;
const BOOM_PRESS = 13;
const BOOM_TIME = 8;

const HEAT_OPT = 75;
const HEAT_WARN_LOW = 50;
const HEAT_WARN_HIGH = 90;
const HEAT_OK_MIN = 65;
const HEAT_OK_MAX = 85;

const NO_POWER_MW = 5;
const NO_POWER_MAX = 10;
const LOW_HEAT_MAX = 15;
const OVERHEAT_MAX = 30; // тепло 90-100% столько сек -> перетоп/поражение
const SURPLUS_MW = 30;   // баланс выше этого — опасный избыток
const SURPLUS_MAX = 15;  // столько сек избытка -> поражение

const state = {
  t: 0,
  demand: 70,
  over: false,
  paused: false,
  noPowerSec: 0,
  lowHeatSec: 0,
  overheatSec: 0,
  surplusSec: 0,
  heat: 75,
  thermosAt: null,
  boilers: [
    { id: 1, name: 'Котел-1', power: 60, rad: 35, temp: 285, pressure: 8, water: 80, cooling: true, bad: 0 },
    { id: 2, name: 'Котел-2', power: 60, rad: 35, temp: 285, pressure: 8, water: 80, cooling: true, bad: 0 },
  ],
  turbines: [
    { id: 1, name: 'Турбина-1', load: 60, valve: 85 },
    { id: 2, name: 'Турбина-2', load: 60, valve: 85 },
  ],
  events: [
    { at: 20,  text: 'Утренний пик: город проснулся, спрос +20 МВт (60 сек)', delta: 20, done: false },
    { at: 30,  text: 'Подключен новый микрорайон: спрос +30 МВт', delta: 30, done: false },
    { at: 80,  text: 'Утренний пик прошел: спрос −20 МВт', delta: -20, done: false },
    { at: 120, text: 'Завод встал на обслуживание: спрос −40 МВт', delta: -40, done: false },
    { at: 170, text: 'Оттепель +5°C: обогреватели выключили, спрос −25 МВт', delta: -25, done: false },
    { at: 200, text: 'Запустили дата-центр: спрос +20 МВт', delta: 20, done: false },
    { at: 230, text: 'Выходной: офисы закрыты, спрос −15 МВт', delta: -15, done: false },
    { at: 260, text: 'Завод запустил ночную смену: спрос +25 МВт', delta: 25, done: false },
    { at: 300, text: 'Авария на линии: часть города отключена, спрос −30 МВт (60 сек)', delta: -30, done: false },
    { at: 330, text: 'Матч на стадионе: освещение и трансляция, спрос +15 МВт (90 сек)', delta: 15, done: false },
    { at: 360, text: 'Линию починили: потребители вернулись, спрос +30 МВт!', delta: 30, done: false },
    { at: 400, text: 'Ночь: город спит, спрос −20 МВт', delta: -20, done: false },
    { at: 420, text: 'Матч окончен: спрос −15 МВт', delta: -15, done: false },
    { at: 440, text: 'Резкое похолодание −25°C: спрос +35 МВт!', delta: 35, done: false },
    { at: 470, text: 'Новая трамвайная линия: спрос +15 МВт', delta: 15, done: false },
    { at: 490, text: 'Акция «Час Земли»: спрос −15 МВт (60 сек)', delta: -15, done: false },
    { at: 510, text: 'Завод перешел на свою генерацию: спрос −25 МВт', delta: -25, done: false },
    { at: 530, text: '«Час Земли» окончен: спрос +15 МВт', delta: 15, done: false },
    { at: 560, text: 'Вечерний пик: спрос +25 МВт!', delta: 25, done: false },
  ],
  log: [],
};

function steamMW() {
  return state.boilers.reduce((s, b) => s + (b.power / 100) * MAX_MW, 0);
}
function turbCapMW() {
  return state.turbines.reduce((s, t) => s + (t.load / 100) * TURB_MAX, 0);
}
function produceMW() {
  return Math.min(steamMW(), turbCapMW());
}
function turbineActual(t) {
  const cap = state.turbines.reduce((s, x) => s + (x.load / 100) * TURB_MAX, 0);
  if (cap <= 0) return 0;
  return produceMW() * ((t.load / 100 * TURB_MAX) / cap);
}
function heatTarget() {
  const prod = produceMW();
  const valveAvg = state.turbines.reduce((s, t) => s + t.valve, 0) / state.turbines.length / 100;
  const radAvg = state.boilers.reduce((s, b) => s + b.rad, 0) / state.boilers.length;
  const radFactor = 1 - radAvg / 250; // открытый радиатор отбирает тепло у домов
  if (state.demand <= 0) return 100;
  return Math.max(0, Math.min(100, (prod / state.demand) * valveAvg * radFactor * 100));
}
function heatPct() {
  return state.heat; // сглаженное: дома остывают/греются постепенно
}

function log(msg) {
  const mm = String(Math.floor(state.t / 60)).padStart(2, '0');
  const ss = String(state.t % 60).padStart(2, '0');
  state.log.unshift(`[${mm}:${ss}] ${msg}`);
  state.log = state.log.slice(0, 30);
}

function tick() {
  if (state.over || state.paused) return;
  state.t++;

  state.demand += (Math.random() - 0.5) * 2;
  state.demand = Math.max(30, Math.min(140, state.demand));

  for (const e of state.events) {
    if (!e.done && state.t >= e.at) {
      e.done = true;
      state.demand = Math.max(20, state.demand + e.delta);
      log('ЗАДАНИЕ: ' + e.text);
      showTask(e.text);
    }
  }

  for (const b of state.boilers) {
    const targetTemp = 100 + b.power * 4 - b.rad * 1.5; // открытый радиатор охлаждает
    const coolK = b.cooling ? 0.12 : 0.04;
    b.temp += (targetTemp - b.temp) * coolK;
    if (b.water < 20) b.temp += 6;
    // закрытый радиатор: вода сильнее греется и испаряется, доливать чаще
    b.water = Math.max(0, b.water - b.power * 0.008 * (1 - b.rad / 200) - (b.cooling ? 0.15 : 0));

    const targetPress = (b.power / 100) * 12 * (1 + (100 - b.water) / 200);
    b.pressure += (targetPress - b.pressure) * 0.15;

    const critical = b.temp > BOOM_TEMP || b.pressure > BOOM_PRESS;
    b.bad = critical ? b.bad + 1 : 0;
    if (b.bad >= BOOM_TIME) {
      gameOver(false, `${b.name} взорвался! T=${Math.round(b.temp)}°C, P=${b.pressure.toFixed(1)} атм.`);
      return;
    }
  }

  const prod = produceMW();
  // Тепловая инерция домов: идут к цели постепенно (~15% в сек)
  state.heat += (heatTarget() - state.heat) * 0.15;
  const heat = heatPct();

  state.noPowerSec = prod < NO_POWER_MW ? state.noPowerSec + 1 : 0;
  if (state.noPowerSec >= NO_POWER_MAX) {
    gameOver(false, `Вы уволены: 10 секунд станция не выдавала электричество (${Math.round(prod)} МВт).`);
    return;
  }
  state.surplusSec = (prod - state.demand) > SURPLUS_MW ? state.surplusSec + 1 : 0;
  if (state.surplusSec >= SURPLUS_MAX) {
    gameOver(false, 'Вы огонь! - В Вас ударила молния от генератора.');
    return;
  }
  state.lowHeatSec = heat < HEAT_WARN_LOW ? state.lowHeatSec + 1 : 0;
  if (state.lowHeatSec >= LOW_HEAT_MAX) {
    gameOver(false, `Вы уволены: тепло ниже 50% дольше 15 сек (сейчас ${Math.round(heat)}%).`);
    return;
  }
  state.overheatSec = (heat >= HEAT_WARN_HIGH && heat <= 100) ? state.overheatSec + 1 : 0;
  if (state.overheatSec >= OVERHEAT_MAX) {
    gameOver(false, 'Вы сгорели на работе, а с Вами все жильцы города.');
    return;
  }
  if (state.t >= SHIFT_LEN) {
    gameOver(true, `Смена завершена! Тепло: ${Math.round(heat)}% (норма ${HEAT_OPT}%).`);
    return;
  }

  // Термос с тяжелой водой: через 30 сек игрового времени
  if (state.thermosAt !== null && state.t - state.thermosAt >= 30) {
    state.thermosAt = null;
    gameOver(false, 'Вы умерли от сильного поноса от тяжелой воды.');
    return;
  }

  refresh();
}

function showTask(text) {
  const el = document.getElementById('task');
  el.textContent = '⚠ ' + text;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 8000);
}

function gameOver(win, text) {
  state.over = true;
  document.getElementById('go-title').textContent = win ? 'Смена сдана!' : 'Конец смены!';
  document.getElementById('go-text').textContent = text;
  const go = document.getElementById('gameover');
  go.classList.remove('hidden');
  go.classList.toggle('win', win);
  if (!win) {
    document.querySelectorAll('input[type=range]').forEach(el => { el.disabled = true; });
    document.querySelectorAll('button[data-act]').forEach(el => { el.disabled = true; });
  }
  go.scrollIntoView({ behavior: 'smooth', block: 'start' });
  log((win ? 'ПОБЕДА. ' : 'ПРОИГРЫШ. ') + text);
  refresh();
}

function togglePause() {
  if (state.over) return;
  state.paused = !state.paused;
  document.getElementById('extra-menu').classList.add('hidden');
  log(state.paused ? 'Пауза.' : 'Продолжаем смену.');
  refresh();
}

// --- Статичный DOM (строится 1 раз, чтобы ползунки таскались) ---
function boilerHTML(b) {
  return `
    <h3>${b.name}</h3>
    <div class="unit-grid">
      <div class="sensors">
        <div>Температура: <span id="btt-${b.id}"></span><div class="bar temp" id="btbar-${b.id}"><div></div></div></div>
        <div>Давление: <span id="bpr-${b.id}"></span><div class="bar" id="bprbar-${b.id}"><div></div></div></div>
        <div>Вода: <span id="bw-${b.id}"></span><div class="bar"><div id="bwbar-${b.id}"></div></div></div>
      </div>
      <div class="unit-status"><div class="prod-line" id="bpmw-${b.id}"></div></div>
      <div class="controls">
        <label>Мощность: <b id="bpv-${b.id}"></b>
          <input type="range" min="0" max="100" step="1" value="${b.power}" data-kind="bpower" data-id="${b.id}">
        </label>
        <label>Радиатор: <b id="brv-${b.id}"></b>
          <input type="range" min="0" max="100" step="1" value="${b.rad}" data-kind="brad" data-id="${b.id}">
        </label>
        <div class="prod-line" id="tmw-${b.id}"></div>
        <label>Турбина-${b.id}: нагрузка <b id="tlv-${b.id}"></b>
          <input type="range" min="0" max="100" step="1" value="${turbineLoad(b.id)}" data-kind="tload" data-id="${b.id}">
        </label>
        <div class="row">
          <button data-act="water" data-id="${b.id}">+ Добавить воду</button>
          <button data-act="cool" data-id="${b.id}" id="bc-${b.id}"></button>
        </div>
      </div>
    </div>`;
}

function turbineLoad(id) {
  const t = state.turbines.find(x => x.id === id);
  return t ? t.load : 0;
}

function buildStatic() {
  document.getElementById('main-boiler').innerHTML = boilerHTML(state.boilers[0]);
  document.getElementById('boilers').innerHTML =
    state.boilers.map(b => `<div class="boiler">${boilerHTML(b)}</div>`).join('');
  document.getElementById('valves').innerHTML =
    state.turbines.map(t => `<div class="turbine">${valveHTML(t)}</div>`).join('');
}

function valveHTML(t) {
  return `
    <h3>Кран ${t.name}</h3>
    <div class="unit-grid simple">
      <div class="unit-status"><div class="prod-line">Открытие: <b id="tvv-${t.id}"></b></div></div>
      <div class="controls">
        <label>Кран:
          <input type="range" min="0" max="100" step="1" value="${t.valve}" data-kind="tvalve" data-id="${t.id}">
        </label>
      </div>
    </div>`;
}

function setSlider(kind, id, val) {
  document.querySelectorAll(`input[data-kind="${kind}"][data-id="${id}"]`).forEach(inp => {
    if (document.activeElement !== inp) inp.value = val;
  });
}

function refresh() {
  const prod = produceMW();
  const steam = steamMW();
  const cap = turbCapMW();
  const bal = prod - state.demand;
  const heat = heatPct();

  document.getElementById('m-demand').textContent = `${Math.round(state.demand)} МВт`;
  document.getElementById('m-produce').textContent = `${Math.round(prod)} МВт`;
  const bEl = document.getElementById('m-balance');
  bEl.textContent = `${bal >= 0 ? '+' : ''}${Math.round(bal)} МВт`;
  bEl.style.color = Math.abs(bal) < 10 ? '#4ade80' : '#ff9f2e';

  const hEl = document.getElementById('m-heat');
  hEl.textContent = `${Math.round(heat)}% (норма ${HEAT_OPT}%)`;
  hEl.style.color = (heat >= HEAT_OK_MIN && heat <= HEAT_OK_MAX) ? '#4ade80'
    : (heat < HEAT_WARN_LOW || heat > HEAT_WARN_HIGH) ? '#ff3b3b' : '#ff9f2e';

  document.getElementById('m-time').textContent =
    `${String(Math.floor(state.t / 60)).padStart(2, '0')}:${String(state.t % 60).padStart(2, '0')} / 10:00`;

  document.getElementById('btn-pause').textContent = state.paused ? 'Продолжить' : 'Пауза';
  document.getElementById('paused').classList.toggle('hidden', !state.paused);

  // Котлы
  for (const b of state.boilers) {
    const mw = (b.power / 100 * MAX_MW);
    document.querySelectorAll(`#bpmw-${b.id}`).forEach(el => {
      el.innerHTML = `Вырабатывает пара: <b>${Math.round(mw)} МВт</b> <small>(${b.power}%)</small>`;
    });
    document.querySelectorAll(`#bpv-${b.id}`).forEach(el => { el.textContent = `${b.power}%`; });
    document.querySelectorAll(`#btt-${b.id}`).forEach(el => { el.textContent = `${Math.round(b.temp)}°C`; });
    document.querySelectorAll(`#btbar-${b.id} > div`).forEach(el => {
      el.style.width = `${Math.min(100, b.temp / 5)}%`;
      el.parentElement.classList.toggle('danger', b.temp > BOOM_TEMP - 40);
    });
    document.querySelectorAll(`#bpr-${b.id}`).forEach(el => { el.textContent = `${b.pressure.toFixed(1)} атм`; });
    document.querySelectorAll(`#bprbar-${b.id} > div`).forEach(el => {
      el.style.width = `${Math.min(100, b.pressure / BOOM_PRESS * 100)}%`;
      el.parentElement.classList.toggle('danger', b.pressure > BOOM_PRESS - 1.5);
    });
    document.querySelectorAll(`#bw-${b.id}`).forEach(el => { el.textContent = `${Math.round(b.water)}%`; });
    document.querySelectorAll(`#bwbar-${b.id}`).forEach(el => { el.style.width = `${b.water}%`; });
    document.querySelectorAll(`#bc-${b.id}`).forEach(el => {
      el.textContent = b.cooling ? 'Охлаждение: ВКЛ' : 'Охлаждение: ВЫКЛ';
      el.classList.toggle('on', b.cooling);
    });
    setSlider('bpower', b.id, b.power);
    document.querySelectorAll(`#brv-${b.id}`).forEach(el => { el.textContent = `${b.rad}%`; });
    setSlider('brad', b.id, b.rad);
  }

  // Турбины (ползунки живут в карточках котлов)
  for (const t of state.turbines) {
    document.querySelectorAll(`#tmw-${t.id}`).forEach(el => { el.innerHTML = `Турбина: <b>${Math.round(turbineActual(t))} МВт</b> <small>(нагрузка ${t.load}%)</small>`; });
    document.querySelectorAll(`#tlv-${t.id}`).forEach(el => { el.textContent = `${t.load}%`; });
    document.querySelectorAll(`#tvv-${t.id}`).forEach(el => { el.textContent = `${t.valve}%`; });
    setSlider('tload', t.id, t.load);
    setSlider('tvalve', t.id, t.valve);
  }

  // Панель тепла
  const valveAvg = Math.round(state.turbines.reduce((s, t) => s + t.valve, 0) / state.turbines.length);
  const radAvg = Math.round(state.boilers.reduce((s, b) => s + b.rad, 0) / state.boilers.length);
  document.getElementById('heat-info').innerHTML =
    `В домах: <b>${Math.round(heat)}%</b> (норма ${HEAT_OPT}%). Краны в среднем: ${valveAvg}%, радиаторы: ${radAvg}%. Пар: ${Math.round(steam)} МВт, турбины: ${Math.round(cap)} МВт.`;
  document.getElementById('heat-bar').style.width = `${Math.round(heat)}%`;

  // Предупреждения
  const alarm = document.getElementById('alarm');
  const msgs = [];
  const badB = state.boilers.find(b => b.temp > BOOM_TEMP - 40 || b.pressure > BOOM_PRESS - 1.5 || b.water < 20);
  if (badB) msgs.push(`${badB.name}: перегрев / давление / мало воды!`);
  if (steamMW() - turbCapMW() > 10) msgs.push(`Пар впустую: котлы дают ${Math.round(steamMW())} МВт, а турбины берут ${Math.round(turbCapMW())}. Подними нагрузку турбин!`);
  if (heat < HEAT_WARN_LOW) msgs.push(`Холодно: ${Math.round(heat)}% (ниже ${HEAT_WARN_LOW}%). Открой краны / подними мощность / прикрой радиаторы. До замерзания: ${LOW_HEAT_MAX - state.lowHeatSec} сек.`);
  if (heat > HEAT_WARN_HIGH) msgs.push(`Перетоп: ${Math.round(heat)}% (выше ${HEAT_WARN_HIGH}%). Прикрой краны / открой радиаторы. До беды: ${OVERHEAT_MAX - state.overheatSec} сек.`);
  if (prod < NO_POWER_MW) msgs.push(`Нет электричества: ${Math.round(prod)} МВт. До увольнения: ${NO_POWER_MAX - state.noPowerSec} сек.`);
  if ((prod - state.demand) > SURPLUS_MW) msgs.push(`Избыток: +${Math.round(prod - state.demand)} МВт (больше +${SURPLUS_MW}). До беды: ${SURPLUS_MAX - state.surplusSec} сек.`);
  if (msgs.length && !state.over) {
    alarm.innerHTML = 'ВНИМАНИЕ: ' + msgs.join('<br>');
    alarm.classList.remove('hidden');
  } else alarm.classList.add('hidden');

  const logHtml = state.log.map(x => `<div>${x}</div>`).join('');
  document.getElementById('log-main').innerHTML = logHtml;
  document.getElementById('log-full').innerHTML = logHtml;
}

document.addEventListener('input', e => {
  const k = e.target.dataset.kind;
  const id = +e.target.dataset.id;
  if (!k) return;
  if (k === 'bpower') state.boilers.find(x => x.id === id).power = +e.target.value;
  if (k === 'brad') state.boilers.find(x => x.id === id).rad = +e.target.value;
  if (k === 'tload') state.turbines.find(x => x.id === id).load = +e.target.value;
  if (k === 'tvalve') state.turbines.find(x => x.id === id).valve = +e.target.value;
  refresh();
});
document.addEventListener('click', e => {
  const { act, id } = e.target.dataset;
  if (e.target.id === 'btn-help-close') { document.getElementById('help').classList.add('hidden'); return; }
  if (!act) return;
  const b = state.boilers.find(x => x.id == id);
  if (act === 'water') { b.water = Math.min(100, b.water + 20); log(`${b.name}: добавили воду.`); }
  if (act === 'cool') { b.cooling = !b.cooling; log(`${b.name}: охлаждение ${b.cooling ? 'ВКЛ' : 'ВЫКЛ'}.`); }
  refresh();
});
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !['INPUT', 'BUTTON', 'TEXTAREA'].includes(e.target.tagName)) {
    e.preventDefault();
    togglePause();
  }
  if (e.key === 'Escape') document.getElementById('help').classList.add('hidden');
});
document.getElementById('tab-main').onclick = () => {
  document.getElementById('screen-main').classList.remove('hidden');
  document.getElementById('screen-full').classList.add('hidden');
  document.getElementById('tab-main').classList.add('active');
  document.getElementById('tab-full').classList.remove('active');
};
document.getElementById('tab-full').onclick = () => {
  document.getElementById('screen-full').classList.remove('hidden');
  document.getElementById('screen-main').classList.add('hidden');
  document.getElementById('tab-full').classList.add('active');
  document.getElementById('tab-main').classList.remove('active');
};
document.getElementById('btn-restart').onclick = () => location.reload();
document.getElementById('btn-pause').onclick = togglePause;
document.getElementById('btn-extra').onclick = () => document.getElementById('extra-menu').classList.toggle('hidden');
document.getElementById('btn-quit').onclick = () => gameOver(true, 'Вы уволились - это было Ваше лучшее решение.');
document.getElementById('btn-thermos').onclick = (e) => {
  if (state.thermosAt !== null || state.over) return;
  state.thermosAt = state.t;
  log('Ты набрал тяжелой воды в термос. Вроде ничего не произошло...');
  e.target.disabled = true;
  e.target.textContent = 'Термос набран...';
  refresh();
};
document.getElementById('btn-help').onclick = () => document.getElementById('help').classList.remove('hidden');
document.getElementById('help').onclick = e => {
  if (e.target.id === 'help') e.target.classList.add('hidden');
};

buildStatic();
log('Смена началась. Держи тепло около 75%, выработку ≈ спросу.');
refresh();
setInterval(tick, 1000);
