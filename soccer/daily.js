// Shared bits for the daily games: storage that survives private mode, the
// visitor's local date, a daily pick everyone shares, and day streaks.
window.SoccerDaily = (function () {
    const store = {
        get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
        set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } }
    };

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = dayKey(now);
    const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    const dayNumber = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);

    function gcd(a, b) { return b ? gcd(b, a % b) : a; }

    // Same index for everyone on the same local date. The step is coprime
    // with the size, so every item comes round before any repeats; salt
    // keeps two games from walking their lists in lockstep.
    function pick(size, salt = 0) {
        let step = 7;
        while (gcd(step, size) !== 1) step += 1;
        return ((dayNumber + salt) * step) % size;
    }

    // A run of consecutive days won. { last, count } in localStorage.
    function streak(key) {
        const state = store.get(key) || { last: null, count: 0 };
        return {
            get count() { return state.last === today || state.last === yesterday ? state.count : 0; },
            win() {
                if (state.last === yesterday) state.count += 1;
                else if (state.last !== today) state.count = 1;
                state.last = today;
                store.set(key, state);
            },
            lose() {
                state.count = 0;
                state.last = null;
                store.set(key, state);
            }
        };
    }

    return { store, today, dayKey, dayNumber, pick, streak };
})();
