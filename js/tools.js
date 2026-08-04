/* ==========================================================
   側邊工具列：🖊️ 畫筆　⏱️ 計時器
   兩者全站可用，浮在所有內容之上。
   ========================================================== */
window.工具 = (function () {
  /* ---------------- 儲存小工具 ---------------- */
  const 存 = {
    讀(k, d) {
      try {
        const v = localStorage.getItem("重量:" + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    寫(k, v) {
      try {
        localStorage.setItem("重量:" + k, JSON.stringify(v));
      } catch (e) {}
    },
  };

  /* ================= 畫筆 ================= */
  const 畫筆 = (function () {
    let canvas, ctx, 啟用 = false, 畫中 = false;
    let 顏色 = "#e6194b", 粗細 = 6, 橡皮 = false;

    function 建立() {
      canvas = document.getElementById("畫布");
      ctx = canvas.getContext("2d");
      調整尺寸();
      window.addEventListener("resize", 調整尺寸);

      canvas.addEventListener("pointerdown", (e) => {
        if (!啟用) return;
        畫中 = true;
        canvas.setPointerCapture(e.pointerId);
        ctx.beginPath();
        ctx.moveTo(e.offsetX, e.offsetY);
      });
      canvas.addEventListener("pointermove", (e) => {
        if (!啟用 || !畫中) return;
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = 橡皮 ? 粗細 * 4 : 粗細;
        ctx.globalCompositeOperation = 橡皮 ? "destination-out" : "source-over";
        ctx.strokeStyle = 顏色;
        ctx.stroke();
      });
      const 收筆 = () => { 畫中 = false; };
      canvas.addEventListener("pointerup", 收筆);
      canvas.addEventListener("pointercancel", 收筆);
      canvas.addEventListener("pointerleave", 收筆);
    }

    /* 視窗縮放時保留既有筆跡 */
    function 調整尺寸() {
      const 舊 = canvas.width ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (舊) ctx.putImageData(舊, 0, 0);
    }

    function 切換(on) {
      啟用 = on === undefined ? !啟用 : on;
      canvas.classList.toggle("啟用", 啟用);
      document.getElementById("畫筆面板").classList.toggle("開", 啟用);
      document.getElementById("鈕畫筆").classList.toggle("作用中", 啟用);
      return 啟用;
    }

    const 設色 = (c) => { 顏色 = c; 橡皮 = false; 同步按鈕(); };
    const 設粗 = (w) => { 粗細 = +w; };
    const 切橡皮 = () => { 橡皮 = !橡皮; 同步按鈕(); return 橡皮; };
    const 清除 = () => ctx.clearRect(0, 0, canvas.width, canvas.height);

    function 同步按鈕() {
      document.querySelectorAll("#畫筆面板 .色塊").forEach((b) => {
        b.classList.toggle("選中", !橡皮 && b.dataset.色 === 顏色);
      });
      document.getElementById("鈕橡皮").classList.toggle("選中", 橡皮);
    }

    return { 建立, 切換, 設色, 設粗, 切橡皮, 清除, get 啟用() { return 啟用; } };
  })();

  /* ================= 計時器（三個，各自獨立運作） ================= */
  const 計時器群 = (function () {
    const 數量 = 3;
    const 預設說明 = [
      "時間到，請把東西收好，我們繼續上課。",
      "時間到了。",
      "時間到了。",
    ];
    const 實例 = [];

    function 建立單一(n) {
      const key = (名) => `計時${n}${名}`;
      const el = (名) => document.getElementById(`計時${名}${n}`);
      let 剩餘 = 0, 控制 = null, 執行中 = false;

      function 更新顯示(t) {
        const m = String(Math.floor(t / 60)).padStart(2, "0");
        const s = String(t % 60).padStart(2, "0");
        el("顯示").textContent = `${m}:${s}`;
        el("顯示").classList.toggle("快到了", 執行中 && t <= 10);
        el("顯示").classList.toggle("跑動中", 執行中);
      }

      function 讀設定() {
        const 分 = Math.max(0, +el("分").value || 0);
        const 秒 = Math.min(59, Math.max(0, +el("秒").value || 0));
        存.寫(key("分"), 分);
        存.寫(key("秒"), 秒);
        存.寫(key("說明"), el("說明").value.trim());
        return 分 * 60 + 秒;
      }

      function 設按鈕(跑) {
        el("鈕開始").textContent = 跑 ? "⏸ 暫停" : "▶ 開始";
      }

      function 開始() {
        if (執行中) return;
        if (剩餘 <= 0) 剩餘 = 讀設定();
        if (剩餘 <= 0) return;
        執行中 = true;
        設按鈕(true);
        控制 = setInterval(() => {
          剩餘--;
          更新顯示(剩餘);
          if (剩餘 <= 0) 結束();
        }, 1000);
        更新顯示(剩餘);
      }

      function 暫停() {
        執行中 = false;
        clearInterval(控制);
        設按鈕(false);
        更新顯示(剩餘);
      }

      function 重設() {
        暫停();
        剩餘 = 讀設定();
        更新顯示(剩餘);
      }

      async function 結束() {
        clearInterval(控制);
        執行中 = false;
        設按鈕(false);
        剩餘 = 0;
        更新顯示(0);
        const 盒 = el("盒");
        盒.classList.add("時間到");
        setTimeout(() => 盒.classList.remove("時間到"), 8000);
        /* 先響一聲「時間到」，再唸這個計時器自己設定的說明文字 */
        await 語音.提示("ui_timeup");
        const t = el("說明").value.trim();
        if (t) await 語音.唸(t, { 打斷: false });
      }

      /* 掛上事件並套用存檔設定 */
      el("分").value = 存.讀(key("分"), n === 1 ? 5 : n === 2 ? 10 : 1);
      el("秒").value = 存.讀(key("秒"), 0);
      el("說明").value = 存.讀(key("說明"), 預設說明[n - 1]);
      el("鈕開始").onclick = () => (執行中 ? 暫停() : 開始());
      el("鈕重設").onclick = 重設;
      el("鈕試聽").onclick = () => 語音.唸(el("說明").value.trim());
      更新顯示(剩餘 = 讀設定());

      return { 重設 };
    }

    function 建立() {
      const wrap = document.getElementById("計時器清單");
      wrap.innerHTML = "";
      for (let n = 1; n <= 數量; n++) {
        wrap.insertAdjacentHTML("beforeend", `
          <div class="計時盒" id="計時盒${n}">
            <div class="計時標">計時器 ${n}</div>
            <div id="計時顯示${n}" class="計時顯示">00:00</div>
            <div class="面板列">
              <label>分 <input type="number" id="計時分${n}" min="0" max="120"></label>
              <label>秒 <input type="number" id="計時秒${n}" min="0" max="59"></label>
            </div>
            <label class="面板列 直">時間到要說的話
              <textarea id="計時說明${n}" rows="2" placeholder="例：時間到，請把圖卡收好。"></textarea>
            </label>
            <div class="面板列">
              <button class="主要鈕" id="計時鈕開始${n}">▶ 開始</button>
              <button class="次要鈕" id="計時鈕重設${n}">↺ 重設</button>
              <button class="次要鈕" id="計時鈕試聽${n}">🔊 試聽</button>
            </div>
          </div>`);
      }
      for (let n = 1; n <= 數量; n++) 實例.push(建立單一(n));
    }

    return { 建立 };
  })();

  /* ================= 面板開關 ================= */
  function 切面板(id, 鈕id) {
    const el = document.getElementById(id);
    const 開 = el.classList.toggle("開");
    if (鈕id) document.getElementById(鈕id).classList.toggle("作用中", 開);
    return 開;
  }

  function 初始化() {
    畫筆.建立();
    計時器群.建立();

    document.getElementById("鈕畫筆").onclick = () => 畫筆.切換();
    document.getElementById("鈕計時").onclick = () => 切面板("計時器面板", "鈕計時");

    document.querySelectorAll("#畫筆面板 .色塊").forEach((b) => {
      b.style.background = b.dataset.色;
      b.onclick = () => 畫筆.設色(b.dataset.色);
    });
    document.getElementById("筆粗").oninput = (e) => 畫筆.設粗(e.target.value);
    document.getElementById("鈕橡皮").onclick = () => 畫筆.切橡皮();
    document.getElementById("鈕清畫").onclick = () => 畫筆.清除();
    document.getElementById("鈕關畫筆").onclick = () => 畫筆.切換(false);

    document.getElementById("鈕關計時").onclick = () => 切面板("計時器面板", "鈕計時");

    畫筆.設色("#e6194b");
  }

  return { 初始化, 畫筆, 計時器群, 存 };
})();
