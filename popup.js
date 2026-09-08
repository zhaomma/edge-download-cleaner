'use strict';

const STORAGE_KEY = 'cleanerState';

let state = null;
let timer = null;
let lastSync = 0;

const el = {
  status: document.getElementById('status'),
  countdown: document.getElementById('countdown'),
  seconds: document.getElementById('seconds'),
  toggleBtn: document.getElementById('toggleBtn'),
  cleanBtn: document.getElementById('cleanBtn'),
  lastInfo: document.getElementById('lastInfo')
};

/* ---------- 存储 ---------- */

async function loadState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  state = data[STORAGE_KEY] || null;
}

async function saveState() {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

/** 从后台同步状态（后台清理后会更新 endTime / lastCleanedAt） */
async function syncState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  state = data[STORAGE_KEY] || null;
}

/* ---------- 格式化 ---------- */

function fmtCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
}

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

/* ---------- UI ---------- */

function updateUI() {
  const running = !!(state && state.running);

  el.status.textContent = running ? '运行中' : '已停止';
  el.status.className = 'badge ' + (running ? 'on' : 'off');

  if (running) {
    el.countdown.textContent = fmtCountdown(state.endTime - Date.now());
    el.countdown.classList.remove('idle');
  } else {
    el.countdown.textContent = '--:--';
    el.countdown.classList.add('idle');
  }

  el.seconds.disabled = running;
  if (state && state.totalSeconds) {
    el.seconds.value = state.totalSeconds;
  }

  el.toggleBtn.textContent = running ? '停止' : '启动';
  el.toggleBtn.className = 'btn ' + (running ? 'stop' : 'start');

  el.lastInfo.textContent = (state && state.lastCleanedAt)
    ? '最近清理：' + fmtTime(state.lastCleanedAt) + ' · ' + (state.lastCleanedCount === null ? 0 : state.lastCleanedCount) + ' 条'
    : '最近清理：—';
}

/* ---------- 循环显示（实际循环由后台 alarms 驱动） ---------- */

async function onTick() {
  const now = Date.now();
  if (now - lastSync >= 1000) {
    lastSync = now;
    await syncState();
  }
  updateUI();
}

/* ---------- 操作 ---------- */

async function start() {
  const seconds = Math.max(1, Math.floor(Number(el.seconds.value) || 60));
  state = {
    running: true,
    totalSeconds: seconds,
    endTime: Date.now() + seconds * 1000,
    lastCleanedAt: state ? state.lastCleanedAt : null,
    lastCleanedCount: state ? state.lastCleanedCount : null
  };
  await saveState();
  await chrome.runtime.sendMessage({ type: 'start' });
  updateUI();
}

async function stop() {
  if (state) {
    state.running = false;
    state.endTime = null;
    await saveState();
  }
  await chrome.runtime.sendMessage({ type: 'stop' });
  updateUI();
}

async function cleanNow() {
  el.cleanBtn.disabled = true;
  try {
    await chrome.runtime.sendMessage({ type: 'clean-now' });
    await syncState();
  } finally {
    el.cleanBtn.disabled = false;
    updateUI();
  }
}

el.toggleBtn.addEventListener('click', () => {
  if (state && state.running) {
    stop();
  } else {
    start();
  }
});

el.cleanBtn.addEventListener('click', () => {
  cleanNow();
});

/* ---------- 初始化 ---------- */

(async function init() {
  await loadState();
  if (state && state.running) {
    const remaining = state.endTime - Date.now();
    if (remaining <= 0) {
      // 弹窗打开时已到期：请后台立即清理并进入下一轮
      await chrome.runtime.sendMessage({ type: 'clean-now' });
      await syncState();
    }
  }
  updateUI();
  timer = setInterval(onTick, 250);
})();
