(function () {
    const store = {
        get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
        set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } }
    };

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = dayKey(now);
    const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

    const todayLabel = document.querySelector("[data-today]");
    if (todayLabel) todayLabel.textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

    /* Trivia of the day. Everyone gets the same question on the same local
       date; the step is coprime with the bank size so every question comes
       round before any repeats. */

    function setupTrivia() {
        const bank = window.SOCCER_TRIVIA || [];
        const box = document.querySelector("#trivia");
        if (!box || !bank.length) return;

        const dayNumber = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
        let step = 7;
        while (gcd(step, bank.length) !== 1) step += 1;
        const item = bank[(dayNumber * step) % bank.length];

        const question = box.querySelector("[data-q]");
        const options = box.querySelector("[data-options]");
        const fact = box.querySelector("[data-fact]");
        const next = box.querySelector("[data-next]");
        const streakLabel = box.querySelector("[data-streak]");

        // { day, pick } for today's answer; { last, count } for the streak.
        const saved = store.get("nbs-trivia");
        const streak = store.get("nbs-streak") || { last: null, count: 0 };

        question.textContent = item.q;
        const buttons = item.options.map((text, i) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = text;
            button.addEventListener("click", () => answer(i, true));
            return button;
        });
        // Shuffle the answers by date so the right one isn't always in the
        // same spot, while everyone still sees the same order today.
        let seed = dayNumber;
        const order = buttons.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            const j = seed % (i + 1);
            [order[i], order[j]] = [order[j], order[i]];
        }
        order.forEach((i) => options.appendChild(buttons[i]));

        function showStreak() {
            const alive = streak.last === today || streak.last === yesterday;
            if (alive && streak.count > 0) {
                streakLabel.textContent = `${streak.count}-day streak`;
                streakLabel.hidden = false;
            }
        }

        function answer(pick, fresh) {
            const right = pick === item.answer;
            buttons.forEach((button, i) => {
                button.disabled = true;
                if (i === item.answer) button.classList.add("is-right");
                else if (i === pick) button.classList.add("is-wrong");
            });
            fact.innerHTML = "";
            const lead = document.createElement("b");
            lead.textContent = right ? "Correct. " : `Not quite: it's ${item.options[item.answer]}. `;
            fact.append(lead, item.fact);
            fact.classList.toggle("is-miss", !right);
            fact.hidden = false;
            next.hidden = false;

            if (fresh) {
                store.set("nbs-trivia", { day: today, q: item.q, pick });
                if (right) {
                    if (streak.last === yesterday) streak.count += 1;
                    else if (streak.last !== today) streak.count = 1;
                    streak.last = today;
                } else {
                    streak.count = 0;
                    streak.last = null;
                }
                store.set("nbs-streak", streak);
            }
            showStreak();
        }

        // Matching on the question too means growing the bank mid-day can't
        // pin yesterday's pick onto a different question.
        if (saved && saved.day === today && saved.q === item.q && typeof saved.pick === "number") answer(saved.pick, false);
        else showStreak();
    }

    function gcd(a, b) { return b ? gcd(b, a % b) : a; }

    /* Today's matches from ESPN's public scoreboard feed (no key, allows
       cross-origin requests). Live games sort first, then by kickoff. */

    const LEAGUES = [
        { id: "uefa.champions", name: "Champions League", short: "UCL" },
        { id: "eng.1", name: "Premier League", short: "EPL" },
        { id: "esp.1", name: "LaLiga", short: "Liga" },
        { id: "ita.1", name: "Serie A", short: "Serie A" },
        { id: "ger.1", name: "Bundesliga", short: "Buli" },
        { id: "fra.1", name: "Ligue 1", short: "L1" },
        { id: "uefa.europa", name: "Europa League", short: "UEL" },
        { id: "usa.1", name: "MLS", short: "MLS" }
    ];

    async function setupMatches() {
        const list = document.querySelector("[data-matches]");
        const filter = document.querySelector("[data-filter]");
        if (!list) return;

        const date = today.replaceAll("-", "");
        const results = await Promise.all(LEAGUES.map(async (league) => {
            try {
                const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league.id}/scoreboard?dates=${date}`);
                if (!response.ok) return [];
                const data = await response.json();
                return (data.events || []).map((event) => toMatch(event, league)).filter(Boolean);
            } catch {
                return [];
            }
        }));

        const matches = results.flat();
        // ESPN's dates are US Eastern, so drop games that fall on another
        // local day for this visitor.
        const local = matches.filter((m) => dayKey(m.kickoff) === today || m.state === "in");
        if (!local.length) {
            list.innerHTML = `<p class="muted">No big matches today. Check back tomorrow.</p>`;
            return;
        }

        const leaguesWithGames = LEAGUES.filter((league) => local.some((m) => m.league === league));
        let current = "all";

        function draw() {
            list.innerHTML = "";
            const shown = current === "all" ? local : local.filter((m) => m.league.id === current);
            leaguesWithGames.forEach((league) => {
                const games = shown.filter((m) => m.league === league)
                    .sort((a, b) => (b.state === "in") - (a.state === "in") || a.kickoff - b.kickoff);
                if (!games.length) return;
                const heading = document.createElement("p");
                heading.className = "league-name";
                heading.textContent = league.name;
                list.appendChild(heading);
                games.forEach((m) => list.appendChild(matchRow(m)));
            });
        }

        if (filter && leaguesWithGames.length > 1) {
            const tabs = [{ id: "all", short: "All" }, ...leaguesWithGames];
            tabs.forEach((tab) => {
                const button = document.createElement("button");
                button.type = "button";
                button.role = "tab";
                button.textContent = tab.short;
                button.setAttribute("aria-selected", String(tab.id === current));
                button.addEventListener("click", () => {
                    current = tab.id;
                    filter.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b === button)));
                    draw();
                });
                filter.appendChild(button);
            });
        }

        draw();
    }

    function toMatch(event, league) {
        const comp = event.competitions && event.competitions[0];
        if (!comp) return null;
        const side = (where) => comp.competitors.find((c) => c.homeAway === where);
        const home = side("home");
        const away = side("away");
        if (!home || !away) return null;
        const status = (comp.status || event.status || {}).type || {};
        return {
            league,
            kickoff: new Date(event.date),
            state: status.state, // pre | in | post
            detail: status.shortDetail || "",
            home: { name: home.team.shortDisplayName || home.team.displayName, logo: home.team.logo, score: home.score },
            away: { name: away.team.shortDisplayName || away.team.displayName, logo: away.team.logo, score: away.score }
        };
    }

    function matchRow(m) {
        const row = document.createElement("div");
        row.className = "match" + (m.state === "in" ? " is-live" : m.state === "pre" ? " is-pre" : "");

        const team = (t, where) => {
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
        };

        const mid = document.createElement("div");
        mid.className = "mid";
        const score = document.createElement("span");
        score.className = "score";
        const when = document.createElement("span");
        when.className = "when";
        if (m.state === "pre") {
            score.textContent = m.kickoff.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
            when.textContent = "Kickoff";
        } else {
            score.textContent = `${m.home.score ?? 0}–${m.away.score ?? 0}`;
            when.textContent = m.state === "in" ? m.detail : "FT";
        }
        mid.append(score, when);

        row.append(team(m.home, "home"), mid, team(m.away, "away"));
        return row;
    }

    setupTrivia();
    setupMatches();
})();
