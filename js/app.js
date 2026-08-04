/* ==========================================================
   重量教學網 — 主程式
   六大分區：點點名／圖詞輪播／教學影片／教材教學／評量／自學
   ========================================================== */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const 存 = () => 工具.存;

  /* ================================================================
     照片儲存（IndexedDB）— 照片只留在這台電腦，不會寫進任何檔案
     ================================================================ */
  const 相簿 = (function () {
    let db = null;
    function 開() {
      return new Promise((res) => {
        if (db) return res(db);
        const r = indexedDB.open("重量照片", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("照片");
        r.onsuccess = () => { db = r.result; res(db); };
        r.onerror = () => res(null);
      });
    }
    async function 存照片(id, dataURL) {
      const d = await 開(); if (!d) return;
      d.transaction("照片", "readwrite").objectStore("照片").put(dataURL, id);
    }
    async function 取照片(id) {
      const d = await 開(); if (!d) return null;
      return new Promise((res) => {
        const q = d.transaction("照片", "readonly").objectStore("照片").get(id);
        q.onsuccess = () => res(q.result || null);
        q.onerror = () => res(null);
      });
    }
    async function 刪照片(id) {
      const d = await 開(); if (!d) return;
      d.transaction("照片", "readwrite").objectStore("照片").delete(id);
    }
    return { 存照片, 取照片, 刪照片 };
  })();

  /* 把上傳的圖片縮小成 320px 見方的 dataURL，避免佔空間 */
  function 縮圖(file, 邊 = 320) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => {
        const im = new Image();
        im.onload = () => {
          const c = document.createElement("canvas");
          c.width = c.height = 邊;
          const g = c.getContext("2d");
          const s = Math.min(im.width, im.height);
          g.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 邊, 邊);
          res(c.toDataURL("image/jpeg", 0.85));
        };
        im.onerror = rej;
        im.src = fr.result;
      };
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }

  /* ================================================================
     分區一：點點名
     ================================================================ */
  const 點名 = (function () {
    let 名單 = 存().讀("名單", []);        // [{id, 名}]
    let 已抽 = 存().讀("已抽", []);        // 這一輪已經點過的 id，重新整理也不會忘記

    const 儲存名單 = () => 存().寫("名單", 名單);
    const 儲存已抽 = () => 存().寫("已抽", 已抽);
    const 未抽名單 = () => 名單.filter((s) => !已抽.includes(s.id));

    async function 畫名單() {
      const wrap = $("#名單區");
      wrap.innerHTML = "";
      if (!名單.length) {
        wrap.innerHTML = `<p class="空白提示">還沒有學生，請在上面新增。</p>`;
      }
      for (const s of 名單) {
        const el = document.createElement("div");
        el.className = "學生卡" + (已抽.includes(s.id) ? " 已點過" : "");
        const 照 = CONFIG.允許上傳照片 ? await 相簿.取照片(s.id) : null;
        el.innerHTML = `
          <div class="頭像">${照 ? `<img src="${照}" alt="">` : `<span>${s.名.slice(0, 1)}</span>`}</div>
          <div class="姓名">${s.名}</div>
          ${已抽.includes(s.id) ? `<div class="已點標">✓ 已點</div>` : ""}
          <button class="刪鈕" title="刪除">✕</button>`;
        el.querySelector(".頭像").onclick = () => 語音.唸(s.名);
        el.querySelector(".姓名").onclick = () => 語音.唸(s.名);
        el.querySelector(".刪鈕").onclick = (e) => {
          e.stopPropagation();
          if (!confirm(`確定要刪除「${s.名}」嗎？`)) return;
          名單 = 名單.filter((x) => x.id !== s.id);
          已抽 = 已抽.filter((x) => x !== s.id);
          相簿.刪照片(s.id);
          儲存名單(); 儲存已抽(); 畫名單();
        };
        wrap.appendChild(el);
      }
      更新狀態();
    }

    function 更新狀態() {
      const 剩 = 未抽名單().length;
      $("#名單計數").textContent = `共 ${名單.length} 人`;
      const 狀 = $("#輪次狀態");
      if (!名單.length) {
        狀.textContent = "";
      } else if (剩 === 0) {
        狀.innerHTML = `<span class="輪完">🎊 全班 ${名單.length} 人都點過了，這一輪結束</span>`;
      } else {
        狀.textContent = `已點 ${已抽.length} 人，還剩 ${剩} 人`;
      }
      $("#鈕抽籤").disabled = !名單.length || 剩 === 0;
      $("#鈕重開一輪").style.display = 已抽.length ? "inline-flex" : "none";
    }

    async function 新增() {
      const 名 = $("#輸入姓名").value.trim();
      if (!名) { $("#輸入姓名").focus(); return; }
      const id = "s" + Date.now() + Math.random().toString(36).slice(2, 6);
      const f = $("#輸入照片").files[0];
      if (CONFIG.允許上傳照片 && f) {
        try { await 相簿.存照片(id, await 縮圖(f)); } catch (e) { console.warn(e); }
      }
      名單.push({ id, 名 });
      儲存名單();
      $("#輸入姓名").value = ""; $("#輸入照片").value = "";
      await 畫名單();
    }

    async function 抽籤() {
      const 池 = 未抽名單();
      if (!名單.length) { alert("請先新增學生。"); return; }
      if (!池.length) return;                     // 全班點完就停，不再重複

      const 中 = 池[Math.floor(Math.random() * 池.length)];
      已抽.push(中.id);
      儲存已抽();

      const box = $("#抽籤結果");
      box.classList.remove("跳出");
      const 照 = CONFIG.允許上傳照片 ? await 相簿.取照片(中.id) : null;
      /* 左右分欄：左邊大照片，右邊大姓名 */
      box.innerHTML = `
        <div class="中籤照片區">
          ${照 ? `<img src="${照}" alt="">` : `<span class="中籤字頭">${中.名.slice(0, 1)}</span>`}
        </div>
        <div class="中籤文字區">
          <div class="中籤姓名">${中.名}</div>
          <div class="中籤序">第 ${已抽.length} 位 / 共 ${名單.length} 人</div>
        </div>`;
      void box.offsetWidth;                       // 重跑動畫
      box.classList.add("跳出");
      await 畫名單();
      語音.唸(中.名);
    }

    function 重開一輪() {
      已抽 = [];
      儲存已抽();
      $("#抽籤結果").innerHTML = `<div class="抽籤待機">按下面的按鈕開始點名</div>`;
      畫名單();
    }

    /* ---------- 備份檔匯出／匯入 ---------- */
    async function 匯出() {
      if (!名單.length) { alert("名單是空的，沒有東西可以匯出。"); return; }
      const 資料 = { 格式: "重量點名名單", 版本: 1, 匯出時間: new Date().toISOString(), 學生: [] };
      for (const s of 名單) {
        資料.學生.push({ 名: s.名, 照片: (await 相簿.取照片(s.id)) || null });
      }
      const blob = new Blob([JSON.stringify(資料)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const d = new Date();
      a.download = `班級名單備份_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    async function 匯入(file) {
      let 資料;
      try {
        資料 = JSON.parse(await file.text());
      } catch (e) { alert("這個檔案讀不出來，請確認是本網站匯出的備份檔。"); return; }
      if (!資料 || !Array.isArray(資料.學生)) { alert("備份檔格式不對。"); return; }
      if (名單.length && !confirm(`目前已有 ${名單.length} 人，匯入的 ${資料.學生.length} 人會取代現有名單。要繼續嗎？`)) return;

      名單.forEach((s) => 相簿.刪照片(s.id));
      名單 = []; 已抽 = [];
      for (const s of 資料.學生) {
        if (!s || !s.名) continue;
        const id = "s" + Date.now() + Math.random().toString(36).slice(2, 6);
        名單.push({ id, 名: s.名 });
        if (s.照片) await 相簿.存照片(id, s.照片);
      }
      儲存名單(); 儲存已抽();
      await 畫名單();
      alert(`已匯入 ${名單.length} 位學生。`);
    }

    function 初始化() {
      if (!CONFIG.允許上傳照片) $("#照片欄").style.display = "none";
      $("#鈕新增學生").onclick = 新增;
      $("#輸入姓名").addEventListener("keydown", (e) => { if (e.key === "Enter") 新增(); });
      $("#鈕抽籤").onclick = 抽籤;
      $("#鈕重開一輪").onclick = 重開一輪;
      $("#鈕匯出名單").onclick = 匯出;
      $("#輸入備份").onchange = (e) => {
        const f = e.target.files[0];
        if (f) 匯入(f);
        e.target.value = "";
      };
      $("#鈕清空名單").onclick = () => {
        if (!名單.length || !confirm("確定要清空整份名單嗎？照片也會一起刪除。")) return;
        名單.forEach((s) => 相簿.刪照片(s.id));
        名單 = []; 已抽 = [];
        儲存名單(); 儲存已抽();
        $("#抽籤結果").innerHTML = `<div class="抽籤待機">按下面的按鈕開始點名</div>`;
        畫名單();
      };
      畫名單();
    }
    return { 初始化 };
  })();

  /* ================================================================
     分區二：圖詞輪播（用單元的 10 張學習圖卡）
     ================================================================ */
  const 輪播 = (function () {
    let 目前 = 0, 輪控 = null, 未抽 = [];

    function 顯示(i, { 唸 = true } = {}) {
      目前 = (i + UNIT.圖卡.length) % UNIT.圖卡.length;
      const c = UNIT.圖卡[目前];
      $("#輪播圖").src = 卡圖(c.id, "front");
      $("#輪播詞").textContent = c.詞;
      $("#輪播稿").textContent = c.稿;
      $("#輪播序").textContent = `${目前 + 1} / ${UNIT.圖卡.length}`;
      if (唸) 語音.卡片(c.id);      // 先唸詞，停頓，再唸說明句
    }

    function 隨機() {
      if (!未抽.length) 未抽 = UNIT.圖卡.map((_, i) => i);
      const k = Math.floor(Math.random() * 未抽.length);
      const i = 未抽.splice(k, 1)[0];
      顯示(i);
    }

    function 切輪播() {
      if (輪控) { clearInterval(輪控); 輪控 = null; }
      /* 一張要唸「詞 → 停頓 → 說明句」，間隔留長一點才不會被打斷 */
      else { 輪控 = setInterval(() => 顯示(目前 + 1), 8000); 顯示(目前 + 1); }
      $("#鈕自動輪播").textContent = 輪控 ? "⏸ 停止輪播" : "▶ 自動輪播";
      $("#鈕自動輪播").classList.toggle("作用中", !!輪控);
    }

    function 初始化() {
      $("#鈕輪上一").onclick = () => 顯示(目前 - 1);
      $("#鈕輪下一").onclick = () => 顯示(目前 + 1);
      $("#鈕輪隨機").onclick = 隨機;
      $("#鈕輪唸").onclick = () => 語音.卡片(UNIT.圖卡[目前].id);
      $("#鈕自動輪播").onclick = 切輪播;
      $("#輪播圖").onclick = () => 語音.卡片(UNIT.圖卡[目前].id);
      /* 單獨唸詞、單獨唸說明句，可以一直重複點 */
      $("#鈕唸詞").onclick = () => 語音.卡詞(UNIT.圖卡[目前].id);
      $("#鈕唸句").onclick = () => 語音.卡句(UNIT.圖卡[目前].id);
      顯示(0, { 唸: false });
    }
    return { 初始化, 停: () => { if (輪控) 切輪播(); } };
  })();

  /* ================================================================
     分區四：教材教學區（4 重點，每個重點後接 3 題形成性評量）
     ================================================================ */
  const 教學 = (function () {
    let 進度 = 存().讀("教學進度", {});      // {1:true,...} 已通過的重點
    let 目前重點 = null, 步驟 = 0, 階段 = "教學"; // 教學 / 評量
    let 題序 = 0, 本輪對錯 = [];
    let 本題順序 = null;   // 這一題的選項順序（固定照簡報上的 A、B）
    let 作答序 = 0;        // 每次作答遞增，用來取消等待中的舊流程（例如中途離開）

    function 畫重點清單() {
      const wrap = $("#重點清單");
      wrap.innerHTML = "";
      /* 四個重點全部開放，老師可以依課堂需要跳著上，不必照順序解鎖 */
      UNIT.重點.forEach((r) => {
        const 已過 = !!進度[r.編號];
        const el = document.createElement("button");
        el.className = "重點卡" + (已過 ? " 已過" : "");
        el.innerHTML = `
          <div class="重點圖示">${r.圖示}</div>
          <div class="重點文字">
            <div class="重點標題">重點 ${r.編號}　${r.標題}</div>
            <div class="重點副標">${r.副標}</div>
            <div class="重點對應">📋 ${r.對應單元內容}</div>
          </div>
          <div class="重點狀態">${已過 ? "✅ 已完成" : "▶ 開始"}</div>`;
        el.onclick = () => 進入(r.編號);
        wrap.appendChild(el);
      });
      const 全過 = UNIT.重點.every((r) => 進度[r.編號]);
      $("#教學總進度").textContent =
        `已完成 ${UNIT.重點.filter((r) => 進度[r.編號]).length} / ${UNIT.重點.length} 個重點`;
      $("#收尾區").classList.toggle("顯示", 全過);
    }

    function 進入(編號) {
      目前重點 = UNIT.重點.find((r) => r.編號 === 編號);
      階段 = "教學"; 步驟 = 0; 題序 = 0; 本輪對錯 = []; 作答序++;
      $("#重點選單").style.display = "none";
      $("#重點內容").classList.add("顯示");
      /* 專注版面會把 body 鎖成不可捲動，若進來前頁面正停在下方，
         畫面會卡在半途且捲不回去，所以先回到最上面 */
      window.scrollTo(0, 0);
      document.body.classList.add("作答中");   // 專注版面：內容填滿畫面，不用捲動
      畫教學頁();
    }

    function 離開() {
      語音.停止();
      作答序++;                    // 作廢還在等語音播完的流程
      const 短 = $("#重點短片");
      if (短) 短.pause();          // 離開時把短片停掉，免得聲音還在背景播
      document.body.classList.remove("作答中");
      $("#重點選單").style.display = "block";
      $("#重點內容").classList.remove("顯示");
      畫重點清單();
    }

    function 畫教學頁() {
      const p = 目前重點.教學頁[步驟];
      $("#重點內容").innerHTML = `
        <div class="階段列">
          <button class="次要鈕" id="鈕回重點">← 回重點清單</button>
          <span class="階段標">${目前重點.圖示} 重點 ${目前重點.編號}　${目前重點.標題}</span>
          <span class="階段badge 教學中">教學 ${步驟 + 1}/${目前重點.教學頁.length}</span>
        </div>
        <img class="大圖 題圖" src="${頁圖(p.頁)}" alt="">
        <p class="口播稿">${p.稿}</p>
        <div class="按鈕列 置中">
          <button class="次要鈕" id="鈕再唸">🔊 再唸一次</button>
          ${短片們(目前重點).length ? `<button class="次要鈕" id="鈕看短片">🎬 看教學短片</button>` : ""}
          ${步驟 > 0 ? `<button class="次要鈕" id="鈕上頁">← 上一頁</button>` : ""}
          <button class="主要鈕" id="鈕下步">${步驟 < 目前重點.教學頁.length - 1 ? "下一頁 →" : "開始練習 ✏️"}</button>
        </div>`;
      $("#鈕回重點").onclick = 離開;
      /* 主動按的按鈕不受自動朗讀開關影響，一定會播 */
      $("#鈕再唸").onclick = () => 語音.頁(p.頁);
      /* 教學頁任何一頁都能直接跳去看短片，不必翻到最後一頁 */
      if ($("#鈕看短片")) $("#鈕看短片").onclick = () => { 階段 = "短片"; 畫短片(); };
      if ($("#鈕上頁")) $("#鈕上頁").onclick = () => { 步驟--; 畫教學頁(); };
      $("#鈕下步").onclick = () => {
        if (步驟 < 目前重點.教學頁.length - 1) { 步驟++; 畫教學頁(); }
        /* 最後一頁直接進評量。短片不在這裡再出現一次——
           上方的「🎬 看教學短片」每一頁都在，老師想放隨時可以放。 */
        else 進評量();
      };
      語音.自動頁(p.頁);   // 切換頁面的自動朗讀，受開關控制
    }

    function 進評量() {
      階段 = "評量"; 題序 = 0; 本輪對錯 = [];
      畫題目();
    }

    /* 教學頁看完 → 主題短片 → 才進形成性評量
       一個重點可以有一支短片（物件）或多支（陣列）。認識港口的重點六有四個
       深化概念頁，各配一支短片，所以要支援多支；只有一支的舊單元寫法不變。 */
    let 短片序 = 0;

    function 畫短片() {
      語音.停止();
      const 全部 = 短片們(目前重點);
      if (短片序 >= 全部.length) 短片序 = 0;
      const v = 全部[短片序];
      const 選單 = 全部.length < 2 ? "" : `
        <div class="按鈕列 置中 短片選單">
          ${全部.map((s, i) =>
            `<button class="次要鈕${i === 短片序 ? " 進行中" : ""}" data-短片="${i}">${i + 1}. ${s.標題}</button>`
          ).join("")}
        </div>`;
      $("#重點內容").innerHTML = `
        <div class="階段列">
          <button class="次要鈕" id="鈕回重點">← 回重點清單</button>
          <span class="階段標">${目前重點.圖示} 重點 ${目前重點.編號}　${目前重點.標題}</span>
          <span class="階段badge 短片中">🎬 主題短片　${v.標題}</span>
        </div>
        <video id="重點短片" class="重點短片" src="${v.檔}${資源v()}" controls playsinline preload="metadata"></video>
        ${選單}
        <div class="按鈕列 置中">
          <button class="次要鈕" id="鈕回教學">← 回教學頁</button>
          <button class="次要鈕" id="鈕重播短片">↺ 再看一次</button>
          <button class="主要鈕" id="鈕進評量">開始練習 ✏️</button>
        </div>`;
      const 影 = $("#重點短片");
      $("#鈕回重點").onclick = 離開;
      /* 從短片回教學，回到這個重點的「第一頁」重新看起，不是回到最後一頁 */
      $("#鈕回教學").onclick = () => { 影.pause(); 階段 = "教學"; 步驟 = 0; 畫教學頁(); };
      $("#鈕重播短片").onclick = () => { 影.currentTime = 0; 影.play(); };
      $("#鈕進評量").onclick = () => { 影.pause(); 進評量(); };
      $$("[data-短片]").forEach((鈕) => {
        鈕.onclick = () => { 影.pause(); 短片序 = +鈕.dataset.短片; 畫短片(); };
      });
      影.play().catch(() => {});   // 自動播放被擋也沒關係，學生可以自己按
    }

    function 畫題目() {
      const q = 目前重點.評量[題序];
      本題順序 = 取選項順序(q);            // 位置固定，與簡報的 A、B 一致
      const 唸題 = () => 語音.說話(題音(q.題頁));          // 主動按：一定播
      const 自動唸題 = () => 語音.自動說話(題音(q.題頁));   // 進題自動：受開關控制
      $("#重點內容").innerHTML = `
        <div class="階段列">
          <button class="次要鈕" id="鈕回重點">← 回重點清單</button>
          <span class="階段標">${目前重點.圖示} 重點 ${目前重點.編號}　${目前重點.標題}</span>
          <span class="階段badge 評量中">形成性評量 ${題序 + 1}/${目前重點.評量.length}</span>
        </div>
        <img class="大圖 題圖" src="${頁圖(q.題頁)}" alt="">
        <p class="題幹">${q.題幹}</p>
        <div class="選項列">
          ${本題順序.顯示選項.map((o, i) => `<button class="選項鈕" data-i="${i}">${o}</button>`).join("")}
        </div>
        <div class="按鈕列 置中"><button class="次要鈕" id="鈕再唸">🔊 再唸一次</button></div>`;
      $("#鈕回重點").onclick = 離開;
      $("#鈕再唸").onclick = 唸題;
      $$("#重點內容 .選項鈕").forEach((b) => (b.onclick = () => 作答(+b.dataset.i, b)));
      自動唸題();
    }

    /* 答對後整個換成解說畫面（不往下疊加，避免超出一個螢幕） */
    function 畫解說(q) {
      const 末題 = 題序 >= 目前重點.評量.length - 1;
      $("#重點內容").innerHTML = `
        <div class="階段列">
          <button class="次要鈕" id="鈕回重點">← 回重點清單</button>
          <span class="階段標">${目前重點.圖示} 重點 ${目前重點.編號}　${目前重點.標題}</span>
          <span class="階段badge 答對了">✅ 答對了</span>
        </div>
        <img class="大圖 題圖" src="${頁圖(q.解頁)}" alt="">
        <p class="解說">${q.解說}</p>
        <div class="按鈕列 置中">
          <button class="次要鈕" id="鈕解說唸">🔊 再唸一次</button>
          <button class="主要鈕" id="鈕續">${末題 ? "完成這個重點 🎉" : "下一題 →"}</button>
        </div>`;
      $("#鈕回重點").onclick = 離開;
      $("#鈕解說唸").onclick = () => 語音.說話(答音(q.解頁));
      $("#鈕續").onclick = () => {
        if (!末題) { 題序++; 畫題目(); }
        else 通關();
      };
    }

    async function 作答(選, 鈕) {
      const q = 目前重點.評量[題序];
      const 對 = 選 === 本題順序.顯示正解;
      if (!對) {
        鈕.classList.add("答錯");
        本輪對錯[題序] = false;
        語音.自動提示("ui_wrong");
        setTimeout(() => 鈕.classList.remove("答錯"), 800);
        return;
      }
      if (本輪對錯[題序] !== false) 本輪對錯[題序] = true;
      $$("#重點內容 .選項鈕").forEach((b) => (b.disabled = true));
      if ($("#鈕再唸")) $("#鈕再唸").disabled = true;   // 等待期間不讓人再點，免得語音打架
      鈕.classList.add("答對");
      const 本次 = ++作答序;
      /* 等「答對了，你好棒！」完整播完再換頁，避免和解說語音疊在一起。
         這段期間學生看到自己按的選項維持綠色，不會覺得沒反應。 */
      const 狀態 = await 語音.自動提示("ui_correct");
      if (本次 !== 作答序) return;                     // 期間已離開這題就不要再動畫面
      畫解說(q);
      /* 若這段鼓勵語音是被別的操作打斷的，就不要再疊上解說語音 */
      if (狀態 !== "中斷") 語音.自動說話(答音(q.解頁));
    }

    async function 通關() {
      進度[目前重點.編號] = true;
      存().寫("教學進度", 進度);
      const 全對 = 本輪對錯.every((x) => x === true);
      const 下一 = UNIT.重點.find((r) => r.編號 === 目前重點.編號 + 1);
      document.body.classList.remove("作答中");   // 通關畫面短，恢復一般版面
      $("#重點內容").innerHTML = `
        <div class="通關卡">
          <div class="通關圖示">🎉</div>
          <h3>重點 ${目前重點.編號}「${目前重點.標題}」完成！</h3>
          <p class="通關說明">${全對 ? "三題都一次答對，很厲害！" : "全部答對了，再複習一次會更熟喔。"}</p>
          <div class="按鈕列">
            <button class="次要鈕" id="鈕回重點">回重點清單</button>
            ${下一 ? `<button class="主要鈕" id="鈕下重點">繼續：重點 ${下一.編號} ${下一.標題} →</button>` : ""}
          </div>
        </div>`;
      $("#鈕回重點").onclick = 離開;
      if ($("#鈕下重點")) $("#鈕下重點").onclick = () => 進入(下一.編號);
      await 語音.自動提示(下一 ? "ui_pass" : "ui_allpass");
    }

    function 畫收尾() {
      const wrap = $("#收尾內容");
      wrap.innerHTML = UNIT.收尾.map((p) => `
        <div class="收尾卡">
          <img src="${頁圖(p.頁)}" alt="">
          <p>${p.稿}</p>
          <button class="次要鈕" data-頁="${p.頁}">🔊 唸給我聽</button>
        </div>`).join("");
      $$("#收尾內容 button").forEach((b) => (b.onclick = () => 語音.頁(+b.dataset.頁)));
    }

    function 初始化() {
      $("#鈕重置進度").onclick = () => {
        if (!confirm("要把教學進度全部重來嗎？")) return;
        進度 = {}; 存().寫("教學進度", 進度); 畫重點清單();
      };
      $("#鈕看開場").onclick = 播開場;

      /* 自動朗讀開關：關掉後「切換頁面」不會自動出聲，老師可以自己解說；
         學生／老師主動按「🔊 再唸一次」這類按鈕時仍然會播 */
      const 同步朗讀鈕 = () => {
        const 開 = 語音.取自動朗讀();
        $("#鈕自動朗讀").textContent = 開 ? "🔊 自動朗讀：開" : "🔇 自動朗讀：關";
        $("#鈕自動朗讀").classList.toggle("作用中", !開);
        $("#朗讀說明").textContent = 開
          ? "切換頁面時會自動唸出內容。要自己解說的話，可以把自動朗讀關掉。"
          : "已關閉自動朗讀，切換頁面不會出聲。按「🔊 再唸一次」仍然可以單獨播放。";
      };
      $("#鈕自動朗讀").onclick = () => { 語音.設自動朗讀(!語音.取自動朗讀()); 同步朗讀鈕(); };
      同步朗讀鈕();

      畫重點清單();
      畫收尾();
    }

    function 播開場() {
      let i = 0;
      const box = $("#開場區");
      /* 開場也套用專注版面，圖片依剩餘高度縮放，按鈕不會被切到畫面外 */
      $("#重點選單").style.display = "none";
      box.classList.add("顯示");
      window.scrollTo(0, 0);
      document.body.classList.add("作答中");

      const 收起 = () => {
        語音.停止();
        box.classList.remove("顯示");
        box.innerHTML = "";
        document.body.classList.remove("作答中");
        $("#重點選單").style.display = "block";
      };

      const 畫 = () => {
        const p = UNIT.開場[i];
        box.innerHTML = `
          <div class="階段列">
            <button class="次要鈕" id="鈕開場離開">← 回重點清單</button>
            <span class="階段標">▶ 開場</span>
            <span class="階段badge 教學中">開場 ${i + 1}/${UNIT.開場.length}</span>
          </div>
          <img class="大圖 題圖" src="${頁圖(p.頁)}" alt="">
          <p class="口播稿">${p.稿}</p>
          <div class="按鈕列 置中">
            <button class="次要鈕" id="鈕開場唸">🔊 再唸一次</button>
            ${i > 0 ? `<button class="次要鈕" id="鈕開場上">← 上一頁</button>` : ""}
            ${i < UNIT.開場.length - 1
              ? `<button class="主要鈕" id="鈕開場下">下一頁 →</button>`
              : `<button class="主要鈕" id="鈕開場關">開始上課：進入重點 1 ✅</button>`}
          </div>`;
        $("#鈕開場離開").onclick = () => { 收起(); 畫重點清單(); };
        $("#鈕開場唸").onclick = () => 語音.頁(p.頁);
        if ($("#鈕開場上")) $("#鈕開場上").onclick = () => { i--; 畫(); };
        if ($("#鈕開場下")) $("#鈕開場下").onclick = () => { i++; 畫(); };
        /* 開場播完直接接進重點 1，不用再自己點一次 */
        if ($("#鈕開場關")) $("#鈕開場關").onclick = () => {
          收起();
          進入(UNIT.重點[0].編號);
        };
        語音.自動頁(p.頁);
      };
      畫();
    }

    return { 初始化, 離開 };
  })();

  /* ================================================================
     分區五：評量區（12 題總複習）
     ================================================================ */
  const 評量 = (function () {
    let 題目 = [], 序 = 0, 結果 = [];

    function 開始() {
      /* 選項順序固定，與簡報上的 A、B 完全一致 */
      題目 = 全部評量.map((q) => ({ ...q, ...取選項順序(q) }));
      序 = 0; 結果 = [];
      $("#評量開始區").style.display = "none";
      $("#評量進行區").classList.add("顯示");
      $("#評量結果區").style.display = "none";
      window.scrollTo(0, 0);                   // 同上，先回到最上面再鎖住捲動
      document.body.classList.add("作答中");   // 專注版面
      畫題();
    }

    function 畫題() {
      const q = 題目[序];
      $("#評量進行區").innerHTML = `
        <div class="階段列">
          <span class="階段標">第 ${序 + 1} / ${題目.length} 題</span>
          <span class="階段badge 評量中">重點 ${q.重點}　${q.重點標題}</span>
        </div>
        <div class="進度條"><div style="width:${(序 / 題目.length) * 100}%"></div></div>
        <img class="大圖 題圖" src="${頁圖(q.題頁)}" alt="">
        <p class="題幹">${q.題幹}</p>
        <div class="選項列">
          ${q.顯示選項.map((o, i) => `<button class="選項鈕" data-i="${i}">${o}</button>`).join("")}
        </div>
        <div class="按鈕列"><button class="次要鈕" id="鈕唸題">🔊 再唸一次</button></div>`;
      /* 選項順序固定，語音與畫面一定一致 */
      const 唸題 = () => 語音.說話(題音(q.題頁));
      $("#鈕唸題").onclick = 唸題;
      $$("#評量進行區 .選項鈕").forEach((b) => (b.onclick = () => 作答(+b.dataset.i, b)));
      唸題();
    }

    async function 作答(選, 鈕) {
      const q = 題目[序];
      const 對 = 選 === q.顯示正解;
      結果[序] = 對;
      $$("#評量進行區 .選項鈕").forEach((b) => (b.disabled = true));
      鈕.classList.add(對 ? "答對" : "答錯");
      if (對) {
        /* 答對才給鼓勵語音，等它播完再進下一題 */
        await Promise.all([
          語音.提示("ui_correct"),
          new Promise((r) => setTimeout(r, 1000)),
        ]);
      } else {
        /* 總評量答錯不重答、也不說「再想一想」，只把正確答案標出來讓學生看一眼，
           然後直接進下一題（這裡是一次做完 12 題的總評量，不是練習） */
        $$("#評量進行區 .選項鈕")[q.顯示正解].classList.add("正解提示");
        await new Promise((r) => setTimeout(r, 1400));
      }
      序++;
      if (序 < 題目.length) 畫題();
      else 收尾();
    }

    function 收尾() {
      const 對數 = 結果.filter(Boolean).length;
      const 依重點 = UNIT.重點.map((r) => {
        const idx = 題目.map((q, i) => (q.重點 === r.編號 ? i : -1)).filter((i) => i >= 0);
        const c = idx.filter((i) => 結果[i]).length;
        return { r, c, n: idx.length };
      });
      document.body.classList.remove("作答中");
      $("#評量進行區").classList.remove("顯示");
      $("#評量結果區").style.display = "block";
      $("#評量結果區").innerHTML = `
        <div class="成績卡">
          <div class="成績大數">${對數} / ${題目.length}</div>
          <p class="成績說明">${對數 === 題目.length ? "🎉 全部答對，太棒了！" : "答錯的重點可以回教學區再看一次喔。"}</p>
          <table class="成績表">
            <tr><th>重點</th><th>答對</th><th>正確率</th></tr>
            ${依重點.map((x) => `
              <tr>
                <td>${x.r.圖示} 重點 ${x.r.編號}　${x.r.標題}</td>
                <td>${x.c} / ${x.n}</td>
                <td><div class="率條"><div style="width:${(x.c / x.n) * 100}%"></div></div></td>
              </tr>`).join("")}
          </table>
          <div class="按鈕列">
            <button class="主要鈕" id="鈕重考">再考一次</button>
            <button class="次要鈕" id="鈕回評量">回評量區</button>
          </div>
        </div>`;
      $("#鈕重考").onclick = 開始;
      $("#鈕回評量").onclick = () => {
        $("#評量結果區").style.display = "none";
        $("#評量開始區").style.display = "block";
      };
    }

    function 初始化() {
      $("#鈕開始評量").onclick = 開始;
      /* 紙本教材 PDF。檔名不會變，所以帶版本參數，換檔後才不會開到快取裡的舊 PDF */
      const 開PDF = (路徑) => window.open(`${路徑}?v=${CONFIG.資源版本 || 1}`, "_blank");
      $("#鈕開學習單").onclick = () => 開PDF(UNIT.資源.學習單);
      $("#鈕開練習單").onclick = () => 開PDF(UNIT.資源.評量練習單);
      $("#鈕開圖卡PDF").onclick = () => 開PDF(UNIT.資源.圖卡PDF);
      $("#鈕開簡報PDF").onclick = () => 開PDF(UNIT.資源.簡報PDF);
    }
    return { 初始化 };
  })();

  /* ================================================================
     分區六：自學區（學生自己點圖卡聽發音）
     ================================================================ */
  const 自學 = (function () {
    let 放大中 = -1;     // 目前放大檢視的圖卡索引，-1 表示沒開
    let 輪播序號 = 0;    // 每次啟動／停止就加一，用來中止還在跑的輪播
    let 輪播中 = false;

    const 只播標題 = () => $("#只播標題").checked;

    /* 依「只播標題」設定決定要唸什麼；回傳 Promise 讓輪播可以等它唸完 */
    function 唸這張(id) {
      return 只播標題() ? 語音.卡詞(id) : 語音.卡片(id);
    }

    function 開放大(i, { 唸 = true } = {}) {
      放大中 = (i + UNIT.圖卡.length) % UNIT.圖卡.length;
      const c = UNIT.圖卡[放大中];
      $("#放大圖").src = 卡圖(c.id, "front");
      $("#放大詞").textContent = c.詞;
      $("#放大稿").textContent = c.稿;
      $("#放大序").textContent = `${放大中 + 1} / ${UNIT.圖卡.length}`;
      $("#放大層").classList.add("開");
      if (唸) return 唸這張(c.id);
      return Promise.resolve();
    }

    function 關放大() {
      停輪播();
      放大中 = -1;
      $("#放大層").classList.remove("開");
      語音.停止();
    }

    /* ---------- 自動輪播：唸完一張才換下一張，不用固定秒數 ---------- */
    function 設輪播鈕(跑) {
      $("#鈕自學輪播").textContent = 跑 ? "⏸ 停止輪播" : "▶ 自動輪播全部圖卡";
      $("#鈕自學輪播").classList.toggle("作用中", 跑);
    }

    function 停輪播() {
      if (!輪播中) return;
      輪播中 = false;
      輪播序號++;
      設輪播鈕(false);
    }

    async function 開始輪播() {
      輪播中 = true;
      const 本次 = ++輪播序號;
      設輪播鈕(true);
      for (let i = 0; i < UNIT.圖卡.length; i++) {
        if (本次 !== 輪播序號) return;
        await 開放大(i);                                   // 等這張唸完
        if (本次 !== 輪播序號) return;
        await new Promise((r) => setTimeout(r, 1200));      // 停一下再換
      }
      if (本次 === 輪播序號) { 停輪播(); }                  // 全部播完自動停，畫面留在最後一張
    }

    function 切輪播() {
      if (輪播中) { 停輪播(); 語音.停止(); }
      else 開始輪播();
    }

    function 初始化() {
      const wrap = $("#圖卡牆");
      wrap.innerHTML = UNIT.圖卡.map((c) => `
        <button class="圖卡" data-id="${c.id}">
          <img src="${卡圖(c.id, "front")}" alt="${c.詞}">
          <div class="圖卡詞">${c.詞}</div>
        </button>`).join("");
      /* 點圖卡 → 放大檢視，圖大、字大。手動點會先把輪播停掉 */
      $$(".圖卡").forEach((b, i) => (b.onclick = () => { 停輪播(); 開放大(i); }));

      $("#鈕自學輪播").onclick = 切輪播;
      $("#只播標題").checked = 存().讀("只播標題", false);
      $("#只播標題").onchange = (e) => 存().寫("只播標題", e.target.checked);

      $("#鈕放大關").onclick = 關放大;
      $("#鈕放大左").onclick = () => { 停輪播(); 開放大(放大中 - 1); };
      $("#鈕放大右").onclick = () => { 停輪播(); 開放大(放大中 + 1); };
      $("#鈕放大唸").onclick = () => 語音.卡片(UNIT.圖卡[放大中].id);
      /* 標題與說明分開，學生可以各自重複點來練習 */
      $("#鈕放大唸詞").onclick = () => 語音.卡詞(UNIT.圖卡[放大中].id);
      $("#鈕放大唸句").onclick = () => 語音.卡句(UNIT.圖卡[放大中].id);
      /* 點背景空白處也可以關 */
      $("#放大層").onclick = (e) => { if (e.target.id === "放大層") 關放大(); };
      document.addEventListener("keydown", (e) => {
        if (放大中 < 0) return;
        if (e.key === "Escape") 關放大();
        if (e.key === "ArrowLeft") { 停輪播(); 開放大(放大中 - 1); }
        if (e.key === "ArrowRight") { 停輪播(); 開放大(放大中 + 1); }
      });
    }
    return { 初始化, 停輪播 };
  })();

  /* ================================================================
     分區七：延伸學習（外部教學影片，點了會開新分頁到 YouTube）
     ----------------------------------------------------------------
     資料來自 data.js 的 UNIT.延伸影片；沒有這個欄位或空陣列時，
     整個分區與導覽鈕都會自動隱藏（舊單元不用改也不會壞）。
     ⚠️ 這一區需要網路。網站其他部分仍然可以離線使用。
     ================================================================ */
  const 延伸 = (function () {
    const 有資料 = () => Array.isArray(window.UNIT.延伸影片) && UNIT.延伸影片.length > 0;

    function 畫() {
      if (!有資料()) {
        $("#區延伸")?.remove();
        $$(".導覽鈕").find((b) => b.dataset.區 === "區延伸")?.remove();
        return;
      }
      /* 依重點分組；重點 0 或沒寫的歸到「綜合」 */
      const 組 = new Map();
      UNIT.延伸影片.forEach((v) => {
        const k = v.重點 || 0;
        if (!組.has(k)) 組.set(k, []);
        組.get(k).push(v);
      });
      const 標題 = (k) => {
        if (!k) return "🌟 綜合複習";
        const r = UNIT.重點.find((x) => x.編號 === k);
        return r ? `${r.圖示} 重點 ${r.編號}　${r.標題}` : `重點 ${k}`;
      };
      /* 依重點編號排序；「綜合複習」（重點 0）放到最後面 */
      const 排序 = [...組.keys()].sort((a, b) => (a || 99) - (b || 99));
      $("#延伸內容").innerHTML = 排序.map((k) => `
        <div class="延伸組">
          <h3 class="延伸組標">${標題(k)}</h3>
          <div class="延伸牆">
            ${組.get(k).map((v) => `
              <a class="延伸卡" href="https://www.youtube.com/watch?v=${v.id}"
                 target="_blank" rel="noopener noreferrer">
                <div class="延伸縮圖">
                  <!-- 不要用 loading="lazy"：卡片在視窗外時圖片不會載入，
                       離線時連 onerror 都不會觸發，佔位圖示也就不會出現 -->
                  <img src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="" referrerpolicy="no-referrer"
                       onerror="this.style.display='none';this.parentElement.classList.add('無縮圖')">
                  <span class="延伸時長">${v.長度 || ""}</span>
                </div>
                <div class="延伸文字">
                  <div class="延伸標題">${v.標題}</div>
                  <div class="延伸來源">${v.頻道}</div>
                  ${v.說明 ? `<div class="延伸說明">${v.說明}</div>` : ""}
                </div>
              </a>`).join("")}
          </div>
        </div>`).join("");
    }

    return { 畫 };
  })();

  /* ================================================================
     分頁切換
     ================================================================ */
  function 初始化分頁() {
    $$(".導覽鈕").forEach((b) => {
      b.onclick = () => {
        語音.停止();
        輪播.停();
        自學.停輪播();
        document.body.classList.remove("作答中");
        $$("video").forEach((v) => v.pause());   // 切分區時停掉所有影片（含重點短片）
        $$(".導覽鈕").forEach((x) => x.classList.toggle("作用中", x === b));
        $$(".分區").forEach((s) => s.classList.toggle("顯示", s.id === b.dataset.區));
        /* 切回正在上課／作答中的分區時，要把專注版面一起還原，
           否則版面會退回一般流排、內容超出畫面 */
        const 教學中 = b.dataset.區 === "區教學" &&
          (($("#重點內容").classList.contains("顯示") && !$("#重點內容 .通關卡")) ||
           $("#開場區").classList.contains("顯示"));
        const 評量中 = b.dataset.區 === "區評量" && $("#評量進行區").classList.contains("顯示");
        if (教學中 || 評量中) window.scrollTo(0, 0);
        document.body.classList.toggle("作答中", 教學中 || 評量中);
        window.scrollTo({ top: 0, behavior: "smooth" });
      };
    });
    $(".導覽鈕").click();
  }

  /* 一個重點的短片可能是物件（一支）或陣列（多支），統一成陣列來用。 */
  const 短片們 = (r) => (!r || !r.短片) ? [] : (Array.isArray(r.短片) ? r.短片 : [r.短片]);

  /* ================================================================
     教學影片區的播放清單（2026-07-31 老師指定）
     除了主要的教學影片，把每個重點的短片也列在旁邊，學生可以自由切換去看。
     清單內容完全由 data.js 決定：資源.影片 ＋ 有寫 短片 的重點，
     所以四個重點、五個重點、某個重點沒有短片、或一個重點掛好幾支，都不必改這段程式。
     ================================================================ */
  function 建影片清單() {
    const 播放器 = $("#影片播放器");
    const 清單 = $("#影片清單");
    const 項目 = [{ 圖示: "\uD83C\uDFAC", 標題: "教學影片（完整版）", 檔: UNIT.資源.影片 }].concat(
      (UNIT.重點 || []).flatMap((r) =>
        短片們(r).map((s) => ({ 圖示: r.圖示, 標題: s.標題, 檔: s.檔 }))));

    播放器.src = 項目[0].檔 + 資源v();
    if (!清單) return;
    清單.innerHTML = '<p class="影片清單標">想看哪一段就點哪一段</p>' + 項目.map((v, i) =>
      `<button class="影片鈕${i === 0 ? " 播放中" : ""}" data-檔="${v.檔}">
         <span class="清單圖示">${v.圖示}</span><span class="清單標題">${v.標題}</span>
       </button>`).join("");

    $$(".影片鈕", 清單).forEach((鈕) => {
      鈕.onclick = () => {
        $$(".影片鈕", 清單).forEach((b) => b.classList.remove("播放中"));
        鈕.classList.add("播放中");
        播放器.src = 鈕.dataset.檔 + 資源v();
        播放器.play();      /* 點擊本身就是使用者手勢，可以直接播 */
      };
    });
  }

  /* ================================================================
     啟動
     ================================================================ */
  document.addEventListener("DOMContentLoaded", () => {
    $("#版本標").textContent = CONFIG.版本;
    $("#版本標").className = "版本標 " + (CONFIG.版本 === "教室版" ? "教室" : "公開");
    $("#單元標題").textContent = UNIT.單元名稱;
    $("#單元資訊").textContent = `${UNIT.領域}　${UNIT.學期}　${UNIT.週次}`;
    建影片清單();

    工具.初始化();
    延伸.畫();        /* ★ 要在 初始化分頁() 之前，沒有延伸影片時才來得及移除導覽鈕 */
    初始化分頁();
    點名.初始化();
    輪播.初始化();
    教學.初始化();
    評量.初始化();
    自學.初始化();
  });
})();
