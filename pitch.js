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
    };

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

    let level = LEVELS[stored("nb-bot", "")] ? stored("nb-bot", "") : "medium";
    let carColor = COLORS[stored("nb-car", "")] ? stored("nb-car", "") : "red";

    function bestFor(name) {
        return Number(stored(`nb-best-${name}`, "0")) || 0;
    }

    // Setup: bot difficulty and car colour, above the pitch.

    const setup = document.createElement("div");
    setup.className = "pitch-setup";
    setup.innerHTML = `
        <fieldset class="pitch-levels"><legend>Bot</legend>${Object.entries(LEVELS).map(([id, info]) =>
            `<label class="pitch-seg"><input type="radio" name="pitch-level" value="${id}"><span>${info.name}</span></label>`).join("")}</fieldset>
        <fieldset class="pitch-colors"><legend>Your car</legend>${Object.entries(COLORS).map(([id, info]) =>
            `<label class="pitch-swatch" title="${info.name}"><input type="radio" name="pitch-color" value="${id}" aria-label="${info.name}"><span style="--swatch:${info.fill}"></span></label>`).join("")}</fieldset>`;
    root.insertBefore(setup, root.firstElementChild);
    const levelSet = setup.querySelector(".pitch-levels");
    setup.querySelector(`[name="pitch-level"][value="${level}"]`).checked = true;
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
        sound("tab");
        draw(performance.now());
        track(`pitch-car-${carColor}`, `Car colour: ${COLORS[carColor].name}`);
    });

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

    function plural(count, word) {
        return `${count} ${word}${count === 1 ? "" : "s"}`;
    }

    function versusBot() {
        return mode !== "free";
    }

    function renderScore() {
        if (versusBot()) {
            const best = bestFor(level);
            scoreLine.textContent = `You ${score.you} – ${score.them} Bot${best ? ` · best ${best} on ${LEVELS[level].name}` : ""}`;
        } else {
            scoreLine.textContent = `${plural(score.you, "goal")} · ${score.them} own ${score.them === 1 ? "goal" : "goals"}`;
        }
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

    function idle() {
        mode = "idle";
        levelSet.disabled = false;
        renderScore();
        setOverlay("Kick off", `60 seconds against the ${LEVELS[level].name.toLowerCase()} bot. Score in the red goal and keep the ball out of yours.`, "Start match");
    }

    function startMatch() {
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
        track(`pitch-match-${level}`, `Started a match against the ${LEVELS[level].name} bot`);
    }

    function endMatch() {
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
        const big = you > them ? "You win!" : you < them ? "Bot wins" : "Draw";
        const result = you > them ? `You beat the ${LEVELS[level].name.toLowerCase()} bot ${line}.` :
            you < them ? `The ${LEVELS[level].name.toLowerCase()} bot won ${line}.` : `Level at ${line}.`;
        setOverlay(big, record && you > 0 ? `${result} New best!` : result, "Play again");
        window.setTimeout(() => startButton.focus({ preventScroll: true }), 50);
        track(`pitch-full-time-${level}`, `Full time on ${LEVELS[level].name}: ${line}`);
    }

    function motionOn() {
        return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    startButton.addEventListener("click", startMatch);
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

    function steerTo(car, x, y, gain) {
        const dx = x - car.x;
        const dy = y - car.y;
        const diff = wrapAngle(Math.atan2(dy, dx) - car.angle);
        return { diff, distance: Math.hypot(dx, dy), steer: clamp(diff * gain, -1, 1) };
    }

    function playerInput() {
        let throttle = 0;
        let steer = 0;
        if (mode !== "match" && mode !== "free") return { throttle, steer, boost: false };
        if (pointer.active) {
            const aim = steerTo(player, pointer.x, pointer.y, 2.5);
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

    function botTarget(skill) {
        const bx = clamp(ball.x + ball.vx * skill.lead, FIELD.left + BALL_R, FIELD.right - BALL_R);
        const by = clamp(ball.y + ball.vy * skill.lead, FIELD.top + BALL_R, FIELD.bottom - BALL_R);
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

        // Roughly behind the ball: drive at the side of it facing away from
        // the goal, so the touch sends it goalward. The better the bot, the
        // straighter it has to be lined up before it commits.
        if (lined > skill.lineUp && dist < 200) {
            return inField(bx - ux * BALL_R + noise() * 0.3, by - uy * BALL_R + noise() * 0.3, true);
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

    function botInput(now) {
        if (mode !== "match" || freezeUntil) return { throttle: 0, steer: 0, boost: false };
        const skill = LEVELS[level];
        bot.power = skill.power;
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
        // Pinned against a wall: back off for a moment, then try again.
        if (Math.abs(bot.speed) < 15) {
            if (!bot.stuckSince) bot.stuckSince = now;
            if (now - bot.stuckSince > 700) {
                bot.reverseUntil = now + 450;
                bot.stuckSince = 0;
            }
        } else {
            bot.stuckSince = 0;
        }
        const aim = steerTo(bot, bot.target.x, bot.target.y, skill.steer);
        if (now < bot.reverseUntil) return { throttle: -1, steer: -aim.steer, boost: false };
        const turn = Math.abs(aim.diff);
        let throttle;
        if (turn > 2.4) throttle = -0.6;
        else if (bot.target.attack) throttle = 1;
        else if (turn > 1) throttle = 0.35;
        else throttle = aim.distance < 40 ? 0.5 : 1;
        // Players can hold boost the whole game; the hard bot does the same
        // whenever it is heading roughly where it wants to go.
        const lined = turn < (skill.chaseBoost ? 0.5 : 0.25);
        const wantsBoost = bot.target.attack ? aim.distance > 50 : skill.chaseBoost && aim.distance > 60;
        const boost = throttle > 0 && lined && wantsBoost && Math.random() < skill.boost;
        return { throttle, steer: throttle < 0 ? -aim.steer : aim.steer, boost };
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
        freezeUntil = now + 1500;
        if (mode === "over" || mode === "count" || mode === "idle") return;
        if (forUs) score.you += 1;
        else score.them += 1;
        renderScore();
        if (forUs && motionOn()) celebrate();
        sound(forUs ? "goal" : "stamp");
        stamp.textContent = forUs ? "Goal!" : mode === "match" ? "Bot scores" : "Own goal";
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
        if (versusBot()) drawCar(bot, BOT_FILL);
        drawCar(player, COLORS[carColor].fill);
    }

    function busy(input) {
        return mode === "match" || pointer.active || input.throttle !== 0 || Math.abs(player.speed) > 2 ||
            Math.hypot(ball.vx, ball.vy) > 2 || sparks.length > 0 || trail.length > 0 || freezeUntil > 0;
    }

    function frame(now) {
        const dt = Math.min(0.033, (now - last) / 1000);
        last = now;
        const input = playerInput();
        const botMove = mode === "match" ? botInput(now) : null;
        // The car is thinner than the ball is wide, so a fast car and a fast
        // ball can cross the car's middle in one frame and the ball pops out
        // the far side. Small steps keep each move to a few pixels.
        const closing = Math.abs(player.speed) + (botMove ? Math.abs(bot.speed) : 0) + Math.hypot(ball.vx, ball.vy);
        const steps = Math.min(10, Math.max(1, Math.ceil((closing * dt) / 5)));
        const h = dt / steps;
        for (let i = 0; i < steps; i++) {
            const effects = i === steps - 1;
            updateCar(player, h, input, effects);
            if (botMove) updateCar(bot, h, botMove, effects);
            updateBall(h, now);
            collide(player);
            if (botMove) {
                collide(bot);
                bumpCars();
            }
        }
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
