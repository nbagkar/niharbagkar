(function () {
    const { store, today, dayNumber, pick, streak: makeStreak } = window.SoccerDaily;
    const players = window.GUESS_PLAYERS || [];
    const pool = window.GUESS_POOL || [];
    if (!players.length) return;

    const MAX = 6;
    const FIRST_DAY = Math.floor(Date.UTC(2026, 9, 27) / 86400000);
    const answer = players[pick(players.length, 3)];
    const puzzleNumber = dayNumber - FIRST_DAY + 1;

    // The opening clue shows all but the last three clubs (at least one),
    // so long careers start with the early, obscure stops. Each miss then
    // reveals one more club, then nationality, position and birth year.
    const shownAtStart = Math.max(1, answer.clubs.length - 3);
    const queue = [
        ...answer.clubs.slice(shownAtStart).map((club) => ({ club })),
        { label: "Nationality", value: answer.country },
        { label: "Position", value: answer.pos },
        { label: "Born", value: String(answer.born) }
    ];

    const $ = (sel) => document.querySelector(sel);
    const career = $("[data-career]");
    const extras = $("[data-extras]");
    const tries = $("[data-tries]");
    const count = $("[data-count]");
    const form = $("[data-form]");
    const input = $("#guess-input");
    const list = $("#guess-list");
    const skip = $("[data-skip]");
    const result = $("[data-result]");
    const streakLabel = $("[data-streak]");

    $("[data-number]").textContent = `No. ${puzzleNumber} · ${new Date().toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;

    // Duplicate names (there are two Luis Suárezes) get their birth year.
    const nameCount = {};
    pool.forEach(([, name]) => { nameCount[name] = (nameCount[name] || 0) + 1; });
    const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const entries = pool.map(([id, name, born]) => ({
        id,
        name,
        label: nameCount[name] > 1 && born ? `${name} (b. ${born})` : name,
        key: fold(name)
    }));
    const byId = Object.fromEntries(entries.map((e) => [e.id, e]));

    // { day, id, guesses: [player id or "skip"] }
    const saved = store.get("nbs-guess");
    const guesses = saved && saved.day === today && saved.id === answer.id ? saved.guesses : [];
    const streak = makeStreak("nbs-guess-streak");

    const won = () => guesses.includes(answer.id);
    const over = () => won() || guesses.length >= MAX;

    function draw() {
        const misses = won() ? guesses.length - 1 : guesses.length;
        const revealed = over() ? queue.length : Math.min(misses, queue.length);
        const clubsShown = shownAtStart + queue.slice(0, revealed).filter((c) => c.club).length;

        career.innerHTML = "";
        answer.clubs.forEach(([club, years], i) => {
            const row = document.createElement("li");
            if (i < clubsShown) {
                const y = document.createElement("span");
                y.className = "years";
                y.textContent = years;
                const c = document.createElement("span");
                c.className = "club";
                c.textContent = club;
                row.append(y, c);
                if (i >= shownAtStart && i === clubsShown - 1 && !over()) row.classList.add("is-new");
            } else {
                row.className = "is-hidden";
                row.innerHTML = `<span class="years">????</span><span class="club">Hidden club</span>`;
            }
            career.appendChild(row);
        });

        extras.innerHTML = "";
        queue.slice(0, revealed).filter((c) => c.label).forEach(({ label, value }) => {
            const dt = document.createElement("dt");
            dt.textContent = label;
            const dd = document.createElement("dd");
            dd.textContent = value;
            extras.append(dt, dd);
        });

        tries.innerHTML = "";
        guesses.forEach((g) => {
            const li = document.createElement("li");
            if (g === "skip") {
                li.className = "is-skip";
                li.textContent = "Skipped";
            } else {
                li.className = g === answer.id ? "is-right" : "is-wrong";
                li.textContent = byId[g] ? byId[g].label : g;
            }
            tries.appendChild(li);
        });

        count.textContent = over() ? "" : `${MAX - guesses.length} left`;
        form.hidden = over();

        if (streak.count > 0) {
            streakLabel.textContent = `${streak.count}-day streak`;
            streakLabel.hidden = false;
        }

        if (over()) {
            result.hidden = false;
            result.classList.toggle("is-miss", !won());
            $("[data-result-head]").textContent = won() ? `Got it in ${guesses.length}/${MAX}` : "Out of guesses";
            $("[data-result-name]").textContent = answer.name;
        }
    }

    function submit(id) {
        if (over() || guesses.includes(id)) return;
        guesses.push(id);
        store.set("nbs-guess", { day: today, id: answer.id, guesses });
        if (won()) streak.win();
        else if (over()) streak.lose();
        closeList();
        input.value = "";
        draw();
        if (!over()) input.focus();
    }

    /* Search box: words that start with what you typed rank first, then
       anywhere in the name. Picking a name submits it. */

    let matches = [];
    let active = -1;

    function search(text) {
        const q = fold(text.trim());
        if (q.length < 2) return [];
        const starts = [];
        const contains = [];
        for (const e of entries) {
            if (guesses.includes(e.id)) continue;
            const at = e.key.indexOf(q);
            if (at < 0) continue;
            if (at === 0 || e.key[at - 1] === " " || e.key[at - 1] === "-") starts.push(e);
            else contains.push(e);
            if (starts.length >= 8) break;
        }
        return [...starts, ...contains].slice(0, 8);
    }

    function renderList() {
        list.innerHTML = "";
        matches.forEach((e, i) => {
            const li = document.createElement("li");
            li.id = `guess-opt-${i}`;
            li.role = "option";
            li.textContent = e.label;
            li.setAttribute("aria-selected", String(i === active));
            li.addEventListener("mousedown", (event) => {
                event.preventDefault();
                submit(e.id);
            });
            list.appendChild(li);
        });
        const open = matches.length > 0;
        list.hidden = !open;
        input.setAttribute("aria-expanded", String(open));
        if (active >= 0) input.setAttribute("aria-activedescendant", `guess-opt-${active}`);
        else input.removeAttribute("aria-activedescendant");
    }

    function closeList() {
        matches = [];
        active = -1;
        renderList();
    }

    input.addEventListener("input", () => {
        matches = search(input.value);
        active = matches.length ? 0 : -1;
        renderList();
    });

    input.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" && matches.length) {
            event.preventDefault();
            active = (active + 1) % matches.length;
            renderList();
        } else if (event.key === "ArrowUp" && matches.length) {
            event.preventDefault();
            active = (active - 1 + matches.length) % matches.length;
            renderList();
        } else if (event.key === "Escape") {
            closeList();
        }
    });

    input.addEventListener("blur", () => setTimeout(closeList, 100));

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (active >= 0 && matches[active]) submit(matches[active].id);
    });

    skip.addEventListener("click", () => submit("skip"));

    /* Share: a spoiler-free line of squares, one per guess. */

    $("[data-share]").addEventListener("click", async (event) => {
        const squares = guesses.map((g) => (g === answer.id ? "🟩" : g === "skip" ? "⬛" : "🟥")).join("");
        const score = won() ? `${guesses.length}/${MAX}` : `X/${MAX}`;
        const text = `Guess the player #${puzzleNumber} ${score}\n${squares}\nhttps://soccer.niharbagkar.com/guess.html`;
        const button = event.currentTarget;
        try {
            if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ text });
            else {
                await navigator.clipboard.writeText(text);
                button.textContent = "Copied";
                setTimeout(() => { button.textContent = "Share result"; }, 1800);
            }
        } catch { /* share sheet closed */ }
    });

    draw();
})();
