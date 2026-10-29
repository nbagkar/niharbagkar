/* Five-a-side: the match simulation. Pure maths, no DOM, so Node can run it
   headlessly. Units are metres and seconds. x runs along the pitch (team 0
   attacks +x, towards the right-hand goal), y runs across it.

   Prototype scope (milestone 1): your five against two defenders and a
   keeper. Dribbling is a series of touches rather than a ball glued to the
   feet, so tackles and loose balls come out of the physics. */
(function (root) {
    "use strict";

    const L = 64;
    const W = 40;
    const GOAL_W = 6;
    const GOAL_H = 2.2;
    const GOAL_D = 1.6;
    const BOX_D = 11;
    const BOX_W = 22;
    const DT = 1 / 60;
    const G = 9.81;

    const R_PLAYER = 0.45;
    const R_BALL = 0.11;
    const REACH = 0.95;
    const JOG = 6.2;
    const SPRINT = 8.4;
    const AI_RUN = 5.6;
    const ACCEL = 24;
    const TURN = 10;

    // Rolling ball: dv/dt = -(ROLL_A + ROLL_K * v).
    const ROLL_A = 1.5;
    const ROLL_K = 0.4;

    const TEAMS = [
        { name: "NB FC", short: "NBF", kit: "#1ef2c8", trim: "#04342c" },
        { name: "Rivals", short: "RIV", kit: "#ff2d87", trim: "#3a0619" },
    ];

    // Home spots as fractions of the pitch, team 0 attacking right.
    const LINEUP = [
        { team: 0, role: "GK", num: 1, hx: 0.03, hy: 0.5 },
        { team: 0, role: "DF", num: 4, hx: 0.26, hy: 0.5 },
        { team: 0, role: "LM", num: 7, hx: 0.46, hy: 0.2 },
        { team: 0, role: "RM", num: 11, hx: 0.46, hy: 0.8 },
        { team: 0, role: "FW", num: 9, hx: 0.62, hy: 0.5 },
        { team: 1, role: "GK", num: 1, hx: 0.97, hy: 0.5 },
        { team: 1, role: "DF", num: 5, hx: 0.74, hy: 0.5 },
        { team: 1, role: "LM", num: 8, hx: 0.54, hy: 0.8 },
        { team: 1, role: "RM", num: 10, hx: 0.54, hy: 0.2 },
        { team: 1, role: "FW", num: 9, hx: 0.38, hy: 0.5 },
    ];

    function rng(seed) {
        let a = seed >>> 0 || 1;
        return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const hyp = Math.hypot;

    function create(seed) {
        const s = {
            t: 0,
            rand: rng(seed || 7),
            score: [0, 0],
            ball: { x: L / 2, y: W / 2, z: 0, vx: 0, vy: 0, vz: 0, last: -1, lastAt: -9, kickAt: -9 },
            players: LINEUP.map((d, id) => ({
                id,
                team: d.team,
                role: d.role,
                num: d.num,
                hx: d.hx,
                hy: d.hy,
                x: d.hx * L,
                y: d.hy * W,
                vx: 0,
                vy: 0,
                dvx: 0,
                dvy: 0,
                top: JOG,
                face: d.team ? Math.PI : 0,
                aim: null,
                stamina: 1,
                sprinting: false,
                touchCd: 0,
                kickCd: 0,
                tackleCd: 0,
                stun: 0,
                charge: 0,
                chargeKind: null,
                queued: null,
                run: null,
            })),
            user: 4,
            carrier: -1,
            pass: null,
            held: null,
            pause: 0,
            after: null,
            flash: null,
            prev: {},
            events: [],
            // Match log for tuning from real play: kicks, goals, saves, tackles.
            log: [],
        };
        kickoff(s, 0);
        return s;
    }

    function attackDir(team) {
        return team === 0 ? 1 : -1;
    }

    function goalX(team) {
        // The goal this team defends.
        return team === 0 ? 0 : L;
    }

    function kickoff(s, team) {
        const b = s.ball;
        Object.assign(b, { x: L / 2, y: W / 2, z: 0, vx: 0, vy: 0, vz: 0, last: -1, lastAt: -9, kickAt: -9 });
        for (const p of s.players) {
            p.x = p.hx * L;
            p.y = p.hy * W;
            // Everyone back in their own half, and the side not kicking off
            // outside the centre circle.
            p.x = p.team === 0 ? Math.min(p.x, L / 2 - 1.5) : Math.max(p.x, L / 2 + 1.5);
            if (p.team !== team && hyp(p.x - L / 2, p.y - W / 2) < 7) p.x = L / 2 - attackDir(p.team) * 7;
            Object.assign(p, { vx: 0, vy: 0, dvx: 0, dvy: 0, stun: 0, run: null, queued: null, charge: 0, chargeKind: null });
            p.face = p.team ? Math.PI : 0;
        }
        const fw = s.players.find((p) => p.team === team && p.role === "FW") || s.players.find((p) => p.team === team && p.role !== "GK");
        fw.x = L / 2 - attackDir(team) * 0.7;
        fw.y = W / 2;
        s.user = s.players.find((p) => p.team === 0 && p.role === "FW").id;
        s.carrier = -1;
        s.pass = null;
        s.held = null;
        s.flash = { text: "Kick off", until: s.t + 1.2 };
    }

    /* ---------- Ball maths ---------- */

    // Distance a rolling ball covers slowing from v0 to v1.
    function rollDist(v0, v1) {
        return (v0 - v1) / ROLL_K - (ROLL_A / (ROLL_K * ROLL_K)) * Math.log((ROLL_A + ROLL_K * v0) / (ROLL_A + ROLL_K * v1));
    }

    // Launch speed so a ground pass covers d metres and arrives at vEnd.
    function speedFor(d, vEnd) {
        let lo = vEnd;
        let hi = 45;
        for (let i = 0; i < 30; i++) {
            const mid = (lo + hi) / 2;
            if (rollDist(mid, vEnd) < d) lo = mid;
            else hi = mid;
        }
        return hi;
    }

    // Where the ball will be after t seconds (rough: rolling or flying, no bounces).
    function ballAt(b, t) {
        const sp = hyp(b.vx, b.vy);
        if (sp < 0.01) return { x: b.x, y: b.y };
        let d;
        if (b.z > 0.05 || b.vz > 0) {
            d = sp * t;
        } else {
            const tStop = Math.log((ROLL_A + ROLL_K * sp) / ROLL_A) / ROLL_K;
            const tt = Math.min(t, tStop);
            const v1 = (sp + ROLL_A / ROLL_K) * Math.exp(-ROLL_K * tt) - ROLL_A / ROLL_K;
            d = rollDist(sp, Math.max(0, v1));
        }
        return { x: b.x + (b.vx / sp) * d, y: b.y + (b.vy / sp) * d };
    }

    // Earliest spot a runner at speed v can meet the ball.
    function intercept(b, p, v) {
        for (let t = 0; t <= 3; t += 0.05) {
            const at = ballAt(b, t);
            if (hyp(at.x - p.x, at.y - p.y) - REACH * 0.6 <= v * t) return at;
        }
        return ballAt(b, 3);
    }

    /* ---------- Step ---------- */

    function step(s, inp) {
        stepInner(s, inp);
        for (const e of s.events) {
            if (e.type === "switch" || e.type === "control" || s.log.length > 4000) continue;
            const b = s.ball;
            const k = s.players.find((p) => p.team === 1 && p.role === "GK");
            const by = s.players[e.id];
            s.log.push(Object.assign({ t: +s.t.toFixed(2), bx: +b.x.toFixed(1), by: +b.y.toFixed(1), bz: +b.z.toFixed(1), v: +hyp(b.vx, b.vy).toFixed(1), kx: +k.x.toFixed(1), ky: +k.y.toFixed(1), team: by ? by.team : undefined }, e));
        }
        return s;
    }

    function stepInner(s, inp) {
        inp = inp || {};
        s.t += DT;
        s.events.length = 0;
        const prev = s.prev;
        s.prev = Object.assign({}, inp);
        if (s.flash && s.t > s.flash.until) s.flash = null;

        if (s.pause > 0) {
            s.pause -= DT;
            if (s.pause <= 0 && s.after) {
                const f = s.after;
                s.after = null;
                f(s);
            }
            return s;
        }

        const pressed = (k) => inp[k] && !prev[k];
        const released = (k) => !inp[k] && prev[k];

        for (const p of s.players) {
            p.touchCd = Math.max(0, p.touchCd - DT);
            p.kickCd = Math.max(0, p.kickCd - DT);
            p.tackleCd = Math.max(0, p.tackleCd - DT);
            p.stun = Math.max(0, p.stun - DT);
        }

        if (pressed("swap")) swap(s);
        const me = s.players[s.user];
        control(s, me, inp, pressed, released);
        for (const p of s.players) if (p !== me) think(s, p);
        for (const p of s.players) move(s, p);
        separate(s);
        if (s.setPiece) {
            holdSetPiece(s);
            return s;
        }
        touches(s);
        keepers(s);
        ballPhysics(s);
        rules(s);
        updateCarrier(s);
        return s;
    }

    /* ---------- The player you control ---------- */

    function control(s, me, inp, pressed, released) {
        let dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        let dy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
        if (typeof inp.dx === "number") {
            dx = inp.dx;
            dy = inp.dy;
        }
        const m = hyp(dx, dy);
        if (m > 1) {
            dx /= m;
            dy /= m;
        }
        const moving = m > 0.1;
        // Kicks go where the stick points now, or where the player faces if it is let go.
        me.aim = moving ? { x: dx / m, y: dy / m } : { x: Math.cos(me.face), y: Math.sin(me.face) };
        me.stickHeld = moving;

        const has = s.carrier === me.id;
        const sprint = !!inp.sprint && moving && me.stamina > 0.04;
        let top = sprint ? SPRINT * (me.stamina < 0.25 ? 0.82 : 1) : JOG;
        if (has) top *= 0.9;
        if (me.stun > 0) top *= 0.35;
        me.sprinting = sprint;
        me.stamina = clamp(me.stamina + (sprint ? -0.2 : 0.09) * DT, 0, 1);

        const b = s.ball;
        const onBall = s.carrier === me.id || (b.last === me.id && hyp(b.x - me.x, b.y - me.y) < 4);
        const sp = s.setPiece;
        if (sp && sp.taker === me.id) {
            // Taking a throw-in or corner: stand still, the stick only aims (always infield).
            let a = moving ? { x: dx / m, y: dy / m } : sp.inward;
            // Along or out of the line: bend it infield but keep the side the stick picked.
            const dot = a.x * sp.inward.x + a.y * sp.inward.y;
            if (dot < 0.3) a = norm(a.x + sp.inward.x * (0.6 - dot), a.y + sp.inward.y * (0.6 - dot));
            me.aim = a;
            me.face = Math.atan2(a.y, a.x);
            me.x = sp.x - a.x * 0.6;
            me.y = sp.y - a.y * 0.6;
            me.vx = me.vy = me.dvx = me.dvy = 0;
        } else if (!moving && s.pass && s.pass.to === me.id && s.carrier !== me.id) {
            // No stick input while a pass is coming to you: go and meet it.
            const at = intercept(b, me, JOG);
            seek(me, at.x, at.y, JOG);
        } else if (!moving && onBall && (me.chargeKind || me.queued) && b.z < 1) {
            // Winding up on the ball with the stick let go: step onto it.
            const at = intercept(b, me, top);
            seek(me, at.x, at.y, top);
        } else {
            me.dvx = dx * top;
            me.dvy = dy * top;
            me.top = top;
        }

        for (const kind of ["pass", "shoot", "lob"]) {
            if (pressed(kind)) {
                me.chargeKind = kind;
                me.charge = 0;
            }
        }
        if (me.chargeKind && inp[me.chargeKind]) me.charge = Math.min(1, me.charge + DT / 0.9);
        if (me.chargeKind && released(me.chargeKind)) {
            // On the ball, the kick waits for the next touch; otherwise it is a short buffer.
            const mine = s.carrier === me.id || s.ball.last === me.id;
            me.queued = { kind: me.chargeKind, power: me.charge, until: s.t + (mine ? 1.1 : 0.35) };
            me.chargeKind = null;
            me.charge = 0;
        }
        if (me.queued) {
            if (s.t > me.queued.until) me.queued = null;
            else if (canKick(s, me, me.queued.kind)) {
                kick(s, me, me.queued.kind, me.queued.power, me.aim);
                me.queued = null;
            }
        }
        if (pressed("tackle")) tackle(s, me, 0.6, false, true);
        // Running into the dribbler: a small chance to nick it, no penalty for missing.
        const owner = s.carrier >= 0 ? s.players[s.carrier] : null;
        if (owner && owner.team !== me.team && me.tackleCd <= 0 && hyp(b.x - me.x, b.y - me.y) < 1.0) tackle(s, me, 0.3, true);
    }

    function swap(s) {
        const b = s.ball;
        // On the ball (or taking a set piece) you keep the player you have.
        if (s.setPiece || s.carrier === s.user) return;
        let best = null;
        let bestD = Infinity;
        for (const p of s.players) {
            if (p.team !== 0 || p.role === "GK" || p.id === s.user) continue;
            const d = hyp(p.x - b.x, p.y - b.y);
            if (d < bestD) {
                bestD = d;
                best = p;
            }
        }
        if (best) setUser(s, best);
    }

    function setUser(s, p) {
        const old = s.players[s.user];
        if (old && old !== p) {
            old.chargeKind = null;
            old.charge = 0;
            old.queued = null;
        }
        s.user = p.id;
        p.run = null;
        s.events.push({ type: "switch", id: p.id });
    }

    /* ---------- Kicking ---------- */

    function canKick(s, p, kind) {
        const b = s.ball;
        if (s.held && s.held.id !== p.id) return false;
        if (s.setPiece && s.setPiece.taker !== p.id) return false;
        const reach = s.carrier === p.id ? 1.4 : REACH + 0.15;
        // A shot can meet the ball in the air: a header or volley.
        const high = kind === "shoot" ? 2.3 : 1.1;
        return p.kickCd <= 0 && p.stun <= 0 && b.z < high && hyp(b.x - p.x, b.y - p.y) < reach;
    }

    function pickTarget(s, p, dir, maxAngle) {
        let best = null;
        let bestScore = Infinity;
        for (const q of s.players) {
            if (q.team !== p.team || q.id === p.id || q.role === "GK") continue;
            const dx = q.x - p.x;
            const dy = q.y - p.y;
            const d = hyp(dx, dy);
            if (d < 3 || d > 42) continue;
            const ang = Math.abs(Math.atan2(dir.x * dy - dir.y * dx, dir.x * dx + dir.y * dy));
            if (ang > maxAngle) continue;
            const score = ang * 14 + d * 0.15;
            if (score < bestScore) {
                bestScore = score;
                best = q;
            }
        }
        return best;
    }

    function kick(s, p, kind, power, aim) {
        const b = s.ball;
        const dir = aim || { x: Math.cos(p.face), y: Math.sin(p.face) };
        const ad = attackDir(p.team);
        let vx;
        let vy;
        let vz = 0;
        const piece = s.setPiece ? s.setPiece.kind : null;
        s.setPiece = null;
        if (piece) for (const q of s.players) q.spot = null;
        const header = kind === "shoot" && b.z > 1.1;

        if (piece === "Throw-in") {
            // Thrown from the hands: short and looping, whichever button.
            const q = pickTarget(s, p, dir, 1.0);
            let tx = b.x + dir.x * (8 + 8 * power);
            let ty = b.y + dir.y * (8 + 8 * power);
            if (q) {
                tx = q.x + q.vx * 0.5;
                ty = q.y + q.vy * 0.5;
                s.pass = { to: q.id, from: p.id, at: s.t };
            } else s.pass = null;
            const d = hyp(tx - b.x, ty - b.y) || 1;
            b.z = 1.6;
            vz = clamp(1.5 + d * 0.15, 2, 5);
            const flight = (vz + Math.sqrt(vz * vz + 2 * G * b.z)) / G;
            const speed = Math.min(14, (d * 0.85) / flight);
            vx = ((tx - b.x) / d) * speed;
            vy = ((ty - b.y) / d) * speed;
        } else if (kind === "shoot" && towardGoal(p, dir, b) < -0.3) {
            // Turned back towards your own half: no shot at goal, just a hit where you face.
            const speed = 14 + 14 * power;
            vx = dir.x * speed;
            vy = dir.y * speed;
            vz = header ? 0 : 0.5 + power * 2.5;
            s.pass = null;
        } else if (kind === "shoot") {
            const gx = goalX(1 - p.team);
            // Aimed with the stick, or else away from the side the keeper covers.
            const keeper = s.players.find((q) => q.team !== p.team && q.role === "GK");
            const open = keeper && Math.abs(keeper.y - W / 2) > 0.3 ? -Math.sign(keeper.y - W / 2) : b.y < W / 2 ? 1 : -1;
            const sideways = Math.abs(dir.y) > 0.3 ? Math.sign(dir.y) * Math.min(1, Math.abs(dir.y) * 1.3) : open * (0.35 + s.rand() * 0.4);
            const dist = hyp(gx - b.x, W / 2 - b.y);
            // Side-on to goal the strike gets wilder.
            const twist = Math.max(0, 0.3 - towardGoal(p, dir, b)) * 1.5;
            const spread = 0.35 + dist * 0.035 + twist + (power > 0.85 ? (power - 0.85) * 6 : 0);
            const ty = W / 2 + sideways * (GOAL_W / 2 - 0.7) + (s.rand() - 0.5) * 2 * spread;
            const tx = gx + ad * 0.3;
            // Headers and volleys are softer than a struck shot along the ground.
            const speed = header ? 14 + 6 * power : 15 + 15 * power;
            const d = hyp(tx - b.x, ty - b.y);
            const t = d / speed;
            // Past 85% power the shot starts to rise; a full bar usually clears the bar.
            const h = 0.2 + power * 1.1 + (power > 0.85 ? (power - 0.85) * 7 : 0) + s.rand() * 0.3;
            // Driven, not chipped: long weak shots skid in along the ground.
            vz = clamp((h - b.z + 0.5 * G * t * t) / t, header ? -8 : 0, 1.5 + power * 4);
            vx = ((tx - b.x) / d) * speed;
            vy = ((ty - b.y) / d) * speed;
            s.pass = null;
        } else if (kind === "pass") {
            const q = pickTarget(s, p, dir, 0.95);
            if (q) {
                let d = hyp(q.x - p.x, q.y - p.y);
                const lead = Math.min(1.2, d / 14);
                const tx = q.x + q.vx * lead;
                const ty = q.y + q.vy * lead;
                d = hyp(tx - b.x, ty - b.y);
                const speed = speedFor(d, 4.5 + power * 3);
                vx = ((tx - b.x) / d) * speed;
                vy = ((ty - b.y) / d) * speed;
                s.pass = { to: q.id, from: p.id, at: s.t };
            } else {
                const speed = 9 + 11 * power;
                vx = dir.x * speed;
                vy = dir.y * speed;
                s.pass = null;
            }
        } else {
            // Lob: a lofted through ball into the space ahead of a teammate.
            // The defenders' clearances go to space, not to each other.
            const q = p.team === 0 ? pickTarget(s, p, dir, 1.2) : null;
            let tx;
            let ty;
            if (q && piece === "Corner") {
                // A cross: drop it on the teammate's head; meet it with shoot.
                const dq = hyp(q.x - b.x, q.y - b.y);
                vz = 6.2 + 1.5 * power;
                const down = (vz + Math.sqrt(Math.max(0, vz * vz - 2 * G * 1.5))) / G;
                const speed = dq / down;
                b.vx = ((q.x - b.x) / dq) * speed;
                b.vy = ((q.y - b.y) / dq) * speed;
                s.pass = { to: q.id, from: p.id, at: s.t };
                q.run = { x: q.x, y: q.y, until: s.t + down };
                return launched(s, p, kind, power, b.vx, b.vy, vz);
            }
            if (q) {
                tx = clamp(q.x + ad * (4 + 5 * power), 2, L - 2);
                ty = clamp(q.y + q.vy * 0.6, 2, W - 2);
                q.run = { x: tx, y: ty, until: s.t + 3 };
                s.pass = { to: q.id, from: p.id, at: s.t };
            } else {
                const d = 14 + 16 * power;
                tx = b.x + dir.x * d;
                ty = b.y + dir.y * d;
                s.pass = null;
            }
            const d = hyp(tx - b.x, ty - b.y);
            vz = 5.5 + 3.5 * power;
            const flight = (2 * vz) / G;
            const speed = (d * 0.8) / flight;
            vx = ((tx - b.x) / d) * speed;
            vy = ((ty - b.y) / d) * speed;
        }
        launched(s, p, kind, power, vx, vy, vz);
    }

    function launched(s, p, kind, power, vx, vy, vz) {
        const b = s.ball;
        b.vx = vx;
        b.vy = vy;
        b.vz = vz;
        if (s.held && s.held.id === p.id) s.held = null;
        b.last = p.id;
        b.lastAt = s.t;
        b.kickAt = s.t;
        b.fromX = b.x;
        b.fromY = b.y;
        b.header = kind === "shoot" && b.z > 1.1;
        p.kickCd = 0.3;
        p.touchCd = 0.35;
        p.face = Math.atan2(vy, vx);
        s.carrier = -1;
        s.events.push({ type: "kick", kind, id: p.id, power });

        // FIFA habit: control follows the pass.
        if (p.team === 0 && s.pass && s.players[s.pass.to]) setUser(s, s.players[s.pass.to]);
    }

    // How much the player is turned towards the goal they attack: 1 square on,
    // 0 side-on, -1 back to goal. The better of body facing and stick, so pressing
    // up or down to pick a corner still counts as facing the goal.
    function towardGoal(p, dir, b) {
        // A header faces the incoming cross; with the stick let go it goes at goal.
        if (b.z > 1.1 && !p.stickHeld) return 1;
        const ad = attackDir(p.team);
        return Math.max(Math.cos(p.face) * ad, dir.x * ad);
    }

    // soft: the free nick when running into the dribbler (no stun if it fails).
    // lunge: your E/Z tackle, which reaches further and bursts towards the ball.
    function tackle(s, p, chance, soft, lunge) {
        const b = s.ball;
        if (p.tackleCd > 0 || p.stun > 0) return;
        p.tackleCd = 0.9;
        const type = soft ? "nick" : "tackle";
        const d = hyp(b.x - p.x, b.y - p.y);
        if (lunge && d < 3) {
            const n = norm(b.x - p.x, b.y - p.y);
            p.vx += n.x * 4;
            p.vy += n.y * 4;
        }
        if (d > (lunge ? 2.2 : 1.6) || b.z > 1) {
            if (!soft) p.stun = 0.35;
            s.events.push({ type, id: p.id, won: false });
            return;
        }
        const owner = s.carrier >= 0 ? s.players[s.carrier] : null;
        if (owner && owner.team === p.team) return;
        // From behind the dribbler it is much harder to get the ball cleanly.
        if (owner) {
            const ov = hyp(owner.vx, owner.vy);
            if (ov > 1 && ((p.x - owner.x) * owner.vx + (p.y - owner.y) * owner.vy) / ov < -0.3) chance *= 0.6;
        }
        if (s.rand() < chance) {
            const a = p.face + (s.rand() - 0.5) * 0.8;
            b.vx = Math.cos(a) * 5 + p.vx * 0.3;
            b.vy = Math.sin(a) * 5 + p.vy * 0.3;
            b.vz = 0;
            b.last = p.id;
            b.lastAt = s.t;
            p.touchCd = 0.15;
            if (owner) {
                owner.stun = 0.45;
                owner.touchCd = 0.5;
            }
            s.carrier = -1;
            s.pass = null;
            s.events.push({ type, id: p.id, won: true });
        } else {
            if (!soft) p.stun = 0.55;
            s.events.push({ type, id: p.id, won: false });
        }
    }

    /* ---------- AI ---------- */

    function seek(p, x, y, top) {
        const dx = x - p.x;
        const dy = y - p.y;
        const d = hyp(dx, dy);
        // Arrive: ease off over the last couple of metres.
        const v = d < 0.25 ? 0 : Math.min(top, d * 3);
        p.dvx = d > 0 ? (dx / d) * v : 0;
        p.dvy = d > 0 ? (dy / d) * v : 0;
        p.top = top;
    }

    function think(s, p) {
        if (p.role === "GK") return keeperThink(s, p);
        const b = s.ball;
        if (p.stun > 0) {
            p.dvx *= 0.5;
            p.dvy *= 0.5;
            return;
        }
        if (s.held) {
            // The other side's keeper has it: leave his box and wait outside it.
            const k = s.players[s.held.id];
            if (k.team !== p.team) {
                if (inBox(k.team, p.x, p.y)) return seek(p, goalX(k.team) + attackDir(k.team) * (BOX_D + 2), clamp(p.y, 3, W - 3), AI_RUN);
                p.dvx = p.dvy = 0;
                return;
            }
            // Our keeper has it: get into shape outside the box to take the throw.
            return shape(s, p, true);
        }
        const sp = s.setPiece;
        if (sp && sp.taker === p.id) {
            // The AI takes its set pieces quickly: a throw to a teammate, a corner into the box.
            p.dvx = p.dvy = 0;
            if (s.t - sp.at > 0.9) kick(s, p, sp.kind === "Throw-in" ? "pass" : "lob", 0.6, norm(attackDir(p.team) * 0.7, sp.inward.y || sp.inward.x));
            return;
        }
        if (sp && p.spot) return seek(p, p.spot.x, p.spot.y, AI_RUN);
        if (block(s, p)) return;
        if (s.pass && s.pass.to === p.id && s.carrier !== p.id) {
            const at = intercept(b, p, JOG);
            return seek(p, at.x, at.y, JOG);
        }
        if (p.run && s.t < p.run.until && s.carrier < 0) return seek(p, p.run.x, p.run.y, 7.6);
        p.run = null;
        if (s.carrier === p.id) return carrierThink(s, p);
        const owner = s.carrier >= 0 ? s.players[s.carrier] : null;
        if (owner && owner.team === p.team) return shape(s, p, false);
        if (owner) return defend(s, p, owner);
        return loose(s, p);
    }

    // A hard shot through a player: sometimes blocked, never cleanly.
    function block(s, p) {
        const b = s.ball;
        const shooter = s.players[b.last];
        if (!shooter || shooter.team === p.team || hyp(b.vx, b.vy) < 15 || !canKick(s, p) || p.blockTried === b.kickAt) return false;
        p.blockTried = b.kickAt;
        if (s.rand() >= 0.3) return false;
        b.vx = -b.vx * 0.25 + (s.rand() - 0.5) * 4;
        b.vy = b.vy * 0.3 + (s.rand() - 0.5) * 9;
        b.vz = s.rand() * 3;
        b.last = p.id;
        b.lastAt = s.t;
        s.pass = null;
        s.events.push({ type: "block", id: p.id });
        return true;
    }

    // Formation spot, sliding with the ball; forwards stay ahead of it.
    function shape(s, p, outOfBox) {
        const b = s.ball;
        const ad = attackDir(p.team);
        let x = p.hx * L + (b.x - L / 2) * 0.5;
        let y = p.hy * W + (b.y - W / 2) * 0.3;
        if (p.role === "FW") x = ad > 0 ? Math.max(x, b.x + 6) : Math.min(x, b.x - 6);
        if (outOfBox) x = ad > 0 ? Math.max(x, BOX_D + 2) : Math.min(x, L - BOX_D - 2);
        x = clamp(x, 4, L - 4);
        y = clamp(y, 3, W - 3);
        // Give a teammate on the ball some room.
        const c = s.carrier >= 0 ? s.players[s.carrier] : null;
        if (c && c.team === p.team && c !== p) {
            const dm = hyp(x - c.x, y - c.y);
            if (dm < 7 && dm > 0.01) {
                x += ((x - c.x) / dm) * (7 - dm);
                y += ((y - c.y) / dm) * (7 - dm);
            }
        }
        seek(p, clamp(x, 2, L - 2), clamp(y, 2, W - 2), AI_RUN * 0.8);
    }

    // Nobody has it: the nearest player on each side goes for it. On your side
    // that is only when they are clearly nearer than the player you control.
    function loose(s, p) {
        const b = s.ball;
        const d = (q) => hyp(b.x - q.x, b.y - q.y);
        const mates = s.players.filter((q) => q.team === p.team && q.role !== "GK" && q.stun <= 0);
        const nearest = mates.reduce((a, q) => (d(q) < d(a) ? q : a));
        const me = s.players[s.user];
        const go = p.team === 0 ? nearest === p && d(p) < d(me) - 1 : nearest === p;
        if (go && !s.held) {
            const at = intercept(b, p, AI_RUN);
            return seek(p, at.x, at.y, AI_RUN);
        }
        shape(s, p, false);
    }

    // The other side has it: one presser jockeys goal-side and tackles, the
    // rest mark a man goal-side. On your side the player you control is the
    // presser unless they are far from the ball.
    function defend(s, p, owner) {
        const b = s.ball;
        const gx = goalX(p.team);
        const d = (q) => hyp(b.x - q.x, b.y - q.y);
        const me = s.players[s.user];
        const mates = s.players.filter((q) => q.team === p.team && q.role !== "GK" && q.stun <= 0 && !(q.team === 0 && q === me));
        const nearest = mates.reduce((a, q) => (d(q) < d(a) ? q : a), mates[0]);
        // You count as the presser only when close and goal-side, not chasing from behind.
        const userPresses = p.team === 0 && (d(me) < 2.5 || (d(me) < 7 && (b.x - me.x) * attackDir(owner.team) < 0.5));
        if (nearest === p && !userPresses) {
            const g = norm(gx - b.x, W / 2 - b.y);
            seek(p, b.x + g.x * 0.9, b.y + g.y * 0.9, AI_RUN);
            if (d(p) < 1.15 && p.tackleCd <= 0) tackle(s, p, 0.33);
            return;
        }
        // Mark: share out the other side's outfield players (not the one on the
        // ball) by who is nearest to whose formation spot.
        const markers = mates.filter((q) => userPresses || q !== nearest);
        const targets = s.players.filter((q) => q.team !== p.team && q.role !== "GK" && q !== owner);
        const taken = new Set();
        let mine = null;
        for (const m of markers.sort((a, c) => a.id - c.id)) {
            let best = null;
            let bestD = Infinity;
            for (const t of targets) {
                if (taken.has(t)) continue;
                const dd = hyp(t.x - m.hx * L, t.y - m.hy * W);
                if (dd < bestD) {
                    bestD = dd;
                    best = t;
                }
            }
            if (best) taken.add(best);
            if (m === p) mine = best;
        }
        if (!mine) return shape(s, p, false);
        const g = norm(gx - mine.x, W / 2 - mine.y);
        seek(p, mine.x + g.x * 1.8, mine.y + g.y * 1.8, AI_RUN);
    }

    // AI on the ball (the Rivals; your own AI players hand the ball to you).
    function carrierThink(s, p) {
        const b = s.ball;
        const ad = attackDir(p.team);
        const gx = goalX(1 - p.team);
        const dG = hyp(gx - b.x, W / 2 - b.y);
        const opps = s.players.filter((q) => q.team !== p.team && q.role !== "GK");
        const dist = (q) => hyp(q.x - p.x, q.y - p.y);
        const press = Math.min(...opps.map(dist));
        if (canKick(s, p) && s.t >= (p.decideAt || 0)) {
            p.decideAt = s.t + 0.25;
            const settled = s.t - (p.gotAt || 0) > 0.3;
            // Shoot: close in, or with a defender closing, or now and then from range.
            if (dG < 16 && Math.abs(b.y - W / 2) < 10 && (dG < 9.5 || (press < 2 && dG < 13) || s.rand() < 0.015)) {
                const aim = norm(ad, (s.rand() < 0.5 ? -1 : 1) * (0.45 + s.rand() * 0.4));
                return kick(s, p, "shoot", 0.45 + s.rand() * 0.32, aim);
            }
            // Pinned in our own box: clear it.
            if (inBox(p.team, b.x, b.y) && press < 3) {
                return kick(s, p, "lob", 0.7, norm(ad, b.y < W / 2 ? -0.6 : 0.6));
            }
            // Under pressure, or a teammate clearly better placed: pass.
            if (settled && (press < 2.8 || s.rand() < 0.08)) {
                const q = passOption(s, p, opps);
                if (q) return kick(s, p, "pass", 0.3, norm(q.x - p.x, q.y - p.y));
            }
        }
        // Dribble at goal, steering round anyone close.
        const to = norm(gx - p.x, W / 2 - p.y);
        let dx = to.x;
        let dy = to.y;
        for (const o of opps) {
            const d = dist(o);
            const ahead = (o.x - p.x) * to.x + (o.y - p.y) * to.y;
            if (d < 5 && ahead > -0.5) {
                // Sidestep: across the line to goal, away from the defender.
                const side = (o.x - p.x) * -to.y + (o.y - p.y) * to.x > 0 ? -1 : 1;
                dx += -to.y * side * (5 - d) * 0.25;
                dy += to.x * side * (5 - d) * 0.25;
            }
        }
        const n = norm(dx, dy);
        // Space ahead: run with it. Closed down: slow to keep it close.
        p.sprinting = press > 5;
        const top = p.sprinting ? 7 : press < 3 ? 4.8 : AI_RUN;
        p.dvx = n.x * top;
        p.dvy = n.y * top;
        p.top = top;
    }

    // An open teammate not behind the ball, with a clear lane.
    function passOption(s, p, opps) {
        const ad = attackDir(p.team);
        let best = null;
        let bestScore = -Infinity;
        for (const q of s.players) {
            if (q.team !== p.team || q === p || q.role === "GK") continue;
            const dx = q.x - p.x;
            const dy = q.y - p.y;
            const d = hyp(dx, dy);
            if (d < 4 || d > 30 || dx * ad < -4) continue;
            const open = Math.min(...opps.map((o) => hyp(o.x - q.x, o.y - q.y)));
            if (open < 2.5) continue;
            // Anyone standing in the lane?
            const lane = opps.some((o) => {
                const t = clamp(((o.x - p.x) * dx + (o.y - p.y) * dy) / (d * d), 0, 1);
                return hyp(p.x + dx * t - o.x, p.y + dy * t - o.y) < 1.4 && t > 0.1;
            });
            if (lane) continue;
            const score = dx * ad * 0.6 + open * 0.8 - d * 0.1;
            if (score > bestScore) {
                bestScore = score;
                best = q;
            }
        }
        return best;
    }

    function norm(x, y) {
        const d = hyp(x, y) || 1;
        return { x: x / d, y: y / d };
    }

    /* ---------- Keepers ---------- */

    function inBox(team, x, y) {
        const gx = goalX(team);
        return Math.abs(x - gx) < BOX_D && Math.abs(y - W / 2) < BOX_W / 2;
    }

    function keeperThink(s, p) {
        const b = s.ball;
        const gx = goalX(p.team);
        const ad = attackDir(p.team);
        p.diving = false;

        if (s.held && s.held.id === p.id) {
            p.dvx = p.dvy = 0;
            // Release once the opponents have cleared the box (or after 3 s regardless).
            const clear = !s.players.some((q) => q.team !== p.team && inBox(p.team, q.x, q.y));
            if (s.t > s.held.until && (clear || s.t > s.held.until + 3)) {
                // Roll it to an open teammate with a clear lane; if nobody is free, punt it long.
                const opps = s.players.filter((q) => q.team !== p.team && q.role !== "GK");
                const q = passOption(s, p, opps);
                if (q) kick(s, p, "pass", 0.4, norm(q.x - p.x, q.y - p.y));
                else kick(s, p, "lob", 0.85, norm(ad, (s.rand() - 0.5) * 0.8));
            }
            return;
        }

        // Shot coming? React after a short delay and move across.
        const towards = (gx - b.x) * b.vx > 0;
        if (towards && s.t - b.kickAt > 0.14 && b.last !== p.id) {
            const t = (gx - b.x) / b.vx;
            if (t > 0 && t < 2) {
                const py = b.y + b.vy * t;
                if (Math.abs(py - W / 2) < GOAL_W / 2 + 1.2) {
                    // Step across onto the ball's path rather than back to the line.
                    const sp = hyp(b.vx, b.vy);
                    const ux = b.vx / sp;
                    const uy = b.vy / sp;
                    const along = Math.max(0, (p.x - b.x) * ux + (p.y - b.y) * uy);
                    let cx = b.x + ux * along;
                    let cy = b.y + uy * along;
                    if ((cx - gx) * ad < 0.3) {
                        cx = gx + ad * 0.3;
                        cy = py;
                    }
                    // Only a real stretch counts as a dive; a shot at the keeper is easier.
                    p.diving = hyp(cx - p.x, cy - p.y) > 0.9;
                    return seek(p, cx, cy, 5.4);
                }
            }
        }

        // A dribbler bearing down in the box: come out and smother it.
        const owner = s.carrier >= 0 ? s.players[s.carrier] : null;
        if (owner && owner.team !== p.team && inBox(p.team, b.x, b.y) && hyp(b.x - p.x, b.y - p.y) < 5) return seek(p, b.x, b.y, 6);

        // Loose ball in the box and nobody nearer: come and claim it.
        if (s.carrier < 0 && inBox(p.team, b.x, b.y) && hyp(b.vx, b.vy) < 9) {
            const mine = hyp(b.x - p.x, b.y - p.y);
            const rival = Math.min(...s.players.filter((q) => q.team !== p.team).map((q) => hyp(b.x - q.x, b.y - q.y)));
            if (mine < rival) return seek(p, b.x, b.y, 6.5);
        }

        // Position on the line from goal centre to ball.
        const dx = b.x - gx;
        const dy = b.y - W / 2;
        const d = hyp(dx, dy) || 1;
        const r = clamp(d * 0.16, 0.6, 3.2);
        seek(p, gx + (dx / d) * r, W / 2 + (dy / d) * Math.min(r, GOAL_W / 2), 4.5);
    }

    function keepers(s) {
        const b = s.ball;
        if (s.held) return;
        for (const p of s.players) {
            if (p.role !== "GK" || (b.last === p.id && s.t - b.kickAt < 0.5)) continue;
            // Back-pass rule: no handling a ball a teammate deliberately kicked.
            const last = s.players[b.last];
            if (last && last !== p && last.team === p.team && b.lastAt === b.kickAt) continue;
            if (!inBox(p.team, b.x, b.y)) continue;
            const reach = p.diving ? 1.45 : 1.0;
            if (hyp(b.x - p.x, b.y - p.y) > reach || b.z > 2.5) continue;
            const sp = hyp(b.vx, b.vy);
            const owner = s.carrier >= 0 ? s.players[s.carrier] : null;
            if (owner && owner.team !== p.team && sp < 10) {
                // Diving at a dribbler's feet: a try every half second.
                if ((p.smotherAt || 0) < s.t) {
                    p.smotherAt = s.t + 0.5;
                    if (s.rand() < 0.55) hold(s, p);
                }
                continue;
            }
            if (sp < 6) {
                hold(s, p);
                continue;
            }
            if (p.saveTried === b.kickAt) continue;
            p.saveTried = b.kickAt;
            // How far the ball's path passes from his body, as a share of his reach:
            // at him he usually keeps it out, at full stretch it often beats him.
            const stretch = clamp(Math.abs((p.x - b.x) * b.vy - (p.y - b.y) * b.vx) / sp / reach, 0, 1);
            // From range the keeper has longer to set, so distance helps him.
            const range = clamp((hyp(b.fromX - p.x, b.fromY - p.y) - 12) * 0.022, 0, 0.32);
            // A header from a cross comes down and late, so it is harder to hold.
            const save = clamp(1.5 - Math.max(0, sp - 12) / 30 - stretch * 0.55 + range + (p.diving ? 0 : 0.1) - (b.header ? 0.12 : 0), 0.15, 0.95);
            if (s.rand() > save) {
                // Fingertips: half the time that turns it round the post, half
                // the time it still goes in.
                if (s.rand() < 0.5) {
                    const side = b.y < p.y ? -1 : 1;
                    b.vx *= 0.75;
                    b.vy = side * (Math.abs(b.vy) + 7);
                    b.vz = 1 + s.rand() * 2;
                    b.last = p.id;
                    b.lastAt = s.t;
                    s.events.push({ type: "save", id: p.id, won: true, tip: true });
                    continue;
                }
                b.vx *= 0.85;
                b.vy *= 0.85;
                s.events.push({ type: "save", id: p.id, won: false });
                continue;
            }
            if (sp < 17 && s.rand() < 0.7) hold(s, p);
            else {
                // Parry away from goal.
                const ad = attackDir(p.team);
                b.vx = ad * Math.abs(b.vx) * 0.35 + ad * 2;
                b.vy = b.vy * 0.4 + (s.rand() - 0.5) * 10;
                b.vz = 2 + s.rand() * 2;
                b.last = p.id;
                b.lastAt = s.t;
                s.pass = null;
            }
            s.events.push({ type: "save", id: p.id, won: true });
        }
    }

    function hold(s, p) {
        const b = s.ball;
        s.held = { id: p.id, until: s.t + 1.1 };
        b.vx = b.vy = b.vz = 0;
        b.last = p.id;
        b.lastAt = s.t;
        s.carrier = -1;
        s.pass = null;
        s.events.push({ type: "catch", id: p.id });
    }

    /* ---------- Movement ---------- */

    function move(s, p) {
        let ax = p.dvx - p.vx;
        let ay = p.dvy - p.vy;
        const a = hyp(ax, ay);
        const lim = (p.role === "GK" ? 16 : ACCEL) * DT;
        if (a > lim) {
            ax = (ax / a) * lim;
            ay = (ay / a) * lim;
        }
        p.vx += ax;
        p.vy += ay;
        p.x = clamp(p.x + p.vx * DT, -2, L + 2);
        p.y = clamp(p.y + p.vy * DT, -2, W + 2);
        const sp = hyp(p.vx, p.vy);
        if (sp > 0.4) {
            const want = Math.atan2(p.vy, p.vx);
            let d = want - p.face;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            const lim2 = TURN * DT;
            p.face += clamp(d, -lim2, lim2);
        }
    }

    function separate(s) {
        const ps = s.players;
        for (let i = 0; i < ps.length; i++) {
            for (let j = i + 1; j < ps.length; j++) {
                const a = ps[i];
                const c = ps[j];
                const dx = c.x - a.x;
                const dy = c.y - a.y;
                const d = hyp(dx, dy);
                const min = R_PLAYER * 2;
                if (d >= min || d === 0) continue;
                // Keepers stand their ground: whoever runs into one is moved instead.
                const overlap = min - d;
                const wa = a.role === "GK" ? 0 : c.role === "GK" ? 1 : 0.5;
                a.x -= (dx / d) * overlap * wa;
                a.y -= (dy / d) * overlap * wa;
                c.x += (dx / d) * overlap * (1 - wa);
                c.y += (dy / d) * overlap * (1 - wa);
            }
        }
    }

    /* ---------- Dribbling ---------- */

    function touches(s) {
        const b = s.ball;
        if (s.held) return;
        if (b.z > 0.8) return;
        let best = null;
        let bestD = Infinity;
        const bsp = hyp(b.vx, b.vy);
        for (const p of s.players) {
            if (p.stun > 0 || p.role === "GK") continue;
            const mine = s.carrier === p.id;
            // The player on the ball can redirect it as soon as they change direction.
            const want = hyp(p.dvx, p.dvy);
            const turning = mine && want > 1 && (bsp < 1 || (p.dvx * b.vx + p.dvy * b.vy) / (want * bsp) < 0.88);
            if (p.touchCd > 0 && !(turning && s.t - b.lastAt > 0.1)) continue;
            const d = hyp(b.x - p.x, b.y - p.y);
            if (d > (mine ? 1.6 : REACH)) continue;
            // Defenders win the ball by tackling, not by walking into it.
            const owner = s.carrier >= 0 ? s.players[s.carrier] : null;
            if (owner && owner.team !== p.team) continue;
            if (d < bestD) {
                bestD = d;
                best = p;
            }
        }
        if (!best) return;
        const p = best;

        const sp = hyp(p.vx, p.vy);
        const want = hyp(p.dvx, p.dvy);
        const fx = Math.cos(p.face);
        const fy = Math.sin(p.face);
        if (want < 1) {
            // Standing: kill the ball and keep it at the feet.
            const tx = p.x + fx * 0.55;
            const ty = p.y + fy * 0.55;
            b.vx = (tx - b.x) * 5;
            b.vy = (ty - b.y) * 5;
            b.vz = 0;
            p.touchCd = 0.06;
        } else {
            // Push it the way the player wants to go, to a set distance ahead:
            // close when jogging, a longer knock-on when sprinting.
            const ux = p.dvx / want;
            const uy = p.dvy / want;
            const lead = p.sprinting ? 1.4 : 0.8;
            const along = (b.x - p.x) * ux + (b.y - p.y) * uy;
            const side = (b.x - p.x) * -uy + (b.y - p.y) * ux;
            const pace = Math.max(sp, want * 0.6);
            // Too far ahead: a softer touch lets the player catch up.
            const push = Math.max(0, pace + clamp((lead - along) * 2.4, -3, 3));
            b.vx = ux * push + uy * side * 3;
            b.vy = uy * push - ux * side * 3;
            b.vz = 0;
            p.touchCd = p.sprinting ? 0.28 : 0.2;
        }
        if (b.last !== p.id) {
            s.events.push({ type: "control", id: p.id });
            p.gotAt = s.t;
            const before = s.players[b.last];
            // The Rivals win it and the player you control is far away: switch
            // to whoever on your side is nearest the ball.
            if (p.team === 1 && (!before || before.team === 0)) {
                const me = s.players[s.user];
                if (hyp(b.x - me.x, b.y - me.y) > 8) {
                    const q = s.players.filter((o) => o.team === 0 && o.role !== "GK").reduce((a, o) => (hyp(b.x - o.x, b.y - o.y) < hyp(b.x - a.x, b.y - a.y) ? o : a));
                    setUser(s, q);
                }
            }
        }
        b.last = p.id;
        b.lastAt = s.t;
        s.carrier = p.id;
        if (s.pass && s.pass.to === p.id) s.pass = null;
        if (p.team === 0 && p.id !== s.user) setUser(s, p);
    }

    function updateCarrier(s) {
        if (s.carrier < 0) return;
        const p = s.players[s.carrier];
        const b = s.ball;
        // Sprint touches knock it a few metres ahead; that still counts as on the ball.
        if (s.t - b.lastAt > 0.9 || hyp(b.x - p.x, b.y - p.y) > 3.6 || b.last !== p.id) s.carrier = -1;
    }

    /* ---------- Ball ---------- */

    function ballPhysics(s) {
        const b = s.ball;
        b.px = b.x;
        b.py = b.y;
        if (s.held) {
            const k = s.players[s.held.id];
            b.x = k.x + Math.cos(k.face) * 0.35;
            b.y = k.y + Math.sin(k.face) * 0.35;
            b.z = 0.9;
            b.vx = b.vy = b.vz = 0;
            return;
        }
        b.x += b.vx * DT;
        b.y += b.vy * DT;
        b.z += b.vz * DT;
        if (b.z > 0 || b.vz > 0) {
            b.vz -= G * DT;
            const drag = 1 - 0.06 * DT;
            b.vx *= drag;
            b.vy *= drag;
        }
        if (b.z <= 0) {
            b.z = 0;
            if (b.vz < -1.5) {
                b.vz = -b.vz * 0.45;
                b.vx *= 0.82;
                b.vy *= 0.82;
            } else b.vz = 0;
        }
        if (b.z === 0 && b.vz === 0) {
            const sp = hyp(b.vx, b.vy);
            if (sp > 0) {
                const ns = Math.max(0, sp - (ROLL_A + ROLL_K * sp) * DT);
                b.vx *= ns / sp;
                b.vy *= ns / sp;
            }
        }
        posts(s);
    }

    function posts(s) {
        const b = s.ball;
        for (const gx of [0, L]) {
            for (const py of [W / 2 - GOAL_W / 2, W / 2 + GOAL_W / 2]) {
                if (b.z > GOAL_H) continue;
                const dx = b.x - gx;
                const dy = b.y - py;
                const d = hyp(dx, dy);
                const min = 0.07 + R_BALL;
                if (d >= min || d === 0) continue;
                const nx = dx / d;
                const ny = dy / d;
                const vn = b.vx * nx + b.vy * ny;
                if (vn < 0) {
                    b.vx -= 1.6 * vn * nx;
                    b.vy -= 1.6 * vn * ny;
                    s.events.push({ type: "post" });
                }
                b.x = gx + nx * min;
                b.y = py + ny * min;
            }
            // Crossbar: a shot crossing the line just at bar height bounces out.
            const crossed = (b.px - gx) * (b.x - gx) <= 0 && b.px !== gx;
            if (crossed && Math.abs(b.y - W / 2) < GOAL_W / 2 && Math.abs(b.z - GOAL_H) < 0.14) {
                b.x = b.px;
                b.vx *= -0.5;
                b.vz = -Math.abs(b.vz) * 0.5;
                s.events.push({ type: "post" });
            }
        }
    }

    /* ---------- Rules: goals and restarts ---------- */

    function rules(s) {
        const b = s.ball;
        if (s.held) return;
        const inMouth = Math.abs(b.y - W / 2) < GOAL_W / 2 && b.z < GOAL_H;
        if (b.px <= L && b.x > L && inMouth) return goal(s, 0);
        if (b.px >= 0 && b.x < 0 && inMouth) return goal(s, 1);

        if (b.y < 0 || b.y > W) {
            const team = lastTeam(s) === 0 ? 1 : 0;
            return restart(s, "Throw-in", team, clamp(b.x, 1, L - 1), b.y < 0 ? 0.3 : W - 0.3);
        }
        if (b.x < 0 || b.x > L) {
            const defending = b.x > L ? 1 : 0;
            const gx = goalX(defending);
            if (lastTeam(s) === defending) {
                return restart(s, "Corner", 1 - defending, gx === 0 ? 0.5 : L - 0.5, b.y < W / 2 ? 0.5 : W - 0.5);
            }
            return restart(s, "Goal kick", defending, gx + attackDir(defending) * 4, W / 2);
        }
    }

    function lastTeam(s) {
        const p = s.players[s.ball.last];
        return p ? p.team : 0;
    }

    function goal(s, team) {
        s.score[team] += 1;
        const b = s.ball;
        // Let it sit in the net.
        b.x = team === 0 ? L + GOAL_D * 0.7 : -GOAL_D * 0.7;
        b.vx = b.vy = b.vz = 0;
        b.z = 0.3;
        s.events.push({ type: "goal", team, scorer: b.last });
        s.flash = { text: "Goal!", team, until: s.t + 2.4 };
        s.carrier = -1;
        s.pass = null;
        s.pause = 2.4;
        s.after = (st) => kickoff(st, 1 - team);
    }

    function restart(s, label, team, x, y) {
        const b = s.ball;
        b.vx = b.vy = b.vz = 0;
        b.z = 0;
        s.carrier = -1;
        s.pass = null;
        s.flash = { text: label, until: s.t + 1.4 };
        s.events.push({ type: "out", label, team });
        s.pause = 0.9;
        s.after = (st) => {
            b.x = x;
            b.y = y;
            if (label === "Goal kick") {
                const k = st.players.find((p) => p.team === team && p.role === "GK");
                k.x = x;
                k.y = y;
                k.face = team === 0 ? 0 : Math.PI;
                st.held = { id: k.id, until: st.t + 0.8 };
                return;
            }
            const pool = st.players.filter((p) => p.team === team && p.role !== "GK");
            const taker = pool.reduce((a, c) => (hyp(c.x - x, c.y - y) < hyp(a.x - x, a.y - y) ? c : a));
            // The taker stands behind the ball facing infield and plays it with
            // pass, lob or shoot; until then the ball is dead.
            const inward = label === "Corner" ? norm(L / 2 - x, W / 2 - y) : { x: 0, y: y < W / 2 ? 1 : -1 };
            st.setPiece = { kind: label, team, x, y, taker: taker.id, inward, at: st.t };
            taker.x = x - inward.x * 0.6;
            taker.y = y - inward.y * 0.6;
            taker.vx = taker.vy = 0;
            taker.face = Math.atan2(inward.y, inward.x);
            taker.aim = inward;
            for (const p of st.players) p.spot = null;
            if (label === "Corner") lineUpCorner(st, team, y, taker);
            else {
                // Two teammates come short for the throw.
                const ad = attackDir(team);
                const near = pool.filter((p) => p !== taker).sort((a, c) => hyp(a.x - x, a.y - y) - hyp(c.x - x, c.y - y));
                const spots = [
                    { x: x - ad * 5, y: y + inward.y * 5 },
                    { x: x + ad * 8, y: y + inward.y * 4 },
                ];
                near.slice(0, 2).forEach((p, i) => (p.spot = { x: clamp(spots[i].x, 3, L - 3), y: spots[i].y }));
            }
            if (team === 0) setUser(st, taker);
        };
    }

    // Corner routine: attackers into the box, defenders marking the six-yard line.
    function lineUpCorner(s, team, y, taker) {
        const ad = attackDir(team);
        const gx = goalX(1 - team);
        const side = y < W / 2 ? -1 : 1;
        const attack = [
            { x: gx - ad * 7, y: W / 2 + side * 0.5 },
            { x: gx - ad * 4.5, y: W / 2 + side * 2 },
            { x: gx - ad * 9.5, y: W / 2 - side * 3 },
        ];
        const mark = [
            { x: gx - ad * 4.5, y: W / 2 + side * 1 },
            { x: gx - ad * 6, y: W / 2 - side * 1.5 },
            { x: gx - ad * 8.5, y: W / 2 + side * 0.5 },
            { x: gx - ad * 13, y: W / 2 - side * 4 },
        ];
        const put = (p, at) => {
            p.x = at.x;
            p.y = at.y;
            p.vx = p.vy = 0;
            p.spot = at;
        };
        const mates = s.players.filter((p) => p.team === team && p.role !== "GK" && p !== taker);
        // The deepest player stays back.
        mates.sort((a, c) => (a.role === "DF" ? 1 : 0) - (c.role === "DF" ? 1 : 0));
        mates.forEach((p, i) => put(p, attack[i] || { x: L / 2 + ad * 6, y: W / 2 }));
        s.players.filter((p) => p.team !== team && p.role !== "GK").forEach((p, i) => put(p, mark[i % mark.length]));
    }

    // While a set piece waits: the ball is dead, the taker is still and the
    // other side keeps its distance.
    function holdSetPiece(s) {
        const sp = s.setPiece;
        const b = s.ball;
        b.x = sp.x;
        b.y = sp.y;
        b.z = 0;
        b.vx = b.vy = b.vz = 0;
        b.px = b.x;
        b.py = b.y;
        const room = sp.kind === "Corner" ? 8 : 3;
        for (const p of s.players) {
            if (p.team === sp.team) continue;
            const d = hyp(p.x - sp.x, p.y - sp.y);
            if (d < room) {
                const n = d > 0.01 ? norm(p.x - sp.x, p.y - sp.y) : sp.inward;
                p.x = sp.x + n.x * room;
                p.y = sp.y + n.y * room;
            }
        }
    }

    const api = { create, step, DT, L, W, GOAL_W, GOAL_H, GOAL_D, BOX_D, BOX_W, R_PLAYER, R_BALL, REACH, TEAMS, speedFor, rollDist };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.MatchSim = api;
})(typeof window !== "undefined" ? window : globalThis);
