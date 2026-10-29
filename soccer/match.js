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

    let s = Sim.create((Math.random() * 1e9) | 0);
    let held = {};
    let playing = false;
    let started = false;
    let last = 0;
    let acc = 0;
    const cam = { x: L / 2, y: W / 2, view: VIEW };
    const legs = {};

    /* ---------- Input ---------- */

    window.addEventListener("keydown", (e) => {
        if (e.code === "Enter" && !playing) {
            e.preventDefault();
            return play();
        }
        if (!playing) return;
        if (e.code === "Escape" || e.code === "KeyP") return pause("Paused");
        if (e.code === "KeyR") {
            saveLog();
            s = Sim.create((Math.random() * 1e9) | 0);
            matchId = Date.now();
            return;
        }
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
        if (playing) pause("Paused");
    });

    playBtn.addEventListener("click", play);
    canvas.addEventListener("click", () => {
        if (!playing) play();
    });

    function play() {
        playing = true;
        started = true;
        held = {};
        overlay.hidden = true;
        canvas.focus({ preventScroll: true });
        last = performance.now();
    }

    function pause(title) {
        playing = false;
        held = {};
        overlay.hidden = false;
        overlay.querySelector("[data-overlay-kicker]").textContent = title;
        playBtn.firstChild.textContent = started ? "Resume " : "Play ";
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
            while (acc >= Sim.DT) {
                Sim.step(s, held);
                if (s.log.length !== logged && performance.now() - savedAt > 3000) saveLog();
                acc -= Sim.DT;
            }
        } else acc = 0;
        draw(dt);
        requestAnimationFrame(frame);
    }

    /* ---------- Drawing ---------- */

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
        ctx.setTransform(1, 0, 0, 1, 0, 0);
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
        ctx.textBaseline = "alphabetic";
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

    // Hooks for poking at it from the console. render() draws one frame by
    // hand, for when the tab gets no animation frames; logs() lists saved matches.
    window.fiveASide = { get state() { return s; }, Sim, render: (dt) => draw(dt || 1), logs: loadLogs };

    requestAnimationFrame((now) => {
        last = now;
        frame(now);
    });
})();
