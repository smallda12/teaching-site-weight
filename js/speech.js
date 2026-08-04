/* ==========================================================
   語音模組
   ----------------------------------------------------------
   說話(src)      → 播放預產 MP3（教材固定文字，edge-tts 高音質）
   唸(text)       → 瀏覽器即時合成（學生姓名、計時器說明等動態文字）
   停止()         → 停掉目前所有語音
   ========================================================== */
window.語音 = (function () {
  let 目前音檔 = null;
  let 解鎖 = false;
  let 序號 = 0;      // 每次「停止」就加一，用來取消還沒播完的多段語音
  let 目前收 = null; // 目前這段語音的收尾函式，被打斷時要立刻結束它的 Promise

  /* iOS/Safari 需要使用者互動後才允許播音，這裡做一次靜音解鎖 */
  function 初始化解鎖() {
    if (解鎖) return;
    解鎖 = true;
    try {
      speechSynthesis.getVoices();
    } catch (e) {}
  }
  document.addEventListener("pointerdown", 初始化解鎖, { once: true });

  /* 停止目前語音。重點：要把還在等待的 Promise 立刻用「中斷」結束，
     否則呼叫端會一直卡到逾時，畫面就會延遲好幾秒才動。 */
  function 停止() {
    序號++;
    if (目前音檔) {
      目前音檔.pause();
      目前音檔.currentTime = 0;
      目前音檔 = null;
    }
    try {
      speechSynthesis.cancel();
    } catch (e) {}
    if (目前收) {
      const 收 = 目前收;
      目前收 = null;
      收("中斷");
    }
  }

  /* 播放預產 MP3。
     回傳值："結束"＝完整播完　"中斷"＝被新的語音打斷　"錯誤"／"逾時"＝沒播成功
     一定會 settle，不會讓呼叫端卡住。 */
  function 說話(src, { 打斷 = true, 逾時 = 12000 } = {}) {
    return new Promise((resolve) => {
      if (打斷) 停止();
      /* 重產語音後檔名不變，加版本參數才不會播到瀏覽器快取裡的舊音檔 */
      const 網址 = src.includes("?") ? src : `${src}?v=${CONFIG.語音.版本 || 1}`;
      const a = new Audio(網址);
      目前音檔 = a;
      let 已結束 = false;
      const 收 = (v) => {
        if (已結束) return;
        已結束 = true;
        clearTimeout(計時);
        if (目前音檔 === a) 目前音檔 = null;
        if (目前收 === 收) 目前收 = null;
        resolve(v);
      };
      目前收 = 收;
      const 計時 = setTimeout(() => 收("逾時"), 逾時);
      a.onended = () => 收("結束");
      a.onerror = () => 收("錯誤");
      a.play().catch(() => 收("錯誤"));
    });
  }

  const 頁 = (n, o) => 說話(window.頁音(n), o);
  const 提示 = (key, o) => 說話(`${CONFIG.語音.路徑}${key}.mp3`, o);

  /* ---------- 自動朗讀開關 ----------
     關掉之後，「切換頁面時自動播放」的語音不會響，老師可以自己解說；
     但學生／老師主動按「🔊 再唸一次」這類按鈕時，仍然照樣播。
     設定存 localStorage，下次打開沿用。 */
  let 自動朗讀 = (() => {
    try { return localStorage.getItem("重量:自動朗讀") !== "0"; }
    catch (e) { return true; }
  })();
  function 設自動朗讀(on) {
    自動朗讀 = !!on;
    try { localStorage.setItem("重量:自動朗讀", 自動朗讀 ? "1" : "0"); } catch (e) {}
    if (!自動朗讀) 停止();          // 關掉時把正在播的也停掉
    return 自動朗讀;
  }
  const 取自動朗讀 = () => 自動朗讀;

  /* 自動播放版本：開關關閉時直接回傳「略過」，呼叫端不會卡住 */
  const 自動頁 = (n, o) => (自動朗讀 ? 頁(n, o) : Promise.resolve("略過"));
  const 自動提示 = (k, o) => (自動朗讀 ? 提示(k, o) : Promise.resolve("略過"));
  const 自動說話 = (src, o) => (自動朗讀 ? 說話(src, o) : Promise.resolve("略過"));

  /* 學習圖卡：先唸「詞」，停頓一下，再唸說明句。
     中途若使用者點了別張卡（觸發停止），序號會變，後半段就不會再播出來。 */
  const 卡編號 = (id) => String(id).padStart(2, "0");
  /* 只唸詞 / 只唸說明句 — 給學生單獨重複練習用 */
  const 卡詞 = (id) => 說話(`${CONFIG.語音.路徑}card${卡編號(id)}_word.mp3`);
  const 卡句 = (id) => 說話(`${CONFIG.語音.路徑}card${卡編號(id)}_line.mp3`);

  async function 卡片(id, { 停頓 = 700 } = {}) {
    停止();
    const 本次 = 序號;
    const n = String(id).padStart(2, "0");
    const r1 = await 說話(`${CONFIG.語音.路徑}card${n}_word.mp3`, { 打斷: false });
    if (r1 === "中斷" || 序號 !== 本次) return;   // 使用者已經點了別張，不要再接著唸
    await new Promise((r) => setTimeout(r, 停頓));
    if (序號 !== 本次) return;
    await 說話(`${CONFIG.語音.路徑}card${n}_line.mp3`, { 打斷: false });
  }

  /* 挑一個中文語音 */
  function 選語音() {
    const vs = speechSynthesis.getVoices() || [];
    return (
      vs.find((v) => v.lang === "zh-TW") ||
      vs.find((v) => /^zh[-_]/i.test(v.lang)) ||
      null
    );
  }

  /* 瀏覽器即時合成 — 給動態文字用（學生姓名、計時器說明） */
  function 唸(text, { 打斷 = true, 逾時 = 15000 } = {}) {
    return new Promise((resolve) => {
      const t = String(text || "").trim();
      if (!t) return resolve("錯誤");
      if (!("speechSynthesis" in window)) {
        console.warn("此瀏覽器不支援語音合成");
        return resolve("錯誤");
      }
      if (打斷) 停止();
      const u = new SpeechSynthesisUtterance(t);
      u.lang = CONFIG.語音.語系;
      u.rate = CONFIG.語音.語速;
      const v = 選語音();
      if (v) u.voice = v;
      let 已結束 = false;
      const 收 = (r) => {
        if (已結束) return;
        已結束 = true;
        clearTimeout(計時);
        if (目前收 === 收) 目前收 = null;
        resolve(r);
      };
      目前收 = 收;
      const 計時 = setTimeout(() => 收("逾時"), 逾時);
      u.onend = () => 收("結束");
      u.onerror = () => 收("錯誤");
      speechSynthesis.speak(u);
    });
  }

  return {
    說話, 唸, 頁, 提示, 卡片, 卡詞, 卡句, 停止,
    自動頁, 自動提示, 自動說話, 設自動朗讀, 取自動朗讀,
  };
})();
