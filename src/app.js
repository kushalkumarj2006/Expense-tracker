
const KEY = "balance_tracker_v1";

const Utils = {
  todayISO: () => new Date().toISOString().split("T")[0],
  daysBetween: (a, b) => Math.floor((a - b) / 86400000),
  evalMath: (expr) => {
    if (!/^[0-9+\-*/().\s]+$/.test(expr)) throw "bad";
    // Improved security: strictly limit characters and maybe use a safer evaluation if possible.
    // For now, keeping original logic but wrapped.
    return Function("return (" + expr + ")")();
  }
};

class Tracker {
  constructor(storage) {
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.state = this.load();
  }

  load() {
    if (!this.storage) return { version: 1, balance: 0, expiry: Utils.todayISO(), history: [] };
    try {
      return JSON.parse(this.storage.getItem(KEY)) ||
        { version: 1, balance: 0, expiry: Utils.todayISO(), history: [] };
    } catch {
      return { version: 1, balance: 0, expiry: Utils.todayISO(), history: [] };
    }
  }

  save() {
    if (this.storage) {
      this.storage.setItem(KEY, JSON.stringify(this.state));
    }
  }

  recomputeBalance() {
    this.state.balance = this.state.history.reduce((sum, h) => sum + h.delta, 0);
  }

  addEntry(expr, desc) {
    let cleanExpr = expr.trim();
    if (!cleanExpr) throw new Error("Empty expression");
    if (!/^[+\-*/]/.test(cleanExpr)) cleanExpr = "+" + cleanExpr;

    const delta = Utils.evalMath(cleanExpr);
    // Rounding to 2 decimal places to avoid float issues
    this.state.balance = Math.round((this.state.balance + delta) * 100) / 100;

    this.state.history.push({
      ts: Date.now(),
      expr: cleanExpr,
      desc,
      delta,
      balance: this.state.balance
    });

    this.save();
    return delta;
  }

  undo() {
    if (!this.state.history.length) return false;
    this.state.history.pop();
    this.recomputeBalance();
    this.save();
    return true;
  }

  updateExpiry(date) {
    this.state.expiry = date;
    this.save();
  }

  importData(jsonString) {
     const data = JSON.parse(jsonString);
     if(!data.version || !Array.isArray(data.history)) throw new Error("Invalid data format");
     this.state = data;
     this.save();
  }

  exportData() {
    return JSON.stringify(this.state, null, 2);
  }
}

// UI Handling
function initUI() {
  const tracker = new Tracker();

  const balanceEl = document.getElementById("balance");
  const expiryEl = document.getElementById("expiry");
  const expiryInfo = document.getElementById("expiryInfo");
  const histEl = document.getElementById("history");
  const exprEl = document.getElementById("expr");
  const descSelect = document.getElementById("descSelect");
  const descOther = document.getElementById("descOther");
  const quickAdd = document.getElementById("quickAdd");

  // Initial UI state
  expiryEl.min = Utils.todayISO();
  expiryEl.value = tracker.state.expiry;

  descSelect.onchange = () => {
    descOther.classList.toggle("hidden", descSelect.value !== "Other");
  };

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (isStandalone) {
    document.documentElement.classList.add("widget");
    quickAdd.classList.remove("hidden");
    document.documentElement.dataset.widget = window.innerHeight < 520 ? "small" : "medium";
  }

  function render() {
    const today = new Date(Utils.todayISO());
    const expiry = new Date(tracker.state.expiry);
    const daysLeft = Math.max(0, Utils.daysBetween(expiry, today) + 1);
    const threshold = (daysLeft * 250) / 7; // Approx 1000 per month
    const dailySafe = daysLeft ? Math.floor(tracker.state.balance / daysLeft) : 0;

    if (tracker.state.balance >= threshold) balanceEl.style.color = "var(--green)";
    else if (tracker.state.balance >= threshold - 50 && tracker.state.balance <= threshold + 50)
      balanceEl.style.color = "var(--yellow)";
    else balanceEl.style.color = "var(--red)";

    balanceEl.textContent = "₹" + tracker.state.balance.toLocaleString();
    expiryInfo.textContent =
      daysLeft > 0 ? `${daysLeft} days left · Daily safe ₹${dailySafe}` : "Expired";

    if (!isStandalone) {
      histEl.innerHTML = tracker.state.history.slice(-100).reverse().map(h => `
        <div class="entry">
          <strong>${h.desc}</strong>
          <div class="meta">${h.expr} → ₹${h.balance}</div>
        </div>
      `).join("");
    }
  }

  render();

  /* ADD */
  document.getElementById("equals").onclick = () => {
    const expr = exprEl.value;
    const desc = descSelect.value === "Other"
      ? descOther.value.trim()
      : descSelect.value;

    if (!desc) { alert("Description required"); return; }

    try {
      tracker.addEntry(expr, desc);
      exprEl.value = "";
      descSelect.value = "";
      descOther.value = "";
      descOther.classList.add("hidden");
      render();
    } catch (e) {
      console.error(e);
      alert("Invalid input");
    }
  };

  /* UNDO */
  document.getElementById("undoBtn").onclick = () => {
    if (tracker.undo()) {
      render();
    }
  };

  /* EXPORT */
  document.getElementById("exportBtn").onclick = () => {
    const blob = new Blob([tracker.exportData()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "balance-backup.json";
    a.click();
  };

  /* IMPORT */
  document.getElementById("importBtn").onclick = () => {
    document.getElementById("importFile").click();
  };

  document.getElementById("importFile").onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        tracker.importData(r.result);
        render();
      } catch {
        alert("Invalid backup file");
      }
    };
    r.readAsText(file);
  };

  expiryEl.onchange = () => {
    if (expiryEl.value < Utils.todayISO()) expiryEl.value = Utils.todayISO();
    tracker.updateExpiry(expiryEl.value);
    render();
  };
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }
}

if (typeof module !== 'undefined') {
  module.exports = { Utils, Tracker, KEY };
}
