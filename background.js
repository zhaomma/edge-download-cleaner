'use strict';

const STORAGE_KEY = 'cleanerState';
const ALARM_NAME = 'download-clean';

/* ---------- 存储 ---------- */

async function getState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || null;
}

async function setState(s) {
  await chrome.storage.local.set({ [STORAGE_KEY]: s });
}

/* ---------- 调度 ---------- */

/** 按当前 endTime 注册一次性闹钟（毫秒精度，支持任意秒数） */
async function scheduleNext() {
  const s = await getState();
  if (!s || !s.running || !s.endTime) return;
  await chrome.alarms.create(ALARM_NAME, { when: s.endTime });
}

/* ---------- 清理 ---------- */

/** 清空下载记录并记录结果，返回清除条数 */
async function doClean() {
  let count = 0;
  try {
    const items = await chrome.downloads.search({});
    count = items.length;
    if (count > 0) {
      await chrome.downloads.erase({});
    }
  } catch (err) {
    console.error('清理下载记录失败：', err);
  }
  const s = await getState();
  if (s) {
    s.lastCleanedAt = Date.now();
    s.lastCleanedCount = count;
    await setState(s);
  }
  return count;
}

/* ---------- 循环 ---------- */

/** 一轮循环：到期清理 → 重置 endTime → 续排下一次 */
async function runCycle() {
  const s = await getState();
  if (!s || !s.running) return;

  // 极端情况：闹钟早于 endTime 触发，不清理，仅重新排程
  if (Date.now() < s.endTime - 1000) {
    await scheduleNext();
    return;
  }

  const count = await doClean();

  const ns = await getState();
  if (ns && ns.running) {
    ns.endTime = Date.now() + ns.totalSeconds * 1000;
    await setState(ns);
    await scheduleNext();
  }
  return count;
}

/* ---------- 事件 ---------- */

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === ALARM_NAME) {
    runCycle();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg && msg.type === 'start') {
        // popup 已写入新状态，这里重建闹钟
        await chrome.alarms.clear(ALARM_NAME);
        await scheduleNext();
        sendResponse({ ok: true });
      } else if (msg && msg.type === 'stop') {
        await chrome.alarms.clear(ALARM_NAME);
        sendResponse({ ok: true });
      } else if (msg && msg.type === 'clean-now') {
        // 立即清理；若在运行中则重置计时并续排
        await chrome.alarms.clear(ALARM_NAME);
        const count = await doClean();
        const ns = await getState();
        if (ns && ns.running) {
          ns.endTime = Date.now() + ns.totalSeconds * 1000;
          await setState(ns);
          await scheduleNext();
        }
        sendResponse({ ok: true, count });
      } else {
        sendResponse({ ok: false, error: 'unknown message' });
      }
    } catch (err) {
      console.error('处理消息失败：', err);
      sendResponse({ ok: false, error: String(err) });
    }
  })();
  return true; // 保持异步通道
});
