/* Five-a-side: keyboard input, the camera and the canvas drawing. The game
   itself lives in match-sim.js; this file only feeds it keys and draws it. */
(function () {
    "use strict";

    const Sim = window.MatchSim;
    const root = document.getElementById("match");
    if (!Sim || !root) return;

    const canvas = root.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const overlay = root.querySelector("[data-overlay]");
    const playBtn = root.querySelector("[data-play]");
    const { L, W, GOAL_W, GOAL_D, BOX_D, BOX_W, TEAMS } = Sim;

    // Visible width of pitch in metres; height follows from 16:9.
    const VIEW = 34;
    // Players and ball are drawn larger than life so they read at laptop size.
    const BIG = 1.4;

    const KEYS = {
        KeyW: "up", ArrowUp: "up",
        KeyS: "down", ArrowDown: "down",
        KeyA: "left", ArrowLeft: "left",
        KeyD: "right", ArrowRight: "right",
        ShiftLeft: "sprint", ShiftRight: "sprint",
        KeyJ: "pass", Space: "pass",
        KeyK: "shoot", KeyX: "shoot",
        KeyL: "lob", KeyC: "lob",
        KeyQ: "swap", KeyH: "swap", Tab: "swap",
        KeyE: "tackle", KeyZ: "tackle",
    };

    // Rivals level and half length, remembered between visits.
    const SETUP_KEY = "nbs-five-setup";
    const setup = { level: "normal", half: 180 };
    try {
        Object.assign(setup, JSON.parse(localStorage.getItem(SETUP_KEY)) || {});
    } catch (error) {
        /* Private mode: defaults. */
    }

    const newMatch = () => Sim.create((Math.random() * 1e9) | 0, setup);
    let s = newMatch();
    let held = {};
    let playing = false;
    // What the overlay is showing: "start", "pause", "halftime" or "full".
    let mode = "start";
    let last = 0;
    let acc = 0;
    const cam = { x: L / 2, y: W / 2, view: VIEW };
    const legs = {};

    /* ---------- Input ---------- */

    window.addEventListener("keydown", (e) => {
        if (e.code === "KeyM") return toggleSound();
        if (e.code === "Enter" && !playing) {
            e.preventDefault();
            if (!overlay.hidden) play();
            return;
        }
        if (!playing) return;
        if (e.code === "Escape" || e.code === "KeyP") return pause();
        if (e.code === "KeyR") return restart();
        const act = KEYS[e.code];
        if (!act) return;
        e.preventDefault();
        held[act] = true;
    });

    window.addEventListener("keyup", (e) => {
        const act = KEYS[e.code];
        if (act) held[act] = false;
    });

    // A key released while the tab is in the background would stay held.
    window.addEventListener("blur", () => {
        held = {};
        if (playing) pause();
    });

    playBtn.addEventListener("click", play);
    canvas.addEventListener("click", () => {
        if (!playing && !overlay.hidden) play();
    });

    for (const btn of root.querySelectorAll("[data-level], [data-half]")) {
        btn.addEventListener("click", () => {
            if (btn.dataset.level) setup.level = btn.dataset.level;
            else setup.half = +btn.dataset.half;
            try {
                localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
            } catch (error) {
                /* Not remembered. */
            }
            // Before kick-off the new settings apply to this match straight away.
            if (mode === "start") s = newMatch();
            renderSetup();
        });
    }

    function renderSetup() {
        for (const btn of root.querySelectorAll("[data-level]")) btn.setAttribute("aria-checked", String(btn.dataset.level === setup.level));
        for (const btn of root.querySelectorAll("[data-half]")) btn.setAttribute("aria-checked", String(+btn.dataset.half === setup.half));
    }

    function play() {
        if (mode === "halftime") Sim.secondHalf(s);
        if (mode === "full") {
            s = newMatch();
            matchId = Date.now();
        }
        if (mode !== "pause") whistle(mode === "halftime" || mode === "full" || mode === "start" ? 1 : 0);
        mode = "play";
        playing = true;
        held = {};
        overlay.hidden = true;
        canvas.focus({ preventScroll: true });
        last = performance.now();
    }

    function pause() {
        if (s.phase !== "play") return;
        playing = false;
        held = {};
        show("pause");
    }

    function restart() {
        breakAt = 0;
        saveLog();
        s = newMatch();
        matchId = Date.now();
        whistle(1);
    }

    // The card over the pitch, for each break in play.
    function show(next) {
        mode = next;
        const end = mode === "halftime" || mode === "full";
        const line = `${TEAMS[0].name} ${s.score[0]} – ${s.score[1]} ${TEAMS[1].name}`;
        overlay.querySelector("[data-overlay-kicker]").textContent =
            { start: "Five against five", pause: "Paused", halftime: "Half time", full: "Full time" }[mode];
        overlay.querySelector("[data-overlay-title]").textContent = mode === "start" ? `${TEAMS[0].name} vs ${TEAMS[1].name}` : line;
        root.querySelector("[data-stats]").hidden = !end;
        if (end) root.querySelector("[data-stats]").innerHTML = statsHtml();
        root.querySelector("[data-setup]").hidden = !(mode === "start" || mode === "full");
        root.querySelector("[data-keys]").hidden = end;
        root.querySelector("[data-tip]").hidden = end;
        playBtn.firstChild.textContent = { start: "Play ", pause: "Resume ", halftime: "Second half ", full: "Play again " }[mode];
        overlay.hidden = false;
    }

    function statsHtml() {
        const [a, b] = s.stats;
        const pct = (x, y) => (x + y ? Math.round((100 * x) / (x + y)) : 50);
        const acc = (t) => (t.passes ? `${Math.round((100 * t.passesOk) / t.passes)}%` : "–");
        const rows = [
            ["Possession", `${pct(a.poss, b.poss)}%`, `${100 - pct(a.poss, b.poss)}%`, pct(a.poss, b.poss)],
            ["Shots", a.shots, b.shots],
            ["On target", a.onTarget, b.onTarget],
            ["Passes", a.passes, b.passes],
            ["Pass accuracy", acc(a), acc(b), null],
            ["Tackles won", a.tacklesWon, b.tacklesWon],
            ["Saves", a.saves, b.saves],
            ["Corners", a.corners, b.corners],
        ];
        const html = rows.map(([name, x, y, share]) => {
            const left = share === undefined ? pct(+x, +y) : share;
            const bar = left === null ? "" : `<span class="stat-bar"><i style="width:${left}%"></i><i style="width:${100 - left}%"></i></span>`;
            return `<div class="stat-row"><b>${x}</b><span class="stat-mid"><span class="stat-name">${name}</span>${bar}</span><b>${y}</b></div>`;
        });
        // Who scored, with the match minute.
        const goals = s.log.filter((e) => e.type === "goal");
        if (goals.length) {
            const list = (team) => goals.filter((g) => g.team === team).map((g) => {
                const p = s.players[g.scorer];
                const own = p && p.team !== team ? " (og)" : "";
                return `#${p ? p.num : "?"} ${g.min ? `${g.min}'` : ""}${own}`;
            }).join(", ") || "–";
            html.push(`<p class="stat-scorers">${TEAMS[0].name}: ${list(0)} &middot; ${TEAMS[1].name}: ${list(1)}</p>`);
        }
        return html.join("");
    }

    if (matchMedia("(hover: none) and (pointer: coarse)").matches) {
        root.querySelector("[data-touch]").hidden = false;
    }

    /* ---------- Loop ---------- */

    function frame(now) {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (playing) {
            acc += dt;
            while (acc >= Sim.DT && s.phase === "play") {
                Sim.step(s, held);
                react(s.events);
                if (s.log.length !== logged && performance.now() - savedAt > 3000) saveLog();
                acc -= Sim.DT;
            }
            // The whistle has gone: let the moment show, then the stats card.
            if (s.phase !== "play") {
                acc = 0;
                if (!breakAt) breakAt = now;
                if (now - breakAt > 1800) {
                    breakAt = 0;
                    playing = false;
                    held = {};
                    saveLog();
                    show(s.phase);
                }
            }
        } else {
            acc = 0;
            if (crowd) crowd.gain.value = 0;
        }
        draw(dt);
        requestAnimationFrame(frame);
    }

    /* ---------- Drawing ---------- */

    let breakAt = 0;
    let cw = 0;
    let ch = 0;
    let sc = 1;

    function resize() {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.round(canvas.clientWidth * dpr);
        const h = Math.round(canvas.clientHeight * dpr);
        if (w !== canvas.width || h !== canvas.height) {
            canvas.width = w;
            canvas.height = h;
        }
        cw = w;
        ch = h;
    }

    const X = (x) => (x - cam.x) * sc + cw / 2;
    const Y = (y) => (y - cam.y) * sc + ch / 2;

    function moveCamera(dt) {
        const b = s.ball;
        // Look a little ahead of the ball, and stay on the pitch. At a corner,
        // pull back so the flag and the box are both in shot.
        const corner = s.setPiece && s.setPiece.kind === "Corner";
        const tx = corner ? b.x * 0.4 + (b.x < L / 2 ? 8 : L - 8) * 0.6 : b.x + b.vx * 0.3;
        const ty = corner ? b.y * 0.45 + (W / 2) * 0.55 : b.y + b.vy * 0.2;
        const k = 1 - Math.exp(-dt * 4);
        cam.x += (tx - cam.x) * k;
        cam.y += (ty - cam.y) * k;
        cam.view += ((corner ? 46 : VIEW) - cam.view) * k;
        sc = cw / cam.view;
        const hw = cam.view / 2;
        const hh = (cam.view * ch) / cw / 2;
        cam.x = Math.max(hw - 4, Math.min(L + 4 - hw, cam.x));
        cam.y = Math.max(hh - 3, Math.min(W + 3 - hh, cam.y));
    }

    function draw(dt) {
        resize();
        moveCamera(dt);
        shake = Math.max(0, shake - dt);
        const jolt = shake * 22 * (cw / 960);
        ctx.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * jolt, (Math.random() - 0.5) * jolt);
        drawPitch();
        drawGoal(0);
        drawGoal(L);
        const order = s.players.slice().sort((a, b) => a.y - b.y);
        for (const p of order) drawShadow(p);
        drawBallShadow();
        for (const p of order) drawPlayer(p, dt);
        drawBall();
        drawCharge();
        drawOffscreen();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        drawConfetti(dt);
        drawHud();
        drawRadar();
        drawFlash();
    }

    // When the player you control is off-screen, an arrow on the edge points to them.
    function drawOffscreen() {
        const p = s.players[s.user];
        const x = X(p.x);
        const y = Y(p.y);
        const m = 0.9 * sc;
        if (x > m && x < cw - m && y > m && y < ch - m) return;
        const ex = Math.max(m, Math.min(cw - m, x));
        const ey = Math.max(m, Math.min(ch - m, y));
        const a = Math.atan2(y - ey, x - ex);
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(a);
        ctx.fillStyle = TEAMS[0].kit;
        ctx.beginPath();
        ctx.moveTo(0.45 * sc, 0);
        ctx.lineTo(-0.3 * sc, -0.35 * sc);
        ctx.lineTo(-0.3 * sc, 0.35 * sc);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.font = `800 ${Math.round(0.42 * sc)}px Saira, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff";
        ctx.fillText(String(p.num), ex - Math.cos(a) * 0.75 * sc, ey - Math.sin(a) * 0.75 * sc + 0.15 * sc);
    }

    function drawPitch() {
        ctx.fillStyle = "#0e4a2b";
        ctx.fillRect(0, 0, cw, ch);
        // Mown stripes.
        for (let x = -4, i = 0; x < L + 4; x += 4, i++) {
            ctx.fillStyle = i % 2 ? "#1d7a44" : "#22874c";
            ctx.fillRect(X(x), Y(-3), 4 * sc + 1, (W + 6) * sc);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = Math.max(1, 0.12 * sc);
        ctx.strokeRect(X(0), Y(0), L * sc, W * sc);
        line(L / 2, 0, L / 2, W);
        circle(L / 2, W / 2, 6, false);
        circle(L / 2, W / 2, 0.2, true);
        for (const side of [0, 1]) {
            const gx = side ? L : 0;
            const dir = side ? -1 : 1;
            ctx.strokeRect(X(Math.min(gx, gx + dir * BOX_D)), Y(W / 2 - BOX_W / 2), BOX_D * sc, BOX_W * sc);
            ctx.strokeRect(X(Math.min(gx, gx + dir * 4)), Y(W / 2 - 5), 4 * sc, 10 * sc);
            circle(gx + dir * 8, W / 2, 0.18, true);
        }
    }

    function line(x1, y1, x2, y2) {
        ctx.beginPath();
        ctx.moveTo(X(x1), Y(y1));
        ctx.lineTo(X(x2), Y(y2));
        ctx.stroke();
    }

    function circle(x, y, r, fill) {
        ctx.beginPath();
        ctx.arc(X(x), Y(y), r * sc, 0, Math.PI * 2);
        if (fill) {
            ctx.fillStyle = "rgba(255,255,255,0.85)";
            ctx.fill();
        } else ctx.stroke();
    }

    function drawGoal(gx) {
        const dir = gx === 0 ? -1 : 1;
        const x0 = X(Math.min(gx, gx + dir * GOAL_D));
        const y0 = Y(W / 2 - GOAL_W / 2);
        const w = GOAL_D * sc;
        const h = GOAL_W * sc;
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.fillRect(x0, y0, w, h);
        // Net mesh.
        ctx.strokeStyle = "rgba(255,255,255,0.22)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let d = 0.4; d < GOAL_W; d += 0.4) {
            ctx.moveTo(x0, y0 + d * sc);
            ctx.lineTo(x0 + w, y0 + d * sc);
        }
        for (let d = 0.4; d < GOAL_D; d += 0.4) {
            ctx.moveTo(x0 + d * sc, y0);
            ctx.lineTo(x0 + d * sc, y0 + h);
        }
        ctx.stroke();
        // Frame: posts and bar along the line, side netting back.
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = Math.max(2, 0.16 * sc);
        ctx.beginPath();
        ctx.moveTo(X(gx), Y(W / 2 - GOAL_W / 2));
        ctx.lineTo(X(gx), Y(W / 2 + GOAL_W / 2));
        ctx.stroke();
        ctx.lineWidth = Math.max(1, 0.06 * sc);
        ctx.strokeRect(x0, y0, w, h);
    }

    function drawShadow(p) {
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.beginPath();
        ctx.ellipse(X(p.x + 0.22), Y(p.y + 0.28), 0.5 * BIG * sc, 0.38 * BIG * sc, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawPlayer(p, dt) {
        const team = TEAMS[p.team];
        const x = X(p.x);
        const y = Y(p.y);
        const user = p.id === s.user;
        const sp = Math.hypot(p.vx, p.vy);
        legs[p.id] = ((legs[p.id] || 0) + sp * dt * 2.4) % (Math.PI * 2);

        if (user) {
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = Math.max(2, 0.08 * sc);
            ctx.beginPath();
            ctx.arc(x, y, 0.85 * BIG * sc, 0, Math.PI * 2);
            ctx.stroke();
        } else if (s.pass && s.pass.to === p.id) {
            ctx.strokeStyle = "rgba(255,255,255,0.5)";
            ctx.setLineDash([0.25 * sc, 0.2 * sc]);
            ctx.lineWidth = Math.max(1, 0.06 * sc);
            ctx.beginPath();
            ctx.arc(x, y, 0.8 * BIG * sc, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.face);
        ctx.scale(BIG, BIG);
        // Legs swing while running.
        const swing = Math.sin(legs[p.id]) * Math.min(1, sp / 4) * 0.32;
        ctx.fillStyle = "#111";
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.arc((swing * side) * sc, side * 0.17 * sc, 0.11 * sc, 0, Math.PI * 2);
            ctx.fill();
        }
        // Shoulders, then head.
        ctx.fillStyle = p.role === "GK" ? (p.team ? "#e8c25a" : "#7b6cff") : team.kit;
        ctx.strokeStyle = team.trim;
        ctx.lineWidth = Math.max(1, 0.06 * sc);
        ctx.beginPath();
        ctx.ellipse(0, 0, 0.24 * sc, 0.42 * sc, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = p.id % 2 ? "#8d5a3b" : "#c68a5a";
        ctx.beginPath();
        ctx.arc(0.04 * sc, 0, 0.17 * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1a1208";
        ctx.beginPath();
        ctx.arc(-0.02 * sc, 0, 0.15 * sc, Math.PI / 2, -Math.PI / 2);
        ctx.fill();
        ctx.restore();

        if (user) drawMarker(p, x, y);
    }

    function drawMarker(p, x, y) {
        // Arrow above the head, stamina bar under it.
        const top = y - 1.2 * BIG * sc;
        ctx.fillStyle = TEAMS[0].kit;
        ctx.beginPath();
        ctx.moveTo(x - 0.3 * sc, top - 0.35 * sc);
        ctx.lineTo(x + 0.3 * sc, top - 0.35 * sc);
        ctx.lineTo(x, top);
        ctx.closePath();
        ctx.fill();
        ctx.font = `800 ${Math.round(0.42 * sc)}px Saira, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff";
        ctx.fillText(String(p.num), x, top - 0.5 * sc);
        if (p.stamina < 0.995) {
            const w = 1.2 * sc;
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(x - w / 2, y + 0.75 * BIG * sc, w, 0.12 * sc);
            ctx.fillStyle = p.stamina < 0.25 ? "#ff2d87" : "#e8c25a";
            ctx.fillRect(x - w / 2, y + 0.75 * BIG * sc, w * p.stamina, 0.12 * sc);
        }
    }

    function drawBallShadow() {
        const b = s.ball;
        const r = Sim.R_BALL * 2 * sc * (1 + b.z * 0.08);
        ctx.fillStyle = `rgba(0,0,0,${Math.max(0.1, 0.35 - b.z * 0.06)})`;
        ctx.beginPath();
        ctx.ellipse(X(b.x + b.z * 0.25), Y(b.y + b.z * 0.3), r, r * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawBall() {
        const b = s.ball;
        // A throw-in is held overhead until it is thrown.
        const z = s.setPiece && s.setPiece.kind === "Throw-in" ? 1.6 : b.z;
        // Height shows as a lift up the screen and a slightly bigger ball.
        const x = X(b.x);
        const y = Y(b.y - z * 0.45);
        const r = Sim.R_BALL * 2 * sc * (1 + z * 0.12);
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#222";
        ctx.lineWidth = Math.max(1, r * 0.18);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#222";
        ctx.beginPath();
        ctx.arc(x, y, r * 0.38, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawCharge() {
        const p = s.players[s.user];
        if (!p.chargeKind) return;
        const x = X(p.x);
        const y = Y(p.y) - 2.6 * BIG * sc;
        const w = 1.8 * sc;
        const h = 0.24 * sc;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(x - w / 2, y, w, h);
        ctx.fillStyle = { pass: "#1ef2c8", shoot: "#ff2d87", lob: "#e8c25a" }[p.chargeKind];
        ctx.fillRect(x - w / 2, y, w * p.charge, h);
        if (p.chargeKind === "shoot") {
            // Past here the shot starts to rise over the bar.
            ctx.fillStyle = "#fff";
            ctx.fillRect(x - w / 2 + w * 0.85, y - 0.06 * sc, Math.max(2, 0.05 * sc), h + 0.12 * sc);
        }
    }

    function drawHud() {
        const u = cw / 960;
        const pad = 14 * u;
        ctx.font = `italic 900 ${Math.round(22 * u)}px Saira, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const text = `${TEAMS[0].short}  ${s.score[0]} – ${s.score[1]}  ${TEAMS[1].short}`;
        const w = ctx.measureText(text).width + 28 * u;
        const h = 36 * u;
        ctx.fillStyle = "rgba(6,6,13,0.72)";
        ctx.fillRect(pad, pad, w, h);
        ctx.fillStyle = TEAMS[0].kit;
        ctx.fillRect(pad, pad, 4 * u, h);
        ctx.fillStyle = TEAMS[1].kit;
        ctx.fillRect(pad + w - 4 * u, pad, 4 * u, h);
        ctx.fillStyle = "#fff";
        ctx.fillText(text, pad + 14 * u, pad + h / 2 + 1);
        // The clock beside it, in match minutes: a half is 45 however long it really lasts.
        ctx.font = `800 ${Math.round(18 * u)}px Saira, sans-serif`;
        const clock = clockText();
        const cwid = ctx.measureText(clock).width + 20 * u;
        ctx.fillStyle = "rgba(6,6,13,0.72)";
        ctx.fillRect(pad + w + 4 * u, pad, cwid, h);
        ctx.fillStyle = s.clock >= s.halfLen ? "#e8c25a" : "#fff";
        ctx.fillText(clock, pad + w + 14 * u, pad + h / 2 + 1);
        ctx.textBaseline = "alphabetic";
    }

    function clockText() {
        if (s.clock >= s.halfLen) return `${s.half * 45}:00 +`;
        const secs = Math.floor((s.half - 1) * 2700 + (s.clock / s.halfLen) * 2700);
        return `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    }

    function drawRadar() {
        const u = cw / 960;
        const rw = 150 * u;
        const rh = (rw * W) / L;
        const rx = cw / 2 - rw / 2;
        const ry = ch - rh - 12 * u;
        const k = rw / L;
        ctx.fillStyle = "rgba(6,6,13,0.55)";
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1;
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.beginPath();
        ctx.moveTo(rx + rw / 2, ry);
        ctx.lineTo(rx + rw / 2, ry + rh);
        ctx.stroke();
        for (const p of s.players) {
            ctx.fillStyle = TEAMS[p.team].kit;
            ctx.beginPath();
            ctx.arc(rx + p.x * k, ry + p.y * k, (p.id === s.user ? 3.2 : 2.2) * u, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(rx + s.ball.x * k, ry + s.ball.y * k, 2 * u, 0, Math.PI * 2);
        ctx.fill();
    }

    // Your throw-in or corner: a dotted aim line and the keys to play it.
    function drawSetPiece() {
        const sp = s.setPiece;
        if (!sp || sp.team !== 0) return;
        const p = s.players[sp.taker];
        const a = p.aim || sp.inward;
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = Math.max(2, 0.08 * sc);
        ctx.setLineDash([0.3 * sc, 0.3 * sc]);
        line(sp.x, sp.y, sp.x + a.x * 7, sp.y + a.y * 7);
        ctx.setLineDash([]);
        const u = cw / 960;
        const keys = sp.kind === "Corner" ? "Aim, then L to cross (shoot to head it) · J short pass" : "Aim, then J to throw";
        ctx.font = `700 ${Math.round(16 * u)}px Saira, sans-serif`;
        ctx.textAlign = "center";
        const w = ctx.measureText(keys).width + 24 * u;
        const y = ch - 140 * u;
        ctx.fillStyle = "rgba(6,6,13,0.72)";
        ctx.fillRect(cw / 2 - w / 2, y - 18 * u, w, 28 * u);
        ctx.fillStyle = "#fff";
        ctx.fillText(keys, cw / 2, y + 1 * u);
    }

    function drawFlash() {
        drawSetPiece();
        if (!s.flash) return;
        const u = cw / 960;
        const goal = s.flash.text === "Goal!";
        ctx.font = `italic 900 ${Math.round((goal ? 84 : 34) * u)}px Saira, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 6 * u;
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.fillStyle = goal ? TEAMS[s.flash.team].kit : "#fff";
        const y = ch * (goal ? 0.42 : 0.2);
        const t = s.flash.text.toUpperCase();
        ctx.strokeText(t, cw / 2, y);
        ctx.fillText(t, cw / 2, y);
    }

    /* ---------- Sound ----------
       Synthesised, like the rest of the site's sounds, so there is nothing to
       load. A low crowd murmur that rises near either goal, and a sound for
       each kick, save, post and whistle. On by default; M turns it off. */

    const Context = window.AudioContext || window.webkitAudioContext;
    const soundState = document.querySelector("[data-sound-state]");
    let soundOn = true;
    try {
        soundOn = localStorage.getItem("nbs-five-sound") !== "off";
    } catch (error) {
        /* Default. */
    }
    let actx = null;
    let master = null;
    let crowd = null;

    function audio() {
        if (!Context) return null;
        if (!actx) {
            actx = new Context();
            master = actx.createGain();
            master.gain.value = soundOn ? 0.5 : 0;
            master.connect(actx.destination);
            // Crowd: looping pink-ish noise through a low band-pass.
            const len = actx.sampleRate * 2;
            const buf = actx.createBuffer(1, len, actx.sampleRate);
            const data = buf.getChannelData(0);
            let last = 0;
            for (let i = 0; i < len; i++) {
                last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
                data[i] = last * 6;
            }
            const src = actx.createBufferSource();
            src.buffer = buf;
            src.loop = true;
            const filter = actx.createBiquadFilter();
            filter.type = "bandpass";
            filter.frequency.value = 500;
            filter.Q.value = 0.6;
            crowd = actx.createGain();
            crowd.gain.value = 0;
            src.connect(filter).connect(crowd).connect(master);
            src.start();
        }
        if (actx.state === "suspended") actx.resume();
        return actx;
    }

    function tone(freq, length, { type = "sine", gain = 0.1, at = 0, to = null } = {}) {
        const a = audio();
        if (!a || !soundOn) return;
        const now = a.currentTime + at;
        const osc = a.createOscillator();
        const amp = a.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (to) osc.frequency.exponentialRampToValueAtTime(to, now + length);
        amp.gain.setValueAtTime(0.0001, now);
        amp.gain.exponentialRampToValueAtTime(gain, now + 0.008);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + length);
        osc.connect(amp).connect(master);
        osc.start(now);
        osc.stop(now + length + 0.02);
    }

    function hiss(length, { gain = 0.1, at = 0, from = 800, to = 2000, q = 1 } = {}) {
        const a = audio();
        if (!a || !soundOn) return;
        const now = a.currentTime + at;
        const buf = a.createBuffer(1, Math.ceil(a.sampleRate * length), a.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const src = a.createBufferSource();
        const filter = a.createBiquadFilter();
        const amp = a.createGain();
        src.buffer = buf;
        filter.type = "bandpass";
        filter.Q.value = q;
        filter.frequency.setValueAtTime(from, now);
        filter.frequency.exponentialRampToValueAtTime(to, now + length);
        amp.gain.setValueAtTime(0.0001, now);
        amp.gain.exponentialRampToValueAtTime(gain, now + Math.min(0.3, length * 0.25));
        amp.gain.exponentialRampToValueAtTime(0.0001, now + length);
        src.connect(filter).connect(amp).connect(master);
        src.start(now);
    }

    // 0: one short blast; 1: a kick-off pip; 3: the end of a half.
    function whistle(kind) {
        if (kind === 3) {
            [0, 0.35, 0.7].forEach((at, i) => tone(2650, i === 2 ? 0.8 : 0.22, { gain: 0.07, at }));
        } else if (kind === 1) {
            tone(2650, 0.5, { gain: 0.07 });
        } else tone(2650, 0.18, { gain: 0.06 });
    }

    function toggleSound() {
        soundOn = !soundOn;
        try {
            localStorage.setItem("nbs-five-sound", soundOn ? "on" : "off");
        } catch (error) {
            /* This visit only. */
        }
        if (master) master.gain.value = soundOn ? 0.5 : 0;
        if (soundState) soundState.textContent = soundOn ? "on" : "off";
    }
    if (soundState) soundState.textContent = soundOn ? "on" : "off";

    let roar = 0;
    let shake = 0;
    let confetti = [];

    // Sounds and effects for what just happened in the sim.
    function react(events) {
        for (const e of events) {
            if (e.type === "kick") {
                const hard = e.kind === "shoot";
                tone(hard ? 120 : 180, hard ? 0.16 : 0.09, { gain: hard ? 0.35 : 0.2, to: 50 });
                hiss(0.05, { gain: hard ? 0.1 : 0.05, from: 1800, to: 900 });
                if (hard) roar = Math.max(roar, 0.5);
            } else if (e.type === "save") {
                tone(90, 0.14, { gain: 0.3, to: 45 });
                if (e.won) roar = Math.max(roar, 0.7);
            } else if (e.type === "post") {
                tone(1180, 0.6, { type: "triangle", gain: 0.08 });
                tone(1770, 0.4, { type: "triangle", gain: 0.04 });
                roar = Math.max(roar, 0.8);
            } else if (e.type === "tackle" && e.won) {
                hiss(0.12, { gain: 0.08, from: 600, to: 300 });
            } else if (e.type === "goal") {
                whistle(0);
                hiss(2.6, { gain: 0.22, from: 400, to: 1200, q: 0.5 });
                roar = 1.4;
                shake = 0.35;
                burst(e.team);
            } else if (e.type === "out") {
                whistle(0);
            } else if (e.type === "whistle") {
                whistle(3);
                roar = Math.max(roar, 0.6);
            }
        }
        // Crowd: a murmur, louder with the ball near a goal, swelling after big moments.
        if (crowd) {
            const b = s.ball;
            const near = Math.max(0, 1 - Math.min(b.x, L - b.x) / 20);
            roar = Math.max(0, roar - Sim.DT * 0.5);
            crowd.gain.value = 0.05 + near * 0.06 + Math.min(1, roar) * 0.2;
        }
    }

    // Confetti in the scoring side's colours, thrown up from the bottom of the screen.
    function burst(team) {
        const kit = TEAMS[team].kit;
        for (let i = 0; i < 140; i++) {
            confetti.push({
                x: Math.random(),
                y: 1.05,
                vx: (Math.random() - 0.5) * 0.5,
                vy: -0.7 - Math.random() * 0.9,
                spin: Math.random() * 6,
                c: i % 3 ? kit : "#fff",
                life: 2.4,
            });
        }
    }

    function drawConfetti(dt) {
        if (!confetti.length) return;
        const step = Math.min(dt, 0.05);
        for (const p of confetti) {
            p.vy += 0.9 * step;
            p.x += p.vx * step;
            p.y += p.vy * step;
            p.spin += step * 8;
            p.life -= step;
            ctx.fillStyle = p.c;
            ctx.globalAlpha = Math.min(1, p.life);
            const size = cw / 160;
            ctx.fillRect(p.x * cw, p.y * ch, size, size * Math.abs(Math.sin(p.spin)) + 1);
        }
        ctx.globalAlpha = 1;
        confetti = confetti.filter((p) => p.life > 0);
    }

    /* ---------- Match log ----------
       The last few matches' logs are kept in this browser so a restart or a
       reload does not lose them. Only used for tuning. */

    const LOG_KEY = "nbs-five-log";
    let matchId = Date.now();
    let logged = 0;
    let savedAt = 0;

    function loadLogs() {
        try {
            return JSON.parse(localStorage.getItem(LOG_KEY)) || [];
        } catch (error) {
            return [];
        }
    }

    function saveLog() {
        savedAt = performance.now();
        logged = s.log.length;
        if (!s.log.length) return;
        const all = loadLogs().filter((m) => m.id !== matchId);
        all.push({ id: matchId, score: s.score.slice(), minutes: +(s.t / 60).toFixed(1), log: s.log });
        try {
            localStorage.setItem(LOG_KEY, JSON.stringify(all.slice(-5)));
        } catch (error) {
            /* Storage full or blocked: this match just is not kept. */
        }
    }

    window.addEventListener("pagehide", saveLog);

    renderSetup();

    // Hooks for poking at it from the console. render() draws one frame by
    // hand, for when the tab gets no animation frames; logs() lists saved matches.
    window.fiveASide = { get state() { return s; }, Sim, render: (dt) => draw(dt || 1), logs: loadLogs };

    requestAnimationFrame((now) => {
        last = now;
        frame(now);
    });
})();
