(function () {
    const root = document.getElementById("pitch");
    if (!root) return;

    const canvas = root.querySelector(".pitch-canvas");
    const stamp = root.querySelector(".pitch-stamp");
    const stage = root.querySelector(".pitch-stage");
    const clock = root.querySelector(".pitch-clock");
    const scoreLine = root.querySelector(".pitch-score");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 640;
    let H = 360;
    const FIELD = { left: 0, right: 0, top: 0, bottom: 0 };
    const MOUTH = { top: 0, bottom: 0 };
    const GOAL_DEPTH = 26;
    const CAR = { hx: 17, hy: 9 };
    const BALL_R = 11;
    const INK = "#1b1812";
    const PAPER = "#f8f3e6";
    const ACCENT = "#c8391f";

    const COLORS = {
        red: { name: "Red", fill: "#c8391f" },
        blue: { name: "Blue", fill: "#2c6db5" },
        purple: { name: "Purple", fill: "#7a4bb0" },
        green: { name: "Green", fill: "#2e8b57" },
        black: { name: "Black", fill: "#2a2620" },
    };
    const BOT_FILL = "#d9a93a";

    // How the bot plays at each level: how often it rethinks (ms), how far
    // ahead it reads the ball (s), how sloppy its aim is (px), how sharply
    // it steers, its engine power, how often it boosts and whether it also
    // boosts while chasing, whether it falls back to defend or keeps goal,
    // how lined up it must be to shoot, whether it aims past the player's
    // car, and its reaction pause at each kickoff (ms).
    const LEVELS = {
        easy: { name: "Easy", think: 500, lead: 0, noise: 110, steer: 1.6, power: 0.62, boost: 0, chaseBoost: false, defends: false, keeps: false, lineUp: 0.2, aims: false, react: 400 },
        medium: { name: "Medium", think: 110, lead: 0.15, noise: 28, steer: 2.6, power: 0.92, boost: 0.5, chaseBoost: false, defends: true, keeps: false, lineUp: 0.25, aims: true, react: 250 },
        hard: { name: "Hard", think: 20, lead: 0.35, noise: 2, steer: 4, power: 1.18, boost: 1, chaseBoost: true, defends: true, keeps: true, lineUp: 0.2, aims: true, react: 150 },
        // The boss: Hard's brain with sharper handling (turn), a little more
        // pace, harder shots and quicker kickoffs. It keeps goal whenever you
        // will reach the ball first in its half and mixes up its kickoffs.
        // Tuned on Nihar's recorded matches; pace, handling, shot and
        // reaction values below are overwritten by applyStrength().
        nihar: { name: "Nihar", boss: true, think: 20, lead: 0.35, noise: 2, steer: 4, power: 1.22, turn: 1.5, shot: 1.15, boost: 1, chaseBoost: true, defends: true, keeps: true, lineUp: 0.2, aims: true, react: 80, keepZone: 0.42, keepOut: 0.45, unpin: 120 },
    };
    const BOSS_FILL = "#1ef2c8";

    // Recording mode (?record): Nihar's own matches are logged so the boss
    // can later be fitted to how he plays. Visitors never see it.
    const RECORD = /[?&]record\b/.test(location.search);
    const recordings = [];
    let recording = null;

    // Friend rooms (online.js): the host runs the match; the guest sends its
    // controls and draws the host's snapshots a moment behind, smoothed.
    const net = {
        link: null, role: null, peer: false, joined: 0, peerColor: "blue", snaps: [], lastSnap: 0, friendPanel: false,
        // Prediction: the guest drives its own car locally and reports where it
        // is; rtt is the measured round trip, used to project things to "now".
        rtt: 120, peerRtt: 120, remoteCar: null, kickNo: 0, lastCarSent: 0, lastPing: 0, touchedAt: -Infinity,
    };
    const SNAP_MS = 50;
    const CAR_MS = 40;

    const player = { x: 0, y: 0, angle: 0, speed: 0, power: 1 };
    const bot = { x: 0, y: 0, angle: Math.PI, speed: 0, power: 1, target: null, nextThink: 0, stuckSince: 0, reverseUntil: 0 };
    const ball = { x: 0, y: 0, vx: 0, vy: 0, spin: 0 };
    const keys = new Set();
    const pointer = { active: false, x: 0, y: 0 };
    const trail = [];
    const sparks = [];
    const score = { you: 0, them: 0 };
    let freezeUntil = 0;
    let started = false;
    let visible = false;
    let running = false;
    let last = 0;
    let scale = 1;

    // Arcade: "idle" shows the menu, "count" the 3-2-1, "match" a 60-second
    // game against the bot, "over" the result; "free" is the open pitch.
    const MATCH_MS = 60000;
    let mode = "idle";
    let matchEnd = 0;
    let shownSeconds = -1;
    let countTimers = [];

    function stored(key, fallback) {
        try {
            return localStorage.getItem(key) || fallback;
        } catch (error) {
            return fallback;
        }
    }

    function store(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            /* Private mode: the choice lasts for this visit only. */
        }
    }

    let bossUnlocked = RECORD || stored("nb-beat-hard", "") === "1";
    let level = LEVELS[stored("nb-bot", "")] ? stored("nb-bot", "") : "medium";
    if (level === "nihar" && !bossUnlocked) level = "medium";
    let carColor = COLORS[stored("nb-car", "")] ? stored("nb-car", "") : "red";

    function bestFor(name) {
        return Number(stored(`nb-best-${name}`, "0")) || 0;
    }

    // Setup: bot difficulty and car colour, above the pitch.

    const setup = document.createElement("div");
    setup.className = "pitch-setup";
    setup.innerHTML = `
        <fieldset class="pitch-levels"><legend>Bot</legend>${Object.entries(LEVELS).map(([id, info]) =>
            `<label class="pitch-seg${info.boss ? " is-boss" : ""}"><input type="radio" name="pitch-level" value="${id}"><span>${info.name}</span></label>`).join("")}</fieldset>
        <fieldset class="pitch-colors"><legend>Your car</legend>${Object.entries(COLORS).map(([id, info]) =>
            `<label class="pitch-swatch" title="${info.name}"><input type="radio" name="pitch-color" value="${id}" aria-label="${info.name}"><span style="--swatch:${info.fill}"></span></label>`).join("")}</fieldset>`;
    root.insertBefore(setup, root.firstElementChild);
    const levelSet = setup.querySelector(".pitch-levels");
    setup.querySelector(`[name="pitch-level"][value="${level}"]`).checked = true;
    const bossInput = setup.querySelector('[name="pitch-level"][value="nihar"]');

    function renderLock() {
        bossInput.disabled = !bossUnlocked;
        bossInput.closest("label").classList.toggle("is-locked", !bossUnlocked);
        bossInput.closest("label").title = bossUnlocked ? "Boss level, tuned on Nihar's play data" : "Beat Hard to unlock";
        bossInput.setAttribute("aria-label", bossUnlocked ? "Nihar, boss level" : "Nihar, boss level, locked until you beat Hard");
    }
    renderLock();

    // One dial for the boss's strength, 1-10. Nihar beat it at 6, so 8 ships;
    // recording mode shows the dial. Each step moves pace, handling, shot
    // power and reaction time together.
    function applyStrength(value) {
        const step = value - 1;
        Object.assign(LEVELS.nihar, {
            power: 1.05 + step * 0.035,
            turn: 1.1 + step * 0.08,
            shot: 1 + step * 0.03,
            react: Math.max(0, 200 - step * 24),
            think: 40 - step * 4,
        });
    }

    const SHIPPED_STRENGTH = 8;
    let strength = SHIPPED_STRENGTH;
    applyStrength(strength);
    if (RECORD) {
        strength = Number(stored("nb-boss-tune", String(SHIPPED_STRENGTH))) || SHIPPED_STRENGTH;
        applyStrength(strength);
        const tune = document.createElement("label");
        tune.className = "pitch-tune";
        tune.innerHTML = `Boss strength <input type="range" min="1" max="10" step="1" value="${strength}"><output>${strength}</output>`;
        setup.appendChild(tune);
        tune.querySelector("input").addEventListener("input", (event) => {
            strength = Number(event.target.value);
            tune.querySelector("output").textContent = strength;
            applyStrength(strength);
            store("nb-boss-tune", String(strength));
        });
    }
    setup.querySelector(`[name="pitch-color"][value="${carColor}"]`).checked = true;

    levelSet.addEventListener("change", (event) => {
        level = event.target.value;
        store("nb-bot", level);
        sound("tab");
        renderScore();
        if (mode === "idle") idle();
        track(`pitch-level-${level}`, `Bot level: ${LEVELS[level].name}`);
    });

    setup.querySelector(".pitch-colors").addEventListener("change", (event) => {
        carColor = event.target.value;
        store("nb-car", carColor);
        if (net.link) net.link.send({ t: "hello", color: carColor });
        sound("tab");
        draw(performance.now());
        track(`pitch-car-${carColor}`, `Car colour: ${COLORS[carColor].name}`);
    });

    const overlay = document.createElement("div");
    overlay.className = "pitch-overlay";
    overlay.innerHTML = `<p class="po-big"></p><p class="po-sub"></p>
        <div class="po-board" hidden><p class="po-board-title">Beat Nihar: top 10</p><ol></ol></div>
        <form class="po-entry" hidden><label>Your initials <input name="initials" maxlength="3" placeholder="2–3" autocomplete="off" autocapitalize="characters" spellcheck="false" required></label><button class="btn" type="submit">Submit score</button></form>
        <p class="po-note" aria-live="polite" hidden></p>
        <div class="po-room" hidden>
            <p class="po-room-code"></p>
            <p class="po-room-link"><input readonly aria-label="Room link"><button class="po-free po-copy" type="button">Copy link</button></p>
            <form class="po-join"><label>Have a code? <input name="code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Room code"></label><button class="po-free" type="submit">Join</button></form>
        </div>
        <p class="po-actions"><button class="btn po-start" type="button"></button><button class="po-free po-free-play" type="button">Free play</button><button class="po-free po-friend" type="button">Play a friend</button><button class="po-free po-leave" type="button" hidden>Leave room</button></p>`;
    stage.appendChild(overlay);
    const startButton = overlay.querySelector(".po-start");
    const freeButton = overlay.querySelector(".po-free-play");
    const friendButton = overlay.querySelector(".po-friend");
    const leaveButton = overlay.querySelector(".po-leave");
    const roomBox = overlay.querySelector(".po-room");

    // Recording mode: a button to save this session's matches as a file.
    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "po-free po-download";
    downloadButton.hidden = true;
    overlay.querySelector(".po-actions").appendChild(downloadButton);

    function showDownload() {
        downloadButton.hidden = false;
        downloadButton.textContent = `Download play data (${recordings.length} ${recordings.length === 1 ? "match" : "matches"})`;
    }

    downloadButton.addEventListener("click", () => {
        const file = new Blob([JSON.stringify({ version: 1, recorded: new Date().toISOString(), matches: recordings })], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(file);
        link.download = `kickoff-play-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });

    function sound(name) {
        if (window.sfx) window.sfx(name);
    }

    // "Beat Nihar" leaderboard: every boss match, best goal difference first.
    // The server issues a token at kickoff and checks each submission.
    const BOARD_URL = "https://cnqxfazzvpmcvtttkjed.supabase.co/functions/v1/kickoff";
    const boardBox = overlay.querySelector(".po-board");
    const entry = overlay.querySelector(".po-entry");
    const entryInput = entry.querySelector("input");
    const note = overlay.querySelector(".po-note");
    let boardRows = null;
    let boardFetched = 0;
    let matchToken = null;
    let lastMatch = null;
    let mine = null;

    function setNote(text) {
        note.textContent = text;
        note.hidden = !text;
    }

    function renderBoard() {
        const list = boardBox.querySelector("ol");
        list.replaceChildren();
        if (!boardRows || !boardRows.length) {
            const empty = document.createElement("li");
            empty.className = "po-board-empty";
            empty.textContent = boardRows ? "No scores yet. Be the first." : "Loading…";
            list.appendChild(empty);
            return;
        }
        boardRows.forEach((row, i) => {
            const item = document.createElement("li");
            item.classList.toggle("is-win", row.goal_diff > 0);
            item.classList.toggle("is-mine", mine !== null && i === mine);
            item.innerHTML = `<span class="pb-rank"></span><span class="pb-name"></span><span class="pb-score"></span>`;
            item.querySelector(".pb-rank").textContent = String(i + 1);
            item.querySelector(".pb-name").textContent = row.initials;
            item.querySelector(".pb-score").textContent = `${row.goals_for}–${row.goals_against}`;
            list.appendChild(item);
        });
    }

    function showBoard(visible) {
        boardBox.hidden = !visible;
        overlay.classList.toggle("has-board", visible);
        if (!visible) return;
        renderBoard();
        if (Date.now() - boardFetched > 30000) loadBoard();
    }

    async function loadBoard() {
        boardFetched = Date.now();
        try {
            const response = await fetch(BOARD_URL);
            const data = await response.json();
            if (data.board) boardRows = data.board;
        } catch (error) {
            if (!boardRows) boardRows = [];
        }
        renderBoard();
    }

    async function requestToken() {
        matchToken = null;
        try {
            const response = await fetch(BOARD_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) });
            const data = await response.json();
            matchToken = data.token || null;
        } catch (error) {
            matchToken = null;
        }
    }

    entryInput.value = stored("nb-initials", "");
    entryInput.addEventListener("input", () => {
        entryInput.value = entryInput.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
    });

    entry.addEventListener("submit", async (event) => {
        event.preventDefault();
        const initials = entryInput.value;
        if (!/^[A-Z]{2,3}$/.test(initials)) {
            setNote("Two or three letters, please.");
            entryInput.focus();
            return;
        }
        const button = entry.querySelector("button");
        button.disabled = true;
        setNote("Sending…");
        try {
            const response = await fetch(BOARD_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "submit", token: lastMatch.token, initials, you: lastMatch.you, them: lastMatch.them }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Could not submit.");
            store("nb-initials", initials);
            boardRows = data.board;
            boardFetched = Date.now();
            mine = data.rank <= 10 ? data.rank - 1 : null;
            entry.hidden = true;
            lastMatch = null;
            setNote(data.rank <= 10 ? `You're #${data.rank} on the board.` : `You're #${data.rank}. Top 10 needs a better goal difference.`);
            renderBoard();
            sound("unlock");
            track("pitch-board-submit", "Submitted a Beat Nihar score");
        } catch (error) {
            setNote(error.message);
        } finally {
            button.disabled = false;
        }
    });

    function formatClock(ms) {
        const seconds = Math.max(0, Math.ceil(ms / 1000));
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }

    function plural(count, word) {
        return `${count} ${word}${count === 1 ? "" : "s"}`;
    }

    function versusBot() {
        return mode !== "free";
    }

    function boss() {
        return !net.link && Boolean(LEVELS[level].boss);
    }

    function rival() {
        return net.link ? "Friend" : boss() ? "Nihar" : "Bot";
    }

    function rivalPhrase() {
        return net.link ? "your friend" : boss() ? "Nihar" : `the ${LEVELS[level].name.toLowerCase()} bot`;
    }

    // Goals from this screen's point of view: the guest drives the right car.
    function myGoals() {
        return net.role === "guest" ? { you: score.them, them: score.you } : { you: score.you, them: score.them };
    }

    function renderScore() {
        if (net.link) {
            const { you, them } = myGoals();
            scoreLine.textContent = `You ${you} – ${them} Friend · room ${net.link.code}`;
        } else if (versusBot()) {
            const best = bestFor(level);
            scoreLine.textContent = `You ${score.you} – ${score.them} ${rival()}${best ? ` · best ${best} vs ${boss() ? "Nihar" : LEVELS[level].name}` : ""}`;
        } else {
            scoreLine.textContent = `${plural(score.you, "goal")} · ${score.them} own ${score.them === 1 ? "goal" : "goals"}`;
        }
    }

    // Friend rooms

    function roomLink(code) {
        return `${location.origin}${location.pathname}?room=${code}#kickoff`;
    }

    function showRoomCode() {
        roomBox.hidden = false;
        roomBox.querySelector(".po-room-code").hidden = false;
        roomBox.querySelector(".po-room-link").hidden = false;
        roomBox.querySelector(".po-join").hidden = true;
        roomBox.querySelector(".po-room-code").textContent = net.link.code;
        roomBox.querySelector(".po-room-link input").value = roomLink(net.link.code);
    }

    function friendPanel() {
        setOverlay("Play a friend", "Make a room and send your friend the link, or join theirs with its code.", "Create a room");
        net.friendPanel = true;
        friendButton.hidden = true;
        freeButton.hidden = true;
        leaveButton.hidden = false;
        leaveButton.textContent = "Back";
        roomBox.hidden = false;
        roomBox.querySelector(".po-room-code").hidden = true;
        roomBox.querySelector(".po-room-link").hidden = true;
        roomBox.querySelector(".po-join").hidden = false;
    }

    function lobby() {
        mode = "idle";
        levelSet.disabled = true;
        renderScore();
        if (net.role === "host") {
            if (net.peer) setOverlay("Your friend is here", "Press Start when you're both ready. You drive the left car.", "Start match");
            else setOverlay(`Room ${net.link.code}`, "Send your friend this link. Start the match once they join.", "");
            showRoomCode();
        } else {
            setOverlay(`Room ${net.link.code}`, net.peer ? "You're in. Your friend starts the match. You drive the right car." : "Waiting for your friend to open the room…", "");
        }
    }

    async function openRoom(code, role) {
        setOverlay(role === "host" ? "Making a room…" : `Joining room ${code}…`, "", "");
        try {
            net.role = role;
            net.peer = false;
            net.full = false;
            net.joined = Date.now();
            net.link = await window.KickoffNet.open(code, role, { message: onNetMessage, peers: onPeers });
            if (net.full) {
                leaveRoom();
                setNote("That room is full.");
                return;
            }
            if (net.peer) net.link.send({ t: "hello", color: carColor });
            setGeometry(640, 360);
            resize();
            kickoff();
            draw(performance.now());
            lobby();
            track(`pitch-room-${role}`, role === "host" ? "Opened a friend room" : "Joined a friend room");
        } catch (error) {
            net.link = null;
            net.role = null;
            idle();
            setNote(error.message);
        }
    }

    function leaveRoom() {
        countTimers.forEach(window.clearTimeout);
        if (net.link) net.link.close();
        net.link = null;
        net.role = null;
        net.peer = false;
        net.snaps = [];
        score.you = 0;
        score.them = 0;
        clock.hidden = true;
        if (location.search.includes("room=")) history.replaceState(null, "", location.pathname + location.hash);
        resize();
        kickoff();
        idle();
    }

    function onPeers(list) {
        // A third person in the room: the latest arrival leaves.
        const earlier = list.filter((peer) => (peer.joined || 0) < net.joined);
        if (earlier.length >= 2) {
            if (!net.link) {
                net.full = true;
                return;
            }
            leaveRoom();
            setNote("That room is full.");
            return;
        }
        const had = net.peer;
        net.peer = list.some((peer) => peer.role === (net.role === "host" ? "guest" : "host"));
        // Presence can arrive while the room is still opening; openRoom says
        // hello and shows the lobby once the link is ready.
        if (!net.link) return;
        if (net.peer && !had) {
            net.link.send({ t: "hello", color: carColor });
            sound("unlock");
            if (mode === "idle" || mode === "over") lobby();
        } else if (!net.peer && had) {
            countTimers.forEach(window.clearTimeout);
            mode = "idle";
            setOverlay("Your friend left", net.role === "host" ? "The room stays open if they want to come back." : "The room's host left.", "");
            if (net.role === "host") showRoomCode();
        }
    }

    function onNetMessage(message) {
        if (!message || typeof message !== "object") return;
        if (message.t === "hello") {
            if (COLORS[message.color]) net.peerColor = message.color;
            draw(performance.now());
            return;
        }
        if (net.role === "host") {
            if (message.t === "car" && Array.isArray(message.s) && message.k === net.kickNo) {
                net.remoteCar = { s: message.s.map((v) => Number(v) || 0), at: performance.now() };
                if (Number(message.rtt) > 0) net.peerRtt = clamp(Number(message.rtt), 20, 600);
            } else if (message.t === "ping") {
                net.link.send({ t: "pong", c: message.c });
            }
            return;
        }
        if (message.t === "pong") {
            const rtt = performance.now() - Number(message.c);
            if (rtt > 0 && rtt < 2000) net.rtt = net.rtt * 0.7 + rtt * 0.3;
            return;
        }
        if (message.t === "kick") {
            net.kickNo = Number(message.k) || 0;
            kickoff();
            net.snaps = [];
            return;
        }
        if (message.t === "start") {
            if (COLORS[message.color]) net.peerColor = message.color;
            startMatch(true);
        } else if (message.t === "s" && Array.isArray(message.p)) {
            net.snaps.push({ at: performance.now(), p: message.p, ball: message.ball, left: message.left });
            if (net.snaps.length > 4) net.snaps.shift();
            if (score.you !== message.sc[0] || score.them !== message.sc[1]) {
                score.you = message.sc[0];
                score.them = message.sc[1];
                renderScore();
            }
        } else if (message.t === "goal") {
            const mine = !message.host;
            sound(mine ? "goal" : "stamp");
            stamp.textContent = mine ? "Goal!" : "Friend scored";
            stamp.classList.remove("is-on");
            void stamp.offsetWidth;
            stamp.classList.add("is-on");
        } else if (message.t === "end") {
            score.you = Number(message.you) || 0;
            score.them = Number(message.them) || 0;
            endOnline();
        }
    }

    function r1(value) {
        return Math.round(value * 10) / 10;
    }

    function snapshot(left) {
        const car = (c) => [r1(c.x), r1(c.y), Math.round(c.angle * 1000) / 1000, r1(c.speed)];
        return { t: "s", p: car(player), ball: [r1(ball.x), r1(ball.y), r1(ball.spin), r1(ball.vx), r1(ball.vy)], sc: [score.you, score.them], left: Math.max(0, Math.round(left)) };
    }

    // Host side: the guest's car is wherever the guest last said it was,
    // projected forward by half the round trip, so touches line up with
    // what the guest saw.
    const REMOTE_CAR = { remote: true };

    function placeRemoteCar(now) {
        const remote = net.remoteCar;
        if (!remote) return;
        const lead = Math.min(220, now - remote.at + net.peerRtt / 2) / 1000;
        const [x, y, angle, speed] = remote.s;
        bot.angle = angle;
        bot.speed = speed;
        bot.x = clamp(x + Math.cos(angle) * speed * lead, FIELD.left + 13, FIELD.right - 13);
        bot.y = clamp(y + Math.sin(angle) * speed * lead, FIELD.top + 13, FIELD.bottom - 13);
    }

    // Where a snapshot's ball would be `seconds` later (drag and walls only).
    function advanceBall(state, seconds) {
        let [x, y, , vx, vy] = state;
        const step = 1 / 60;
        const drag = Math.exp(-0.75 * step);
        for (let t = 0; t < seconds; t += step) {
            x += vx * step;
            y += vy * step;
            vx *= drag;
            vy *= drag;
            if (y < FIELD.top + BALL_R || y > FIELD.bottom - BALL_R) {
                y = clamp(y, FIELD.top + BALL_R, FIELD.bottom - BALL_R);
                vy *= -0.8;
            }
            if ((y < MOUTH.top || y > MOUTH.bottom) && (x < FIELD.left + BALL_R || x > FIELD.right - BALL_R)) {
                x = clamp(x, FIELD.left + BALL_R, FIELD.right - BALL_R);
                vx *= -0.8;
            }
        }
        return { x, y, vx, vy };
    }

    // Guest side: drive our own car (the right one) locally so it answers at
    // once, run the ball here too so our touches move it at once, and ease
    // the ball and the host's car toward the host's state brought up to the
    // present. Right after our own touch the host has not seen it yet, so the
    // ball is left alone for a moment instead of being pulled back.
    function guestFrame(now, dt) {
        const playing = mode === "match";
        if (playing) {
            const input = playerInput(bot);
            const steps = Math.min(8, Math.max(1, Math.ceil(((Math.abs(bot.speed) + Math.hypot(ball.vx, ball.vy)) * dt) / 5)));
            const h = dt / steps;
            for (let i = 0; i < steps; i++) {
                updateCar(bot, h, input, i === steps - 1);
                updateBall(h, now);
                const before = ball.vx + ball.vy;
                collide(bot);
                if (ball.vx + ball.vy !== before) net.touchedAt = now;
                collide(player);
                bumpCars();
            }
            if (now - net.lastCarSent > CAR_MS) {
                net.lastCarSent = now;
                net.link.send({ t: "car", k: net.kickNo, rtt: Math.round(net.rtt), s: [r1(bot.x), r1(bot.y), Math.round(bot.angle * 1000) / 1000, r1(bot.speed)] });
            }
            if (now - net.lastPing > 1000) {
                net.lastPing = now;
                net.link.send({ t: "ping", c: now });
            }
        }
        const snap = net.snaps[net.snaps.length - 1];
        if (snap) {
            const lead = Math.min(250, now - snap.at + net.rtt / 2) / 1000;
            const [px, py, pa, ps] = snap.p;
            const tx = px + Math.cos(pa) * ps * lead;
            const ty = py + Math.sin(pa) * ps * lead;
            const ease = playing ? 0.5 : 1;
            player.x += (tx - player.x) * ease;
            player.y += (ty - player.y) * ease;
            player.angle += wrapAngle(pa - player.angle) * ease;
            player.speed = ps;
            const target = advanceBall(snap.ball, lead);
            const off = Math.hypot(target.x - ball.x, target.y - ball.y);
            const ours = now - net.touchedAt < net.rtt + 150;
            if (!playing || off > 90) {
                ball.x = target.x;
                ball.y = target.y;
                ball.vx = target.vx;
                ball.vy = target.vy;
            } else if (!ours) {
                ball.x += (target.x - ball.x) * 0.15;
                ball.y += (target.y - ball.y) * 0.15;
                ball.vx += (target.vx - ball.vx) * 0.15;
                ball.vy += (target.vy - ball.vy) * 0.15;
            }
            ball.spin = snap.ball[2];
            if (playing) {
                const left = snap.left - (now - snap.at);
                const seconds = Math.ceil(left / 1000);
                if (seconds !== shownSeconds) {
                    shownSeconds = seconds;
                    root.querySelector('[data-score="clock"]').textContent = formatClock(Math.max(0, left));
                    clock.classList.toggle("is-low", seconds <= 10);
                }
            }
        }
        draw(now, dt);
        if (visible && (mode === "match" || mode === "count")) requestAnimationFrame(frame);
        else running = false;
    }

    function endOnline() {
        mode = "over";
        keys.clear();
        pointer.active = false;
        sound("whistle");
        if (net.role === "host") net.link.send({ t: "end", you: score.you, them: score.them });
        const { you, them } = myGoals();
        const big = you > them ? "You win!" : you < them ? "Friend wins" : "Draw";
        const next = net.role === "host" ? "Rematch when you're both ready." : "Your friend can start a rematch.";
        setOverlay(big, `${you}–${them} against your friend. ${next}`, net.role === "host" ? "Rematch" : "");
        renderScore();
        window.setTimeout(() => (net.role === "host" ? startButton : leaveButton).focus({ preventScroll: true }), 50);
        track("pitch-online-full-time", `Friend match: ${you}-${them}`);
    }

    function setOverlay(big, sub, startLabel) {
        overlay.hidden = false;
        entry.hidden = true;
        roomBox.hidden = true;
        friendButton.hidden = Boolean(net.link);
        freeButton.hidden = Boolean(net.link);
        leaveButton.hidden = !net.link;
        setNote("");
        showBoard(false);
        overlay.classList.remove("is-counting");
        overlay.querySelector(".po-big").textContent = big;
        overlay.querySelector(".po-sub").textContent = sub;
        overlay.querySelector(".po-actions").hidden = !startLabel && !net.link;
        startButton.hidden = !startLabel;
        if (startLabel) startButton.textContent = startLabel;
        leaveButton.textContent = "Leave room";
        net.friendPanel = false;
        startButton.toggleAttribute("data-autofocus", Boolean(startLabel));
        canvas.removeAttribute("data-autofocus");
    }

    function hideOverlay() {
        overlay.hidden = true;
        startButton.removeAttribute("data-autofocus");
        canvas.setAttribute("data-autofocus", "");
    }

    function idle() {
        mode = "idle";
        levelSet.disabled = false;
        renderScore();
        if (boss()) {
            setOverlay("Boss match: Nihar", "The final boss, tuned on Nihar's play data. 60 seconds to score in the red goal and keep Nihar out of yours.", "Start match");
            mine = null;
            showBoard(true);
        } else setOverlay("Kick off", `60 seconds against ${rivalPhrase()}. Score in the red goal and keep the ball out of yours.`, "Start match");
    }

    function startMatch(fromHost) {
        if (net.link && net.role === "guest" && !fromHost) return;
        if (net.link && !net.peer) return;
        if (net.link && net.role === "host") net.link.send({ t: "start", color: carColor });
        countTimers.forEach(window.clearTimeout);
        countTimers = [];
        mode = "count";
        levelSet.disabled = true;
        score.you = 0;
        score.them = 0;
        renderScore();
        freezeUntil = 0;
        trail.length = 0;
        kickoff();
        draw(performance.now());
        clock.hidden = false;
        clock.classList.remove("is-low");
        root.querySelector('[data-score="clock"]').textContent = formatClock(MATCH_MS);
        overlay.querySelector(".po-actions").hidden = true;
        overlay.querySelector(".po-sub").textContent = "";
        overlay.hidden = false;
        overlay.classList.add("is-counting");
        canvas.focus({ preventScroll: true });
        const big = overlay.querySelector(".po-big");
        const beats = ["3", "2", "1", "Go!"];
        const step = motionOn() ? 700 : 0;
        beats.forEach((beat, i) => {
            countTimers.push(window.setTimeout(() => {
                big.textContent = beat;
                overlay.classList.remove("is-counting");
                void overlay.offsetWidth;
                overlay.classList.add("is-counting");
                sound(i === beats.length - 1 ? "go" : "tick");
            }, i * step));
        });
        countTimers.push(window.setTimeout(() => {
            mode = "match";
            matchEnd = performance.now() + MATCH_MS;
            shownSeconds = -1;
            bot.nextThink = 0;
            hideOverlay();
            canvas.focus({ preventScroll: true });
            wake();
        }, beats.length * step - (step ? 250 : 0)));
        started = true;
        if (RECORD) recording = { level, strength: level === "nihar" ? strength : null, W, H, frames: [] };
        if (boss()) requestToken();
        net.snaps = [];
        if (net.link) {
            bot.power = 1;
            bot.turn = 1;
            net.remoteCar = null;
            net.kickNo = 0;
            renderScore();
        }
        track(`pitch-match-${level}`, `Started a match against ${rivalPhrase()}`);
    }

    function endMatch() {
        if (net.link) {
            endOnline();
            return;
        }
        mode = "over";
        levelSet.disabled = false;
        keys.clear();
        pointer.active = false;
        sound("whistle");
        const { you, them } = score;
        const record = you > bestFor(level);
        if (record) store(`nb-best-${level}`, String(you));
        renderScore();
        const line = `${you}–${them}`;
        const big = you > them ? (boss() ? "You beat Nihar!" : "You win!") : you < them ? `${rival()} wins` : "Draw";
        let result = you > them ? `You beat ${rivalPhrase()} ${line}.` :
            you < them ? `${boss() ? "Nihar" : `The ${LEVELS[level].name.toLowerCase()} bot`} won ${line}.` : `Level at ${line}.`;
        if (record && you > 0) result += " New best!";
        if (level === "hard" && you > them && !bossUnlocked) {
            bossUnlocked = true;
            store("nb-beat-hard", "1");
            renderLock();
            result += " Boss unlocked: Nihar.";
            sound("unlock");
            track("pitch-boss-unlocked", "Unlocked the Nihar boss");
        }
        setOverlay(big, result, "Play again");
        // Boss matches can go on the leaderboard (recording mode's tuned
        // strengths do not count).
        let entering = false;
        if (boss()) {
            mine = null;
            showBoard(true);
            if (matchToken && !(RECORD && strength !== SHIPPED_STRENGTH)) {
                lastMatch = { token: matchToken, you, them };
                matchToken = null;
                entry.hidden = false;
                entering = true;
            }
        }
        if (recording) {
            recording.score = { you, them };
            recordings.push(recording);
            recording = null;
            showDownload();
        }
        window.setTimeout(() => (entering ? entryInput : startButton).focus({ preventScroll: true }), 50);
        track(`pitch-full-time-${level}`, `Full time on ${LEVELS[level].name}: ${line}`);
    }

    function motionOn() {
        return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    startButton.addEventListener("click", () => {
        if (net.friendPanel) openRoom(window.KickoffNet.newCode(), "host");
        else startMatch(false);
    });
    friendButton.addEventListener("click", () => {
        friendPanel();
        track("pitch-friend-panel", "Opened Play a friend");
    });
    leaveButton.addEventListener("click", () => {
        if (net.link) leaveRoom();
        else idle();
    });
    roomBox.querySelector(".po-copy").addEventListener("click", async (event) => {
        const input = roomBox.querySelector(".po-room-link input");
        try {
            await navigator.clipboard.writeText(input.value);
            event.target.textContent = "Copied!";
        } catch (error) {
            input.select();
            event.target.textContent = "Press Ctrl+C";
        }
        window.setTimeout(() => (event.target.textContent = "Copy link"), 2000);
    });
    roomBox.querySelector(".po-join").addEventListener("submit", (event) => {
        event.preventDefault();
        const code = window.KickoffNet.cleanCode(event.target.code.value);
        if (code.length !== 4) {
            setNote("Room codes are four letters.");
            return;
        }
        openRoom(code, "guest");
    });
    roomBox.querySelector(".po-join input").addEventListener("input", (event) => {
        event.target.value = window.KickoffNet.cleanCode(event.target.value);
    });
    freeButton.addEventListener("click", () => {
        countTimers.forEach(window.clearTimeout);
        mode = "free";
        levelSet.disabled = false;
        clock.hidden = true;
        score.you = 0;
        score.them = 0;
        renderScore();
        kickoff();
        hideOverlay();
        canvas.focus({ preventScroll: true });
        start();
        draw(performance.now());
    });

    function track(name, title) {
        if (window.goatcounter && window.goatcounter.count) {
            window.goatcounter.count({ path: name, title: title, event: true });
        }
    }

    function setGeometry(width, height) {
        W = width;
        H = height;
        FIELD.left = 36;
        FIELD.right = W - 36;
        FIELD.top = 16;
        FIELD.bottom = H - 16;
        MOUTH.top = H / 2 - 52;
        MOUTH.bottom = H / 2 + 52;
        canvas.style.aspectRatio = `${W} / ${H}`;
    }

    function kickoff() {
        player.x = W / 2 - 110;
        player.y = H / 2;
        player.angle = 0;
        player.speed = 0;
        bot.x = W / 2 + 110;
        bot.y = H / 2;
        bot.angle = Math.PI;
        bot.speed = 0;
        bot.target = null;
        bot.nextThink = 0;
        bot.reverseUntil = 0;
        bot.fresh = true;
        bot.steerOut = 0;
        ball.x = W / 2;
        ball.y = H / 2;
        ball.vx = 0;
        ball.vy = 0;
        ball.inNet = false;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function wrapAngle(angle) {
        return Math.atan2(Math.sin(angle), Math.cos(angle));
    }

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const cssWidth = canvas.clientWidth || W;
        // Online, both screens use the full pitch so positions line up.
        const compact = cssWidth < 520 && !net.link;
        if (compact !== (W === 440)) {
            setGeometry(compact ? 440 : 640, compact ? 300 : 360);
            trail.length = 0;
            freezeUntil = 0;
            kickoff();
        }
        canvas.width = Math.round(cssWidth * dpr);
        canvas.height = Math.round((cssWidth * dpr * H) / W);
        scale = canvas.width / W;
        draw(performance.now());
    }

    function steerTo(car, x, y, gain) {
        const dx = x - car.x;
        const dy = y - car.y;
        const diff = wrapAngle(Math.atan2(dy, dx) - car.angle);
        return { diff, distance: Math.hypot(dx, dy), steer: clamp(diff * gain, -1, 1) };
    }

    function playerInput(car = player) {
        let throttle = 0;
        let steer = 0;
        if (mode !== "match" && mode !== "free") return { throttle, steer, boost: false };
        if (pointer.active) {
            const aim = steerTo(car, pointer.x, pointer.y, 2.5);
            steer = aim.steer;
            throttle = aim.distance > 18 ? (Math.abs(aim.diff) > 1.9 ? 0.4 : 1) : 0;
        } else {
            if (keys.has("up")) throttle += 1;
            if (keys.has("down")) throttle -= 1;
            if (keys.has("right")) steer += 1;
            if (keys.has("left")) steer -= 1;
        }
        return { throttle, steer, boost: keys.has("boost") && throttle > 0 };
    }

    // The bot attacks the left goal and defends the right one.

    // Better bots shoot at whichever part of the goal the player's car is
    // not covering.
    function openShot(bx, by, skill) {
        const centre = { x: FIELD.left - 12, y: H / 2 };
        if (!skill.aims) return centre;
        const spots = [-32, 0, 32].map((offset) => ({ x: FIELD.left - 12, y: H / 2 + offset }));
        let best = centre;
        let bestGap = -Infinity;
        spots.forEach((spot) => {
            const sx = spot.x - bx;
            const sy = spot.y - by;
            const length = Math.hypot(sx, sy) || 1;
            const t = clamp(((player.x - bx) * sx + (player.y - by) * sy) / (length * length), 0, 1);
            const gap = Math.hypot(player.x - (bx + sx * t), player.y - (by + sy * t)) - Math.abs(spot.y - H / 2) * 0.2;
            if (gap > bestGap) {
                bestGap = gap;
                best = spot;
            }
        });
        return best;
    }

    // Where the ball will be over the next moments, bounces included (cars
    // ignored), in steps of 1/30 s.
    function ballPath(seconds) {
        const step = 1 / 30;
        const drag = Math.exp(-0.75 * step);
        const path = [];
        let { x, y, vx, vy } = ball;
        for (let t = step; t <= seconds; t += step) {
            x += vx * step;
            y += vy * step;
            vx *= drag;
            vy *= drag;
            if (y < FIELD.top + BALL_R) {
                y = FIELD.top + BALL_R;
                vy = Math.abs(vy) * 0.8;
            } else if (y > FIELD.bottom - BALL_R) {
                y = FIELD.bottom - BALL_R;
                vy = -Math.abs(vy) * 0.8;
            }
            if (y < MOUTH.top || y > MOUTH.bottom) {
                if (x < FIELD.left + BALL_R) {
                    x = FIELD.left + BALL_R;
                    vx = Math.abs(vx) * 0.8;
                } else if (x > FIELD.right - BALL_R) {
                    x = FIELD.right - BALL_R;
                    vx = -Math.abs(vx) * 0.8;
                }
            }
            path.push({ t, x, y });
        }
        return path;
    }

    // The first point on the ball's path that this car can reach in time.
    function intercept(car, power, path) {
        const vmax = 470 * power * 0.85;
        for (const point of path) {
            const dx = point.x - car.x;
            const dy = point.y - car.y;
            const turn = Math.abs(wrapAngle(Math.atan2(dy, dx) - car.angle));
            if (Math.hypot(dx, dy) / vmax + turn * 0.18 <= point.t) return point;
        }
        return path[path.length - 1];
    }

    // Moving somewhere other than the ball (back to defend, into goal): if
    // the straight line runs through the ball, go round it instead of
    // knocking it, which used to send it into the bot's own goal.
    function aroundBall(target) {
        if (target.attack) return target;
        const tx = target.x - bot.x;
        const ty = target.y - bot.y;
        const length = Math.hypot(tx, ty) || 1;
        const t = ((ball.x - bot.x) * tx + (ball.y - bot.y) * ty) / (length * length);
        if (t <= 0 || t >= 1) return target;
        const cx = bot.x + tx * t;
        const cy = bot.y + ty * t;
        let ox = cx - ball.x;
        let oy = cy - ball.y;
        let gap = Math.hypot(ox, oy);
        if (gap > BALL_R + CAR.hy + 10) return target;
        if (gap < 1) {
            ox = -ty / length;
            oy = tx / length;
            if (ball.y + oy * 48 < FIELD.top + 18 || ball.y + oy * 48 > FIELD.bottom - 18) {
                ox = -ox;
                oy = -oy;
            }
            gap = 1;
        }
        return {
            x: clamp(ball.x + (ox / gap) * 48, FIELD.left + 18, FIELD.right - 18),
            y: clamp(ball.y + (oy / gap) * 48, FIELD.top + 18, FIELD.bottom - 18),
            attack: false,
        };
    }

    function botTarget(skill) {
        return aroundBall(chooseTarget(skill));
    }

    function chooseTarget(skill) {
        const bx = clamp(ball.x + ball.vx * skill.lead, FIELD.left + BALL_R, FIELD.right - BALL_R);
        const by = clamp(ball.y + ball.vy * skill.lead, FIELD.top + BALL_R, FIELD.bottom - BALL_R);
        // The boss reads who will reach the ball first (chasing the predicted
        // point itself played worse in testing, so it only informs keeping).
        let playerFirst = false;
        if (skill.boss) {
            const path = ballPath(1.6);
            playerFirst = intercept(player, 1, path).t + 0.08 < intercept(bot, skill.power, path).t;
        }
        const goal = openShot(bx, by, skill);
        const toGoal = Math.hypot(goal.x - bx, goal.y - by) || 1;
        const ux = (goal.x - bx) / toGoal;
        const uy = (goal.y - by) / toGoal;
        const dx = bx - bot.x;
        const dy = by - bot.y;
        const dist = Math.hypot(dx, dy) || 1;
        // 1 when the bot, the ball and the goal it attacks are in a line.
        const lined = (dx * ux + dy * uy) / dist;
        const noise = () => (Math.random() - 0.5) * skill.noise;
        const inField = (x, y, attack) => ({
            x: clamp(x, FIELD.left + 18, FIELD.right - 18),
            y: clamp(y, FIELD.top + 18, FIELD.bottom - 18),
            attack,
        });

        // Kickoff, until the ball is first touched. Any charge at the ball
        // can be met head-on: a rushing player stalls both cars (9 of Nihar's
        // 11 goals in one test), and a waiting player lets the boss hit the
        // ball into them and fires the rebound past it (the 14-0 games). So
        // the boss holds goal-side for as long as the ball sits on the spot,
        // and whatever the player sends comes straight at it.
        if (skill.boss && Math.hypot(ball.vx, ball.vy) < 20 && Math.hypot(ball.x - W / 2, ball.y - H / 2) < 4) {
            return inField(W / 2 + 95, H / 2, false);
        }

        // Roughly behind the ball: drive at the side of it facing away from
        // the goal, so the touch sends it goalward. The better the bot, the
        // straighter it has to be lined up before it commits.
        if (lined > skill.lineUp && dist < 200) {
            // The boss will not hit the ball at full speed into a player who
            // is right in front of it on its line: the ball would rebound
            // straight past. If they are about to hit it, it drops goal-side;
            // otherwise it comes in gently and pushes the ball round them.
            if (skill.boss) {
                const px = player.x - bx;
                const py = player.y - by;
                const ahead = px * ux + py * uy;
                const across = -px * uy + py * ux;
                if (ahead > 0 && ahead < 130 && Math.abs(across) < 34) {
                    const toBall = (bx - player.x) * Math.cos(player.angle) + (by - player.y) * Math.sin(player.angle);
                    if (toBall > 0 && player.speed > 120) {
                        const gx = FIELD.right + 4 - bx;
                        const gy = H / 2 - by;
                        const span = Math.hypot(gx, gy) || 1;
                        return inField(bx + (gx / span) * 70, by + (gy / span) * 70, false);
                    }
                    const side = across >= 0 ? -1 : 1;
                    const target = inField(bx - ux * BALL_R - uy * side * 9, by - uy * BALL_R + ux * side * 9, true);
                    target.soft = true;
                    return target;
                }
            }
            return inField(bx - ux * BALL_R + noise() * 0.3, by - uy * BALL_R + noise() * 0.3, true);
        }

        // The boss keeps goal whenever the player will reach the ball first in
        // its half. Like a keeper coming off the line, it stands on the line
        // from the ball to the middle of its goal, part of the way out, which
        // narrows the angle far more than parking on the goal line.
        if (skill.boss && playerFirst && bx > W * skill.keepZone) {
            const gx = FIELD.right + 4;
            const gy = H / 2;
            const span = Math.hypot(bx - gx, by - gy) || 1;
            const out = clamp(span * skill.keepOut, 26, 150);
            return inField(gx + ((bx - gx) / span) * out, gy + ((by - gy) / span) * out, false);
        }

        // Goalkeeping: the ball is near the bot's goal and the player will
        // reach it first, so stand between the ball and the goal.
        if (skill.keeps && bx > W * 0.6) {
            const playerGap = Math.hypot(ball.x - player.x, ball.y - player.y);
            if (playerGap < dist - 10) {
                const gx = FIELD.right;
                const gy = H / 2;
                const span = Math.hypot(bx - gx, by - gy) || 1;
                const reach = Math.min(60, span * 0.5);
                return inField(gx + ((bx - gx) / span) * reach, gy + ((by - gy) / span) * reach, false);
            }
        }

        // Beaten (the ball is between the bot and its own goal): get back
        // goal-side, going round the ball rather than through it.
        if (skill.defends && bx > bot.x + 15 && bx > W * 0.45) {
            // Deep in its own third, get between the ball and the goal rather
            // than tucking in beside the ball against the end wall.
            if (bx > W * 0.7) {
                const gx = FIELD.right + 4;
                const span = Math.hypot(bx - gx, by - H / 2) || 1;
                const out = clamp(span * 0.4, 26, 90);
                return inField(gx + ((bx - gx) / span) * out, H / 2 + ((by - H / 2) / span) * out, false);
            }
            let y = by + (H / 2 - by) * 0.3;
            if (Math.abs(bot.y - by) < 40) y = bot.y < by ? by - 55 : by + 55;
            return inField(Math.min(FIELD.right - 24, bx + 70), y, false);
        }

        // Otherwise line up from behind, from further back when far away.
        const back = clamp(dist * 0.5, 28, 90);
        let x = bx - ux * back;
        let y = by - uy * back;
        // Against a wall the spot behind the ball is off the pitch: come
        // along the wall from the side away from the goal instead.
        if (y < FIELD.top + 18 || y > FIELD.bottom - 18) {
            x = bx + 45;
            y = by + (by < H / 2 ? 18 : -18);
        }
        if (lined < -0.3 && Math.abs(-dx * uy + dy * ux) < 40) {
            x += -uy * 55 * (bot.y < by ? 1 : -1);
            y += ux * 55 * (bot.y < by ? 1 : -1);
        }
        return inField(x + noise(), y + noise(), false);
    }

    // Steering flips meaning when the car rolls backwards: then it is the
    // rear that should swing toward the target.
    function steerFor(aim, skill) {
        if (bot.speed >= 0) return aim.steer;
        return clamp(-wrapAngle(aim.diff - Math.PI) * skill.steer, -1, 1);
    }

    function botInput(now) {
        if (mode !== "match" || freezeUntil) return { throttle: 0, steer: 0, boost: false };
        const skill = LEVELS[level];
        bot.power = skill.power;
        bot.turn = skill.turn || 1;
        // A beat to react at each kickoff, like a person would, so a faster
        // bot cannot simply win every restart.
        if (bot.fresh) {
            bot.fresh = false;
            bot.holdUntil = now + skill.react;
        }
        if (now < bot.holdUntil) return { throttle: 0, steer: 0, boost: false };
        if (now >= bot.nextThink || !bot.target) {
            bot.target = botTarget(skill);
            bot.nextThink = now + skill.think;
        }
        const aim = steerTo(bot, bot.target.x, bot.target.y, skill.steer);
        // Pinned against a wall or the other car while still trying to get
        // somewhere: back off for a moment, then try again. Standing still on
        // purpose (in goal, say) is not being stuck.
        const pad = 16;
        const atWall = bot.x < FIELD.left + pad || bot.x > FIELD.right - pad || bot.y < FIELD.top + pad || bot.y > FIELD.bottom - pad;
        const pinned = atWall || Math.hypot(bot.x - player.x, bot.y - player.y) < CAR.hx + CAR.hy + 2;
        if (Math.abs(bot.speed) < 15 && aim.distance > 30 && pinned) {
            if (!bot.stuckSince) bot.stuckSince = now;
            // The boss backs out of a pin almost at once.
            if (now - bot.stuckSince > (skill.unpin || 450)) {
                bot.reverseUntil = now + 350;
                bot.stuckSince = 0;
                // Back away from whatever is pinning it: reverse if it is in
                // front, drive forward if it is behind (reversing into the
                // other car just jams them both).
                let block = { x: player.x, y: player.y };
                if (Math.hypot(bot.x - player.x, bot.y - player.y) >= CAR.hx + CAR.hy + 2) {
                    const walls = [
                        { x: FIELD.left, y: bot.y, gap: bot.x - FIELD.left },
                        { x: FIELD.right, y: bot.y, gap: FIELD.right - bot.x },
                        { x: bot.x, y: FIELD.top, gap: bot.y - FIELD.top },
                        { x: bot.x, y: FIELD.bottom, gap: FIELD.bottom - bot.y },
                    ];
                    block = walls.reduce((nearest, wall) => (wall.gap < nearest.gap ? wall : nearest));
                }
                const ahead = (block.x - bot.x) * Math.cos(bot.angle) + (block.y - bot.y) * Math.sin(bot.angle);
                bot.escapeThrottle = ahead > 0 ? -1 : 1;
            }
        } else {
            bot.stuckSince = 0;
        }
        if (now < bot.reverseUntil) return { throttle: bot.escapeThrottle || -1, steer: smoothSteer(steerFor(aim, skill), aim), boost: false };
        const turn = Math.abs(aim.diff);
        const speed = Math.abs(bot.speed);
        let throttle;
        // Only back up for a target that is close behind. Reversing barely
        // changes the car's heading, so for anything further away it would
        // keep the target behind it and drive backwards across the pitch:
        // turn round instead, easing off so the turn is tight.
        if (turn > 2.4 && aim.distance < 45) throttle = -0.6;
        else if (skill.boss) {
            // The boss's sharper handling pays off with finer throttle control:
            // ease into turns, and hold its spot on arrival instead of circling.
            if (turn > 1.2) throttle = turn > 1.8 && speed > 220 ? -0.3 : 0.45;
            else if (bot.target.attack) throttle = bot.target.soft ? 0.55 : 1;
            else if (turn > 0.8) throttle = speed > 230 ? 0 : 0.7;
            else if (aim.distance < 14) throttle = 0;
            else throttle = aim.distance < 40 ? 0.5 : 1;
        } else if (bot.target.attack) throttle = 1;
        else if (turn > 1) throttle = 0.35;
        else throttle = aim.distance < 40 ? 0.5 : 1;
        // Players can hold boost the whole game; the hard bot does the same
        // whenever it is heading roughly where it wants to go.
        const lined = turn < (skill.chaseBoost ? 0.5 : 0.25);
        const wantsBoost = bot.target.attack ? aim.distance > 50 : skill.chaseBoost && aim.distance > 60;
        const boost = throttle > 0 && lined && wantsBoost && !bot.target.soft && Math.random() < skill.boost;
        return { throttle, steer: smoothSteer(steerFor(aim, skill), aim), boost };
    }

    // Ease the wheel toward the wanted angle and leave it straight right next
    // to the target, so the bot does not flick left-right-left on the spot.
    function smoothSteer(wanted, aim) {
        const goal = aim.distance < 18 ? 0 : wanted;
        bot.steerOut = (bot.steerOut || 0) + (goal - (bot.steerOut || 0)) * 0.4;
        return bot.steerOut;
    }

    function updateCar(car, dt, input, effects = true) {
        const top = (input.boost ? 470 : 300) * car.power;
        const accel = (input.boost ? 900 : 560) * car.power;
        const braking = input.throttle * car.speed < 0;
        car.speed += input.throttle * (braking ? 1100 : accel) * dt;
        car.speed -= car.speed * (input.throttle === 0 ? 2.4 : 0.5) * dt;
        if (car.speed > top) car.speed -= (car.speed - top) * 4 * dt;
        car.speed = clamp(car.speed, -170, 520);

        const grip = clamp(Math.abs(car.speed) / 90, 0, 1);
        car.angle += input.steer * 3.4 * (car.turn || 1) * grip * Math.sign(car.speed) * dt;
        car.x += Math.cos(car.angle) * car.speed * dt;
        car.y += Math.sin(car.angle) * car.speed * dt;

        // Walls: a head-on hit bounces the car back; a glancing one lets it
        // slide along the wall (the clamp removes the push into the wall)
        // with a little scrub, instead of stopping it dead.
        const pad = 13;
        const wall = (headOn) => {
            if (headOn > 0.92) car.speed *= -0.35;
            else car.speed *= 1 - headOn * 3 * dt;
        };
        if (car.x < FIELD.left + pad || car.x > FIELD.right - pad) {
            car.x = clamp(car.x, FIELD.left + pad, FIELD.right - pad);
            wall(Math.abs(Math.cos(car.angle)));
        }
        if (car.y < FIELD.top + pad || car.y > FIELD.bottom - pad) {
            car.y = clamp(car.y, FIELD.top + pad, FIELD.bottom - pad);
            wall(Math.abs(Math.sin(car.angle)));
        }

        if (!effects) return;

        if (Math.abs(car.speed) > 40) {
            const c = Math.cos(car.angle);
            const s = Math.sin(car.angle);
            [-1, 1].forEach((side) => {
                trail.push({ x: car.x - c * 11 - s * 8 * side, y: car.y - s * 11 + c * 8 * side, born: last });
            });
            if (trail.length > 600) trail.splice(0, trail.length - 600);
        }

        if (input.boost) {
            for (let i = 0; i < 2; i++) {
                sparks.push({
                    x: car.x - Math.cos(car.angle) * 18,
                    y: car.y - Math.sin(car.angle) * 18,
                    vx: -Math.cos(car.angle) * 140 + (Math.random() - 0.5) * 60,
                    vy: -Math.sin(car.angle) * 140 + (Math.random() - 0.5) * 60,
                    life: 0.35,
                    max: 0.35,
                });
            }
        }
    }

    function collide(car) {
        const c = Math.cos(car.angle);
        const s = Math.sin(car.angle);
        const rx = ball.x - car.x;
        const ry = ball.y - car.y;
        const lx = rx * c + ry * s;
        const ly = -rx * s + ry * c;
        const qx = clamp(lx, -CAR.hx, CAR.hx);
        const qy = clamp(ly, -CAR.hy, CAR.hy);
        const dist = Math.hypot(lx - qx, ly - qy);
        if (dist >= BALL_R) return;
        let nlx;
        let nly;
        let overlap;
        if (dist === 0) {
            // The ball's centre is inside the car: push it out the nearest side.
            const inX = CAR.hx - Math.abs(lx);
            const inY = CAR.hy - Math.abs(ly);
            if (inY < inX) {
                nlx = 0;
                nly = Math.sign(ly) || 1;
                overlap = inY + BALL_R;
            } else {
                nlx = Math.sign(lx) || 1;
                nly = 0;
                overlap = inX + BALL_R;
            }
        } else {
            nlx = (lx - qx) / dist;
            nly = (ly - qy) / dist;
            overlap = BALL_R - dist;
        }
        const nx = nlx * c - nly * s;
        const ny = nlx * s + nly * c;
        ball.x += nx * overlap;
        ball.y += ny * overlap;

        const cvx = c * car.speed;
        const cvy = s * car.speed;
        const rel = (ball.vx - cvx) * nx + (ball.vy - cvy) * ny;
        if (rel < 0) {
            // The boss hits the ball harder than anyone else.
            const punch = car === bot && !net.link ? LEVELS[level].shot || 1 : 1;
            const impulse = (-1.6 * rel + 40) * punch;
            ball.vx += nx * impulse;
            ball.vy += ny * impulse;
            car.speed *= 0.9;
        }
        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed > 900) {
            ball.vx *= 900 / speed;
            ball.vy *= 900 / speed;
        }
    }

    // Cars bump each other apart like two discs.
    function bumpCars() {
        const dx = bot.x - player.x;
        const dy = bot.y - player.y;
        const dist = Math.hypot(dx, dy);
        const reach = CAR.hx + CAR.hy;
        if (!dist || dist >= reach) return;
        const push = (reach - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        player.x -= nx * push;
        player.y -= ny * push;
        bot.x += nx * push;
        bot.y += ny * push;
        player.speed *= 0.6;
        bot.speed *= 0.6;
    }

    function updateBall(dt, now) {
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        const drag = Math.exp(-0.75 * dt);
        ball.vx *= drag;
        ball.vy *= drag;
        ball.spin += (Math.hypot(ball.vx, ball.vy) / BALL_R) * dt;

        if (ball.y - BALL_R < FIELD.top) {
            ball.y = FIELD.top + BALL_R;
            ball.vy = Math.abs(ball.vy) * 0.8;
        }
        if (ball.y + BALL_R > FIELD.bottom) {
            ball.y = FIELD.bottom - BALL_R;
            ball.vy = -Math.abs(ball.vy) * 0.8;
        }

        const inMouth = ball.y > MOUTH.top && ball.y < MOUTH.bottom;
        const pastLine = ball.x < FIELD.left || ball.x > FIELD.right;
        // The ball is only in the net if it crossed the line between the
        // posts. Shoved past the end line in a corner (a car pinning it
        // there), it bounces back instead of snapping into the goal.
        if (!pastLine) ball.inNet = false;
        else if (!ball.inNet) {
            if (inMouth) {
                ball.inNet = true;
            } else if (ball.x < FIELD.left) {
                ball.x = FIELD.left + BALL_R;
                ball.vx = Math.abs(ball.vx) * 0.8;
            } else {
                ball.x = FIELD.right - BALL_R;
                ball.vx = -Math.abs(ball.vx) * 0.8;
            }
        }

        if (ball.inNet) {
            if (ball.y - BALL_R < MOUTH.top) {
                ball.y = MOUTH.top + BALL_R;
                ball.vy = Math.abs(ball.vy) * 0.4;
            }
            if (ball.y + BALL_R > MOUTH.bottom) {
                ball.y = MOUTH.bottom - BALL_R;
                ball.vy = -Math.abs(ball.vy) * 0.4;
            }
            if (ball.x - BALL_R < FIELD.left - GOAL_DEPTH) {
                ball.x = FIELD.left - GOAL_DEPTH + BALL_R;
                ball.vx = Math.abs(ball.vx) * 0.25;
            }
            if (ball.x + BALL_R > FIELD.right + GOAL_DEPTH) {
                ball.x = FIELD.right + GOAL_DEPTH - BALL_R;
                ball.vx = -Math.abs(ball.vx) * 0.25;
            }
        } else if (!inMouth) {
            if (ball.x - BALL_R < FIELD.left) {
                ball.x = FIELD.left + BALL_R;
                ball.vx = Math.abs(ball.vx) * 0.8;
            }
            if (ball.x + BALL_R > FIELD.right) {
                ball.x = FIELD.right - BALL_R;
                ball.vx = -Math.abs(ball.vx) * 0.8;
            }
        }

        if (freezeUntil) return;
        if (ball.x - BALL_R > FIELD.right) scored(true, now);
        else if (ball.x + BALL_R < FIELD.left) scored(false, now);
    }

    function celebrate() {
        const mouthX = FIELD.right + GOAL_DEPTH / 2;
        const colors = [COLORS[carColor].fill, "#e5cb78", "#8fd99a", "#b7ecff", INK];
        for (let i = 0; i < 60; i++) {
            const angle = Math.PI + (Math.random() - 0.5) * 2.4;
            const speed = 120 + Math.random() * 260;
            sparks.push({
                x: mouthX,
                y: H / 2 + (Math.random() - 0.5) * (MOUTH.bottom - MOUTH.top),
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.9 + Math.random() * 0.6,
                max: 1.5,
                color: colors[i % colors.length],
            });
        }
        stage.classList.remove("is-shaking");
        void stage.offsetWidth;
        stage.classList.add("is-shaking");
    }

    function scored(forUs, now) {
        // Online, only the host decides goals; the guest's ball is a forecast.
        if (net.role === "guest") return;
        freezeUntil = now + 1500;
        if (mode === "over" || mode === "count" || mode === "idle") return;
        if (forUs) score.you += 1;
        else score.them += 1;
        renderScore();
        if (forUs && motionOn()) celebrate();
        sound(forUs ? "goal" : "stamp");
        if (net.link) net.link.send({ t: "goal", host: forUs });
        stamp.textContent = net.link ? (forUs ? "Goal!" : "Friend scored") : forUs ? "Goal!" : mode !== "match" ? "Own goal" : boss() ? "Nihar scored" : "Bot scores";
        stamp.classList.remove("is-on");
        void stamp.offsetWidth;
        stamp.classList.add("is-on");
        if (mode === "match") track(forUs ? "pitch-goal" : "pitch-bot-goal", forUs ? "Scored against the bot" : "The bot scored");
        else track(forUs ? "pitch-goal" : "pitch-own-goal", forUs ? "Scored in free play" : "Own goal in free play");
    }

    function drawField() {
        ctx.fillStyle = PAPER;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "rgba(27, 24, 18, 0.03)";
        for (let x = FIELD.left; x < FIELD.right; x += 80) {
            ctx.fillRect(x, FIELD.top, 40, FIELD.bottom - FIELD.top);
        }

        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(27, 24, 18, 0.42)";
        ctx.strokeRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);
        ctx.beginPath();
        ctx.moveTo(W / 2, FIELD.top);
        ctx.lineTo(W / 2, FIELD.bottom);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, 46, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(27, 24, 18, 0.42)";
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, 3, 0, Math.PI * 2);
        ctx.fill();

        [FIELD.left, FIELD.right].forEach((lineX) => {
            const dir = lineX === FIELD.left ? 1 : -1;
            ctx.strokeRect(Math.min(lineX, lineX + dir * 86), H / 2 - 88, 86, 176);
            ctx.strokeRect(Math.min(lineX, lineX + dir * 34), H / 2 - 44, 34, 88);
            ctx.beginPath();
            ctx.arc(lineX + dir * 64, H / 2, 2.5, 0, Math.PI * 2);
            ctx.fill();
        });

        drawGoal(FIELD.left - GOAL_DEPTH, "rgba(27, 24, 18, 0.55)");
        drawGoal(FIELD.right, ACCENT);
    }

    function drawGoal(x, color) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let gx = x + 6; gx < x + GOAL_DEPTH; gx += 6) {
            ctx.moveTo(gx, MOUTH.top);
            ctx.lineTo(gx, MOUTH.bottom);
        }
        for (let gy = MOUTH.top + 6; gy < MOUTH.bottom; gy += 6) {
            ctx.moveTo(x, gy);
            ctx.lineTo(x + GOAL_DEPTH, gy);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x, MOUTH.top, GOAL_DEPTH, MOUTH.bottom - MOUTH.top);
        ctx.restore();
    }

    function drawTrail(now) {
        ctx.fillStyle = INK;
        for (let i = trail.length - 1; i >= 0; i--) {
            const age = (now - trail[i].born) / 2600;
            if (age >= 1) {
                trail.splice(0, i + 1);
                break;
            }
            ctx.globalAlpha = 0.13 * (1 - age);
            ctx.fillRect(trail[i].x - 1.5, trail[i].y - 1.5, 3, 3);
        }
        ctx.globalAlpha = 1;
    }

    function drawSparks(dt) {
        for (let i = sparks.length - 1; i >= 0; i--) {
            const spark = sparks[i];
            spark.life -= dt;
            if (spark.life <= 0) {
                sparks.splice(i, 1);
                continue;
            }
            spark.x += spark.vx * dt;
            spark.y += spark.vy * dt;
            const t = spark.life / spark.max;
            ctx.globalAlpha = Math.min(1, t * 1.5);
            ctx.fillStyle = spark.color || (t > 0.55 ? "#e5cb78" : ACCENT);
            ctx.beginPath();
            ctx.arc(spark.x, spark.y, 2 + 3 * t, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
        else ctx.rect(x, y, w, h);
    }

    function drawBall() {
        ctx.fillStyle = "rgba(27, 24, 18, 0.15)";
        ctx.beginPath();
        ctx.arc(ball.x + 3, ball.y + 3, BALL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fffdf6";
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.save();
        ctx.translate(ball.x, ball.y);
        ctx.rotate(ball.spin);
        ctx.fillStyle = INK;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            ctx.lineTo(Math.cos(a) * 4.5, Math.sin(a) * 4.5);
        }
        ctx.fill();
        ctx.restore();
    }

    function drawCar(car, fill) {
        ctx.save();
        ctx.translate(car.x, car.y);
        ctx.rotate(car.angle);
        ctx.fillStyle = "rgba(27, 24, 18, 0.15)";
        roundRect(-CAR.hx + 3, -CAR.hy + 3, CAR.hx * 2, CAR.hy * 2, 4);
        ctx.fill();
        ctx.fillStyle = INK;
        [[-10, -11], [-10, 7], [6, -11], [6, 7]].forEach(([x, y]) => ctx.fillRect(x, y, 9, 4));
        ctx.fillStyle = fill;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        roundRect(-CAR.hx, -CAR.hy, CAR.hx * 2, CAR.hy * 2, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = PAPER;
        roundRect(1, -6, 8, 12, 2);
        ctx.fill();
        ctx.fillRect(-12, -1, 11, 2);
        ctx.fillStyle = INK;
        ctx.fillRect(-CAR.hx - 1, -CAR.hy - 1, 3, CAR.hy * 2 + 2);
        ctx.restore();
    }

    function draw(now, dt = 0) {
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        drawField();
        drawTrail(now);
        drawSparks(dt);
        drawBall();
        if (net.link) {
            const mine = COLORS[carColor].fill;
            const theirs = (COLORS[net.peerColor] || COLORS.blue).fill;
            const guest = net.role === "guest";
            drawCar(bot, guest ? mine : theirs);
            drawCar(player, guest ? theirs : mine);
            drawNameplate(guest ? player : bot, "FRIEND");
            return;
        }
        if (versusBot()) {
            drawCar(bot, boss() ? BOSS_FILL : BOT_FILL);
            if (boss()) drawNameplate(bot, "NIHAR");
        }
        drawCar(player, COLORS[carColor].fill);
    }

    function drawNameplate(car, text) {
        ctx.save();
        ctx.font = `700 10px ${getComputedStyle(canvas).fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        const width = ctx.measureText(text).width + 8;
        const y = Math.max(FIELD.top + 12, car.y - 18);
        ctx.fillStyle = "rgba(27, 24, 18, 0.82)";
        roundRect(car.x - width / 2, y - 12, width, 13, 3);
        ctx.fill();
        ctx.fillStyle = net.link ? "#ffffff" : BOSS_FILL;
        ctx.fillText(text, car.x, y);
        ctx.restore();
    }

    function busy(input) {
        return mode === "match" || (net.link && mode === "count") || pointer.active || input.throttle !== 0 || Math.abs(player.speed) > 2 ||
            Math.hypot(ball.vx, ball.vy) > 2 || sparks.length > 0 || trail.length > 0 || freezeUntil > 0;
    }

    function frame(now) {
        const dt = Math.min(0.033, (now - last) / 1000);
        last = now;
        if (net.link && net.role === "guest") {
            guestFrame(now, dt);
            return;
        }
        const input = playerInput();
        const botMove = mode !== "match" ? null : net.link ? REMOTE_CAR : botInput(now);
        if (botMove === REMOTE_CAR) placeRemoteCar(now);
        // The car is thinner than the ball is wide, so a fast car and a fast
        // ball can cross the car's middle in one frame and the ball pops out
        // the far side. Small steps keep each move to a few pixels.
        const closing = Math.abs(player.speed) + (botMove ? Math.abs(bot.speed) : 0) + Math.hypot(ball.vx, ball.vy);
        const steps = Math.min(10, Math.max(1, Math.ceil((closing * dt) / 5)));
        const h = dt / steps;
        for (let i = 0; i < steps; i++) {
            const effects = i === steps - 1;
            updateCar(player, h, input, effects);
            if (botMove && botMove !== REMOTE_CAR) updateCar(bot, h, botMove, effects);
            updateBall(h, now);
            // Toss a coin for who touches first so neither car always wins a 50-50.
            if (botMove && Math.random() < 0.5) {
                collide(bot);
                collide(player);
            } else {
                collide(player);
                if (botMove) collide(bot);
            }
            if (botMove) bumpCars();
        }
        if (recording && mode === "match" && (recording.tick = (recording.tick || 0) + 1) % 2 === 0) {
            const r = (value) => Math.round(value * 10) / 10;
            recording.frames.push([
                Math.round(now - (matchEnd - MATCH_MS)),
                r(player.x), r(player.y), Math.round(player.angle * 1000) / 1000, r(player.speed),
                r(bot.x), r(bot.y), Math.round(bot.angle * 1000) / 1000, r(bot.speed),
                r(ball.x), r(ball.y), r(ball.vx), r(ball.vy),
                Math.round(input.throttle * 100) / 100, Math.round(input.steer * 100) / 100, input.boost ? 1 : 0,
                freezeUntil ? 1 : 0,
            ]);
        }
        if (freezeUntil && now > freezeUntil) {
            freezeUntil = 0;
            kickoff();
            if (net.link) {
                // Restart both screens together; positions sent before this
                // kickoff are ignored by their number.
                net.kickNo += 1;
                net.remoteCar = null;
                net.link.send({ t: "kick", k: net.kickNo });
            }
        }
        if (net.link && mode === "match" && now - net.lastSnap > SNAP_MS) {
            net.lastSnap = now;
            net.link.send(snapshot(matchEnd - now));
        }
        if (mode === "match") {
            const left = matchEnd - now;
            const seconds = Math.ceil(left / 1000);
            if (seconds !== shownSeconds) {
                shownSeconds = seconds;
                root.querySelector('[data-score="clock"]').textContent = formatClock(left);
                clock.classList.toggle("is-low", seconds <= 10);
                if (seconds <= 5 && seconds > 0) sound("tick");
            }
            if (left <= 0) endMatch();
        }
        draw(now, dt);
        if (visible && busy(input)) {
            requestAnimationFrame(frame);
        } else {
            running = false;
        }
    }

    function wake() {
        if (running || !visible) return;
        running = true;
        last = performance.now();
        requestAnimationFrame(frame);
    }

    function start() {
        if (started) return;
        started = true;
        track("pitch-start", "Started the contact pitch game");
    }

    const KEYMAP = {
        ArrowUp: "up", KeyW: "up",
        ArrowDown: "down", KeyS: "down",
        ArrowLeft: "left", KeyA: "left",
        ArrowRight: "right", KeyD: "right",
        Space: "boost", ShiftLeft: "boost", ShiftRight: "boost",
    };

    canvas.addEventListener("keydown", (event) => {
        if (event.code === "KeyR" && mode === "free") {
            freezeUntil = 0;
            kickoff();
            wake();
            draw(performance.now());
            return;
        }
        const action = KEYMAP[event.code];
        if (!action) return;
        event.preventDefault();
        start();
        keys.add(action);
        wake();
    });

    canvas.addEventListener("keyup", (event) => {
        const action = KEYMAP[event.code];
        if (action) keys.delete(action);
    });

    canvas.addEventListener("blur", () => keys.clear());

    function toField(event) {
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * W;
        pointer.y = ((event.clientY - rect.top) / rect.height) * H;
    }

    canvas.addEventListener("pointerdown", (event) => {
        canvas.focus({ preventScroll: true });
        canvas.setPointerCapture(event.pointerId);
        pointer.active = true;
        toField(event);
        start();
        wake();
    });

    canvas.addEventListener("pointermove", (event) => {
        if (pointer.active) toField(event);
    });

    ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => {
        canvas.addEventListener(type, () => {
            pointer.active = false;
        });
    });

    setGeometry(640, 360);
    kickoff();
    resize();
    idle();

    // Opened from a friend's room link.
    const roomParam = new URLSearchParams(location.search).get("room");
    if (roomParam && window.KickoffNet) {
        const code = window.KickoffNet.cleanCode(roomParam);
        if (code.length === 4) openRoom(code, "guest");
    }

    if ("ResizeObserver" in window) {
        new ResizeObserver(resize).observe(canvas);
    }

    if ("IntersectionObserver" in window) {
        new IntersectionObserver((entries) => {
            visible = entries[0].isIntersecting;
            if (visible) wake();
        }).observe(canvas);
    } else {
        visible = true;
    }
})();
