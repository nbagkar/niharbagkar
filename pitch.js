(function () {
    const root = document.getElementById("pitch");
    if (!root) return;

    const canvas = root.querySelector(".pitch-canvas");
    const stamp = root.querySelector(".pitch-stamp");
    const stage = root.querySelector(".pitch-stage");
    const clock = root.querySelector(".pitch-clock");
    const bestWrap = root.querySelector(".pitch-best");
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

    const car = { x: 0, y: 0, angle: 0, speed: 0 };
    const ball = { x: 0, y: 0, vx: 0, vy: 0, spin: 0 };
    const keys = new Set();
    const pointer = { active: false, x: 0, y: 0 };
    const trail = [];
    const sparks = [];
    const score = { goals: 0, own: 0 };
    let freezeUntil = 0;
    let started = false;
    let visible = false;
    let running = false;
    let last = 0;
    let scale = 1;

    // Arcade: a 60-second match with a countdown and a saved best score.
    // "idle" shows the menu, "count" the 3-2-1, "match" the clock, "over"
    // the result; "free" is the old open pitch.
    const MATCH_MS = 60000;
    let mode = "idle";
    let matchEnd = 0;
    let shownSeconds = -1;
    let best = 0;
    let countTimers = [];
    try {
        best = Number(localStorage.getItem("nb-best")) || 0;
    } catch (error) {
        /* Private mode: the best score lasts for this visit only. */
    }

    const overlay = document.createElement("div");
    overlay.className = "pitch-overlay";
    overlay.innerHTML = `<p class="po-big"></p><p class="po-sub"></p>
        <p class="po-actions"><button class="btn po-start" type="button"></button><button class="po-free" type="button">Free play</button></p>`;
    stage.appendChild(overlay);
    const startButton = overlay.querySelector(".po-start");
    const freeButton = overlay.querySelector(".po-free");

    function sound(name) {
        if (window.sfx) window.sfx(name);
    }

    function formatClock(ms) {
        const seconds = Math.max(0, Math.ceil(ms / 1000));
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }

    function setOverlay(big, sub, startLabel) {
        overlay.hidden = false;
        overlay.classList.remove("is-counting");
        overlay.querySelector(".po-big").textContent = big;
        overlay.querySelector(".po-sub").textContent = sub;
        overlay.querySelector(".po-actions").hidden = !startLabel;
        if (startLabel) startButton.textContent = startLabel;
        startButton.toggleAttribute("data-autofocus", Boolean(startLabel));
        canvas.removeAttribute("data-autofocus");
    }

    function hideOverlay() {
        overlay.hidden = true;
        startButton.removeAttribute("data-autofocus");
        canvas.setAttribute("data-autofocus", "");
    }

    function showBest() {
        root.querySelector('[data-score="best"]').textContent = best;
        bestWrap.hidden = best === 0;
    }

    function setScore(goals, own) {
        score.goals = goals;
        score.own = own;
        root.querySelector('[data-score="goals"]').textContent = score.goals;
        root.querySelector('[data-score="own"]').textContent = score.own;
        root.querySelector('[data-word="goal"]').textContent = score.goals === 1 ? "goal" : "goals";
        root.querySelector('[data-word="own"]').textContent = score.own === 1 ? "goal" : "goals";
    }

    function idle() {
        mode = "idle";
        setOverlay("Kick off", "A 60-second match. Drive the car into the ball and score in the red goal.", "Start match");
    }

    function startMatch() {
        countTimers.forEach(window.clearTimeout);
        countTimers = [];
        mode = "count";
        setScore(0, 0);
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
            hideOverlay();
            canvas.focus({ preventScroll: true });
            wake();
        }, beats.length * step - (step ? 250 : 0)));
        started = true;
        track("pitch-match", "Started a 60-second match");
    }

    function endMatch() {
        mode = "over";
        keys.clear();
        pointer.active = false;
        sound("whistle");
        const goals = score.goals;
        const record = goals > best;
        if (record) {
            best = goals;
            try {
                localStorage.setItem("nb-best", String(best));
            } catch (error) {
                /* Private mode: keep it for this visit. */
            }
        }
        showBest();
        const scored = goals === 1 ? "1 goal" : `${goals} goals`;
        setOverlay("Full time", record ? `You scored ${scored}. New best!` : `You scored ${scored}. Best: ${best}.`, "Play again");
        window.setTimeout(() => startButton.focus({ preventScroll: true }), 50);
        track("pitch-full-time", `Full time: ${goals} goals`);
    }

    function motionOn() {
        return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    startButton.addEventListener("click", startMatch);
    freeButton.addEventListener("click", () => {
        countTimers.forEach(window.clearTimeout);
        mode = "free";
        clock.hidden = true;
        hideOverlay();
        canvas.focus({ preventScroll: true });
        start();
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
        car.x = W / 2 - 110;
        car.y = H / 2;
        car.angle = 0;
        car.speed = 0;
        ball.x = W / 2;
        ball.y = H / 2;
        ball.vx = 0;
        ball.vy = 0;
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
        const compact = cssWidth < 520;
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

    function controls() {
        let throttle = 0;
        let steer = 0;
        if (mode !== "match" && mode !== "free") return { throttle, steer, boost: false };
        if (pointer.active) {
            const dx = pointer.x - car.x;
            const dy = pointer.y - car.y;
            const diff = wrapAngle(Math.atan2(dy, dx) - car.angle);
            steer = clamp(diff * 2.5, -1, 1);
            throttle = Math.hypot(dx, dy) > 18 ? (Math.abs(diff) > 1.9 ? 0.4 : 1) : 0;
        } else {
            if (keys.has("up")) throttle += 1;
            if (keys.has("down")) throttle -= 1;
            if (keys.has("right")) steer += 1;
            if (keys.has("left")) steer -= 1;
        }
        return { throttle, steer, boost: keys.has("boost") && throttle > 0 };
    }

    function updateCar(dt, input) {
        const top = input.boost ? 470 : 300;
        const accel = input.boost ? 900 : 560;
        const braking = input.throttle * car.speed < 0;
        car.speed += input.throttle * (braking ? 1100 : accel) * dt;
        car.speed -= car.speed * (input.throttle === 0 ? 2.4 : 0.5) * dt;
        if (car.speed > top) car.speed -= (car.speed - top) * 4 * dt;
        car.speed = clamp(car.speed, -170, 520);

        const grip = clamp(Math.abs(car.speed) / 90, 0, 1);
        car.angle += input.steer * 3.4 * grip * Math.sign(car.speed) * dt;
        car.x += Math.cos(car.angle) * car.speed * dt;
        car.y += Math.sin(car.angle) * car.speed * dt;

        const pad = 13;
        if (car.x < FIELD.left + pad || car.x > FIELD.right - pad) {
            car.x = clamp(car.x, FIELD.left + pad, FIELD.right - pad);
            car.speed *= -0.35;
        }
        if (car.y < FIELD.top + pad || car.y > FIELD.bottom - pad) {
            car.y = clamp(car.y, FIELD.top + pad, FIELD.bottom - pad);
            car.speed *= -0.35;
        }

        if (Math.abs(car.speed) > 40) {
            const c = Math.cos(car.angle);
            const s = Math.sin(car.angle);
            [-1, 1].forEach((side) => {
                trail.push({ x: car.x - c * 11 - s * 8 * side, y: car.y - s * 11 + c * 8 * side, born: last });
            });
            if (trail.length > 400) trail.splice(0, trail.length - 400);
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

    function collide() {
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
            nlx = Math.sign(lx) || 1;
            nly = 0;
            overlap = CAR.hx - Math.abs(lx) + BALL_R;
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
            const impulse = -1.6 * rel + 40;
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
        const inNet = ball.x < FIELD.left || ball.x > FIELD.right;

        if (inNet) {
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
        const colors = [ACCENT, "#e5cb78", "#8fd99a", "#b7ecff", INK];
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
        freezeUntil = now + 1500;
        if (mode === "over" || mode === "count" || mode === "idle") return;
        if (forUs) score.goals += 1;
        else score.own += 1;
        setScore(score.goals, score.own);
        if (forUs && motionOn()) celebrate();
        sound(forUs ? "goal" : "stamp");
        stamp.textContent = forUs ? "Goal!" : "Own goal";
        stamp.classList.remove("is-on");
        void stamp.offsetWidth;
        stamp.classList.add("is-on");
        track(forUs ? "pitch-goal" : "pitch-own-goal", forUs ? "Scored on the contact pitch" : "Own goal on the contact pitch");
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

    function drawCar() {
        ctx.save();
        ctx.translate(car.x, car.y);
        ctx.rotate(car.angle);
        ctx.fillStyle = "rgba(27, 24, 18, 0.15)";
        roundRect(-CAR.hx + 3, -CAR.hy + 3, CAR.hx * 2, CAR.hy * 2, 4);
        ctx.fill();
        ctx.fillStyle = INK;
        [[-10, -11], [-10, 7], [6, -11], [6, 7]].forEach(([x, y]) => ctx.fillRect(x, y, 9, 4));
        ctx.fillStyle = ACCENT;
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
        drawCar();
    }

    function busy(input) {
        return mode === "match" || pointer.active || input.throttle !== 0 || Math.abs(car.speed) > 2 ||
            Math.hypot(ball.vx, ball.vy) > 2 || sparks.length > 0 || trail.length > 0 || freezeUntil > 0;
    }

    function frame(now) {
        const dt = Math.min(0.033, (now - last) / 1000);
        last = now;
        const input = controls();
        updateCar(dt, input);
        collide();
        updateBall(dt, now);
        if (freezeUntil && now > freezeUntil) {
            freezeUntil = 0;
            kickoff();
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
        if (event.code === "KeyR") {
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
    showBest();
    idle();

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
