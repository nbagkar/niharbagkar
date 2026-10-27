(function () {
    const { store, today, dayKey } = window.SoccerDaily;
    const { LEAGUES, scoreboard } = window.SoccerESPN;

    const BACK = 3; // days of finished games still shown
    const AHEAD = 8; // days of fixtures open for picks
    const KEY = "nbs-predictor";

    // picks: { [espn event id]: { h, a, league, kickoff, home, away } }
    // results: { [espn event id]: [home goals, away goals] } once a game ends
    const state = Object.assign({ picks: {}, results: {} }, store.get(KEY));
    const save = () => store.set(KEY, state);

    const $ = (sel) => document.querySelector(sel);
    const dayTabs = $("[data-days]");
    const leagueTabs = $("[data-leagues]");
    const fixtures = $("[data-fixtures]");

    const matches = new Map();
    let currentDay = null;
    let currentLeague = "all";

    /* Scoring */

    const sign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);

    function points(pick, result) {
        if (!pick || !result) return null;
        if (pick.h === result[0] && pick.a === result[1]) return 3;
        return sign(pick.h - pick.a) === sign(result[0] - result[1]) ? 1 : 0;
    }

    function drawTally() {
        let total = 0, exact = 0, right = 0, scored = 0;
        Object.entries(state.picks).forEach(([id, pick]) => {
            const p = points(pick, state.results[id]);
            if (p === null) return;
            scored += 1;
            total += p;
            if (p === 3) exact += 1;
            if (p === 1) right += 1;
        });
        $('[data-stat="points"]').textContent = total;
        $('[data-stat="exact"]').textContent = exact;
        $('[data-stat="result"]').textContent = exact + right;
        $('[data-stat="scored"]').textContent = scored;
    }

    /* Fixtures: whole months from the feed, trimmed to the window. Months of
       older unresolved picks are fetched too, so they still get scored. */

    async function load() {
        const now = new Date();
        const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - BACK);
        const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + AHEAD);
        const month = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;

        const wanted = new Map(); // "league|YYYYMM"
        LEAGUES.forEach((league) => {
            wanted.set(`${league.id}|${month(from)}`, league);
            wanted.set(`${league.id}|${month(to)}`, league);
        });
        Object.entries(state.picks).forEach(([id, pick]) => {
            if (state.results[id]) return;
            const league = LEAGUES.find((l) => l.id === pick.league);
            if (league) wanted.set(`${league.id}|${month(new Date(pick.kickoff))}`, league);
        });

        const lists = await Promise.all([...wanted].map(([key, league]) => scoreboard(league, key.split("|")[1])));
        lists.flat().forEach((m) => {
            matches.set(m.id, m);
            if (m.completed && m.home.score != null && m.away.score != null) {
                state.results[m.id] = [Number(m.home.score), Number(m.away.score)];
            }
            // Postponed games move; keep the pick's kickoff in step.
            if (state.picks[m.id]) state.picks[m.id].kickoff = m.kickoff.toISOString();
        });
        save();

        const inWindow = [...matches.values()].filter((m) => m.kickoff >= from && m.kickoff < to);
        const days = [...new Set(inWindow.map((m) => dayKey(m.kickoff)))].sort();
        // Open on the first day with a game still open for picks.
        currentDay = days.find((d) => inWindow.some((m) => dayKey(m.kickoff) === d && isOpen(m))) || days.find((d) => d >= today) || "mine";
        drawDays(days);
        draw();
        drawTally();
    }

    function dayLabel(key) {
        const [y, m, d] = key.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        const diff = Math.round((date - midnight) / 86400000);
        if (diff === 0) return "Today";
        if (diff === 1) return "Tomorrow";
        if (diff === -1) return "Yesterday";
        return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
    }

    function tab(container, label, selected, onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.role = "tab";
        button.textContent = label;
        button.setAttribute("aria-selected", String(selected));
        button.addEventListener("click", () => {
            container.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b === button)));
            onClick();
        });
        container.appendChild(button);
    }

    function drawDays(days) {
        dayTabs.innerHTML = "";
        days.forEach((d) => tab(dayTabs, dayLabel(d), d === currentDay, () => {
            currentDay = d;
            currentLeague = "all";
            draw();
        }));
        const count = Object.keys(state.picks).length;
        tab(dayTabs, count ? `My picks (${count})` : "My picks", currentDay === "mine", () => {
            currentDay = "mine";
            draw();
        });
        // On narrow screens the row scrolls; bring the open day into view.
        const selected = dayTabs.querySelector('[aria-selected="true"]');
        if (selected) dayTabs.scrollLeft = selected.offsetLeft - dayTabs.offsetLeft - 8;
    }

    function draw() {
        fixtures.innerHTML = "";
        leagueTabs.innerHTML = "";
        if (currentDay === "mine") return drawMine();

        const games = [...matches.values()].filter((m) => dayKey(m.kickoff) === currentDay);
        const leagues = LEAGUES.filter((l) => games.some((m) => m.league === l));
        if (leagues.length > 1) {
            tab(leagueTabs, "All", currentLeague === "all", () => { currentLeague = "all"; draw(); });
            leagues.forEach((l) => tab(leagueTabs, l.short, currentLeague === l.id, () => { currentLeague = l.id; draw(); }));
        }
        if (!games.length) {
            fixtures.innerHTML = `<p class="muted">No fixtures from the tracked leagues this day.</p>`;
            return;
        }
        leagues.filter((l) => currentLeague === "all" || l.id === currentLeague).forEach((league) => {
            const heading = document.createElement("p");
            heading.className = "league-name";
            heading.textContent = league.name;
            fixtures.appendChild(heading);
            games.filter((m) => m.league === league)
                .sort((a, b) => a.kickoff - b.kickoff)
                .forEach((m) => fixtures.appendChild(fixtureRow(m)));
        });
    }

    const isOpen = (m) => m.state === "pre" && Date.now() < m.kickoff.getTime();

    function teamCell(t, where) {
        const el = document.createElement("div");
        el.className = `team ${where}`;
        const name = document.createElement("span");
        name.textContent = t.name;
        if (t.logo) {
            const img = document.createElement("img");
            img.src = t.logo;
            img.alt = "";
            img.loading = "lazy";
            if (where === "home") el.append(name, img);
            else el.append(img, name);
        } else {
            el.append(name);
        }
        return el;
    }

    function fixtureRow(m) {
        const pick = state.picks[m.id];
        const row = document.createElement("div");
        row.className = "fixture";
        row.dataset.id = m.id;

        const mid = document.createElement("div");
        mid.className = "pick";
        const box = (side) => {
            const input = document.createElement("input");
            input.type = "number";
            input.inputMode = "numeric";
            input.min = "0";
            input.max = "20";
            input.value = pick ? pick[side] : "";
            input.placeholder = isOpen(m) ? "" : "–";
            input.setAttribute("aria-label", `${side === "h" ? m.home.name : m.away.name} goals`);
            input.disabled = !isOpen(m);
            input.addEventListener("input", () => update(m, row));
            return input;
        };
        const dash = document.createElement("span");
        dash.textContent = "–";
        mid.append(box("h"), dash, box("a"));

        const status = document.createElement("p");
        status.className = "status";
        row.append(teamCell(m.home, "home"), mid, teamCell(m.away, "away"), status);
        drawStatus(m, row);
        return row;
    }

    function update(m, row) {
        const [h, a] = [...row.querySelectorAll("input")].map((i) => i.value.trim());
        if (!isOpen(m)) {
            lockRows();
            return;
        }
        const valid = (v) => /^\d{1,2}$/.test(v) && Number(v) <= 20;
        if (h === "" && a === "") delete state.picks[m.id];
        else if (valid(h) && valid(a)) {
            state.picks[m.id] = {
                h: Number(h), a: Number(a), league: m.league.id, kickoff: m.kickoff.toISOString(),
                home: m.home.name, away: m.away.name
            };
        } else {
            drawStatus(m, row, "Enter both scores");
            return;
        }
        save();
        drawStatus(m, row);
        const mine = dayTabs.lastElementChild;
        const count = Object.keys(state.picks).length;
        mine.textContent = count ? `My picks (${count})` : "My picks";
    }

    function drawStatus(m, row, note) {
        const status = row.querySelector(".status");
        const pick = state.picks[m.id];
        const result = state.results[m.id];
        const p = points(pick, result);
        status.className = "status";
        status.innerHTML = "";
        const time = m.kickoff.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

        if (note) {
            status.textContent = note;
            status.classList.add("is-warn");
        } else if (isOpen(m)) {
            status.textContent = pick ? `Saved · locks at ${time}` : `Kickoff ${time}`;
            if (pick) status.classList.add("is-saved");
        } else {
            const score = m.state === "pre" ? "Kicking off" : `${m.home.score ?? 0}–${m.away.score ?? 0} ${m.state === "in" ? m.detail : m.completed ? "FT" : m.detail}`;
            const parts = [score];
            if (!pick) parts.push("No pick");
            status.textContent = parts.join(" · ");
            if (p !== null) {
                const badge = document.createElement("b");
                badge.className = `pts pts-${p}`;
                badge.textContent = `+${p}`;
                status.append(" ", badge);
            }
        }
    }

    // Lock any row whose kickoff has passed while the page sat open.
    function lockRows() {
        fixtures.querySelectorAll(".fixture").forEach((row) => {
            const m = matches.get(row.dataset.id);
            if (!m || isOpen(m)) return;
            row.querySelectorAll("input").forEach((input) => {
                if (input.disabled) return;
                input.disabled = true;
                const pick = state.picks[m.id];
                input.value = pick ? pick[input === row.querySelector("input") ? "h" : "a"] : "";
            });
            drawStatus(m, row);
        });
    }

    function drawMine() {
        const ids = Object.keys(state.picks).sort((a, b) => new Date(state.picks[b].kickoff) - new Date(state.picks[a].kickoff));
        if (!ids.length) {
            fixtures.innerHTML = `<p class="muted">No picks yet. Choose a day above and call some scores.</p>`;
            return;
        }
        const list = document.createElement("ol");
        list.className = "mine";
        ids.forEach((id) => {
            const pick = state.picks[id];
            const result = state.results[id];
            const p = points(pick, result);
            const li = document.createElement("li");
            const when = new Date(pick.kickoff).toLocaleDateString(undefined, { month: "short", day: "numeric" });
            const league = (LEAGUES.find((l) => l.id === pick.league) || {}).short || "";
            li.innerHTML = `<span class="mine-when"></span><span class="mine-teams"></span><span class="mine-pick"></span><span class="mine-result"></span>`;
            li.querySelector(".mine-when").textContent = `${when} · ${league}`;
            li.querySelector(".mine-teams").textContent = `${pick.home} v ${pick.away}`;
            li.querySelector(".mine-pick").textContent = `You: ${pick.h}–${pick.a}`;
            const res = li.querySelector(".mine-result");
            if (result) {
                res.textContent = `FT ${result[0]}–${result[1]} `;
                const badge = document.createElement("b");
                badge.className = `pts pts-${p}`;
                badge.textContent = `+${p}`;
                res.appendChild(badge);
            } else {
                res.textContent = new Date(pick.kickoff) > new Date() ? "Open" : "Waiting for result";
                res.classList.add("muted");
            }
            list.appendChild(li);
        });
        fixtures.appendChild(list);
    }

    setInterval(lockRows, 20000);
    load();
})();
