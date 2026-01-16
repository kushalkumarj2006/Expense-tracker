
const { Utils, Tracker, KEY } = require('../src/app');

// Mock localStorage
class LocalStorageMock {
  constructor() {
    this.store = {};
  }
  clear() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
}

global.localStorage = new LocalStorageMock();

describe('Utils', () => {
  test('evalMath handles basic arithmetic', () => {
    expect(Utils.evalMath("10+20")).toBe(30);
    expect(Utils.evalMath("10-5")).toBe(5);
    expect(Utils.evalMath("10*2")).toBe(20);
    expect(Utils.evalMath("10/2")).toBe(5);
  });

  test('evalMath handles multiple operations', () => {
    expect(Utils.evalMath("10+20-5")).toBe(25);
  });

  test('evalMath throws on invalid input', () => {
    expect(() => Utils.evalMath("alert(1)")).toThrow("bad");
    expect(() => Utils.evalMath("10+20;")).toThrow("bad");
  });

  test('daysBetween calculates correct diff', () => {
    const d1 = new Date("2023-01-02");
    const d2 = new Date("2023-01-01");
    expect(Utils.daysBetween(d1, d2)).toBe(1);
    expect(Utils.daysBetween(d2, d1)).toBe(-1);
  });
});

describe('Tracker', () => {
  let tracker;
  let storage;

  beforeEach(() => {
    storage = new LocalStorageMock();
    tracker = new Tracker(storage);
  });

  test('initializes with default state', () => {
    expect(tracker.state.balance).toBe(0);
    expect(tracker.state.history).toEqual([]);
    expect(tracker.state.version).toBe(1);
  });

  test('addEntry updates balance and history', () => {
    tracker.addEntry("100", "Initial deposit");
    expect(tracker.state.balance).toBe(100);
    expect(tracker.state.history.length).toBe(1);
    expect(tracker.state.history[0].desc).toBe("Initial deposit");
    expect(tracker.state.history[0].delta).toBe(100);
  });

  test('addEntry handles implicit plus', () => {
    tracker.addEntry("100", "test");
    expect(tracker.state.history[0].expr).toBe("+100");
  });

  test('addEntry handles expressions', () => {
    tracker.addEntry("100+50", "Salary + Bonus");
    expect(tracker.state.balance).toBe(150);
    expect(tracker.state.history[0].delta).toBe(150);
  });

  test('undo removes last entry and updates balance', () => {
    tracker.addEntry("100", "1");
    tracker.addEntry("50", "2");
    expect(tracker.state.balance).toBe(150);

    const res = tracker.undo();
    expect(res).toBe(true);
    expect(tracker.state.balance).toBe(100);
    expect(tracker.state.history.length).toBe(1);
    expect(tracker.state.history[0].desc).toBe("1");
  });

  test('undo does nothing if history is empty', () => {
    const res = tracker.undo();
    expect(res).toBe(false);
    expect(tracker.state.balance).toBe(0);
  });

  test('recomputeBalance fixes balance from history', () => {
    tracker.addEntry("100", "1");
    tracker.addEntry("50", "2");

    // Manually corrupt balance
    tracker.state.balance = 0;

    tracker.recomputeBalance();
    expect(tracker.state.balance).toBe(150);
  });

  test('saves to storage on update', () => {
    tracker.addEntry("100", "test");
    const stored = JSON.parse(storage.getItem(KEY));
    expect(stored.balance).toBe(100);
    expect(stored.history.length).toBe(1);
  });

  test('loads from storage', () => {
    tracker.addEntry("200", "test");

    const newTracker = new Tracker(storage);
    expect(newTracker.state.balance).toBe(200);
    expect(newTracker.state.history.length).toBe(1);
  });

  test('importData loads new state', () => {
    const data = {
        version: 1,
        balance: 500,
        expiry: "2023-12-31",
        history: [{ts: 123, expr: "+500", desc: "imp", delta: 500, balance: 500}]
    };
    tracker.importData(JSON.stringify(data));
    expect(tracker.state.balance).toBe(500);
    expect(tracker.state.history[0].desc).toBe("imp");
  });

  test('updateExpiry updates date', () => {
      tracker.updateExpiry("2024-01-01");
      expect(tracker.state.expiry).toBe("2024-01-01");
  });
});
