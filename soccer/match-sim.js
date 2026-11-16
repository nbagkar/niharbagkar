/* Five-a-side: the match simulation. Pure maths, no DOM, so Node can run it
   headlessly. Units are metres and seconds. x runs along the pitch (team 0
   attacks +x, towards the right-hand goal), y runs across it.

   Prototype scope (milestone 1): your five against two defenders and a
   keeper. Dribbling is a series of touches rather than a ball glued to the
   feet, so tackles and loose balls come out of the physics. */
(function (root) {
    "use strict";

    // Pitch sizes: the five-a-side cage, and a full-size pitch for eleven a
    // side (FIFA's recommended 105 by 68, with its real boxes and goal).
    const PITCHES = {
        five: { L: 64, W: 40, GOAL_W: 6, GOAL_H: 2.2, BOX_D: 11, BOX_W: 22, SIX_D: 4, SIX_W: 10, SPOT: 8, CIRCLE: 6 },
        eleven: { L: 105, W: 68, GOAL_W: 7.32, GOAL_H: 2.44, BOX_D: 16.5, BOX_W: 40.32, SIX_D: 5.5, SIX_W: 18.32, SPOT: 11, CIRCLE: 9.15 },
    };
    // The current match's pitch. Only one match runs at a time, so these are
    // set by create() and again at the start of every step.
    let L, W, GOAL_W, GOAL_H, BOX_D, BOX_W, SIX_D, SIX_W, SPOT, CIRCLE;
    const GOAL_D = 1.6;
    function usePitch(size) {
        ({ L, W, GOAL_W, GOAL_H, BOX_D, BOX_W, SIX_D, SIX_W, SPOT, CIRCLE } = PITCHES[size] || PITCHES.five);
    }
    usePitch("five");
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

    // The clubs are made up, and so are their players. rating is the squad's
    // average; away is the kit worn when the two home kits would clash.
    const CLUBS = [
        { id: "nbfc", name: "NB FC", short: "NBF", kit: "#1ef2c8", trim: "#04342c", away: "#f4f4f5", rating: 80, formation: "4-3-3" },
        { id: "rivals", name: "Rivals", short: "RIV", kit: "#ff2d87", trim: "#3a0619", away: "#facc15", rating: 79, formation: "4-4-2" },
        { id: "harbor", name: "Harbor City", short: "HAR", kit: "#3b82f6", trim: "#0b1f4a", away: "#f4f4f5", rating: 84, formation: "4-3-3" },
        { id: "solana", name: "Real Solana", short: "SOL", kit: "#f59e0b", trim: "#4a2c02", away: "#1f2937", rating: 82, formation: "4-4-2" },
        { id: "kestrel", name: "Kestrel Rovers", short: "KES", kit: "#ef4444", trim: "#450a0a", away: "#f4f4f5", rating: 77, formation: "4-4-2" },
        { id: "ironvale", name: "Iron Vale", short: "IRV", kit: "#e5e7eb", trim: "#111827", away: "#111827", rating: 75, formation: "4-4-2" },
        { id: "monteazul", name: "Monte Azul", short: "MAZ", kit: "#8b5cf6", trim: "#2e1065", away: "#fde68a", rating: 86, formation: "4-3-3" },
        { id: "northbridge", name: "Northbridge Athletic", short: "NTH", kit: "#f97316", trim: "#431407", away: "#0ea5e9", rating: 73, formation: "4-3-3" },
    ];
    // The two sides of the current match (see usePitch: one match at a time).
    const TEAMS = [Object.assign({}, CLUBS[0]), Object.assign({}, CLUBS[1])];

    const SURNAMES = ("Okafor Lindqvist Moreau Tanaka Alvarez Novak Haddad Byrne Castell Duarte Eze Fontaine Grieve Halvorsen Ibarra Jansen " +
        "Kovac Laurent Mbeki Nakamura Oyelaran Petrov Quintero Rahimi Sorensen Tavares Ueda Varga Whitlock Xavier Yilmaz Zubiri Ashby Brandt " +
        "Coelho Dimitrov Ekstrom Farrow Galvez Hartley Iwata Juarez Keane Lombardi Marlowe Nkemelu Ortega Pryce Rios Salako Thorne Urquhart " +
        "Velasco Wendt Yamada Zeller Adeyemi Bergstrom Cardoso Delacroix Esposito Fitzroy Gashi Holloway Iliev Jovic Kimura Lachance").split(" ");

    // How each position's attributes sit around the club's rating.
    const SHAPES = {
        GK: { pac: -22, sho: -45, pas: -12, def: -30, gk: 3 },
        CB: { pac: -6, sho: -22, pas: -6, def: 6 },
        LB: { pac: 4, sho: -16, pas: -1, def: 2 },
        RB: { pac: 4, sho: -16, pas: -1, def: 2 },
        CDM: { pac: -3, sho: -9, pas: 3, def: 4 },
        CM: { pac: 0, sho: -3, pas: 5, def: -4 },
        LM: { pac: 6, sho: 0, pas: 3, def: -12 },
        RM: { pac: 6, sho: 0, pas: 3, def: -12 },
        LW: { pac: 8, sho: 2, pas: 1, def: -22 },
        RW: { pac: 8, sho: 2, pas: 1, def: -22 },
        ST: { pac: 4, sho: 6, pas: -3, def: -28 },
    };

    // Shares of pace, shooting, passing and defending in a position's overall.
    const WEIGHTS = {
        CB: [0.2, 0, 0.2, 0.6], LB: [0.35, 0, 0.25, 0.4], RB: [0.35, 0, 0.25, 0.4], CDM: [0.2, 0, 0.35, 0.45],
        CM: [0.15, 0.15, 0.5, 0.2], LM: [0.35, 0.2, 0.4, 0.05], RM: [0.35, 0.2, 0.4, 0.05],
        LW: [0.4, 0.3, 0.3, 0], RW: [0.4, 0.3, 0.3, 0], ST: [0.3, 0.45, 0.25, 0],
    };

    function hash(text) {
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
        return h >>> 0;
    }

    function kitClash(a, b) {
        const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        const [x, y] = [rgb(a), rgb(b)];
        return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 110;
    }

    // How far an attribute sits from an ordinary 78, as a multiplier: 1 at 78,
    // `per` more for each point above. Five-a-side ignores attributes, so the
    // balance tuned there is untouched.
    function attr(s, p, key, per) {
        return s.size === "eleven" && p.attrs ? 1 + (p.attrs[key] - 78) * per : 1;
    }

    // A club's eleven: the same names and numbers every match.
    // The bench: one for each line, a little below the first eleven.
    const BENCH = [
        { pos: "GK", num: 12 }, { pos: "CB", num: 13 }, { pos: "CM", num: 14 }, { pos: "RW", num: 15 }, { pos: "ST", num: 16 },
    ];

    function squad(club, spots) {
        const rand = rng(hash(club.id));
        const used = new Set();
        const star = 6 + Math.floor(rand() * 5);
        const first = spots.filter((d) => !d.bench).length;
        return spots.map((d, i) => {
            let name;
            do name = SURNAMES[Math.floor(rand() * SURNAMES.length)];
            while (used.has(name));
            used.add(name);
            const initial = "ABCDEFGHJKLMNOPRSTVY"[Math.floor(rand() * 20)];
            const shape = SHAPES[d.pos] || SHAPES.CM;
            const lift = i === star ? 6 : i >= first ? -3 : 0;
            const at = (key) => clamp(Math.round(club.rating + (shape[key] || 0) + lift + (rand() - 0.5) * 8), 30, 97);
            const attrs = { pac: at("pac"), sho: at("sho"), pas: at("pas"), def: at("def"), gk: d.pos === "GK" ? at("gk") : 20 };
            // Overall: the attributes that matter for the position.
            const w = WEIGHTS[d.pos] || WEIGHTS.CM;
            const ovr = d.pos === "GK" ? attrs.gk : Math.round(attrs.pac * w[0] + attrs.sho * w[1] + attrs.pas * w[2] + attrs.def * w[3]);
            return { name: `${initial}. ${name}`, attrs, ovr, pos: d.pos, num: d.num };
        });
    }

    // NB FC's number nine is the site's owner.
    function captain(club, list, spots) {
        if (club.id !== "nbfc") return list;
        const st = spots.findIndex((d) => d.pos === "ST");
        const i = st >= 0 ? st : Math.max(0, spots.findIndex((d) => d.role === "FW"));
        list[i].name = "N. Bagkar";
        return list;
    }

    // Home spots as fractions of the pitch, team 0 attacking right (so its
    // left side is the top of the screen).
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

    // Eleven a side: formations for a side attacking right; the other side
    // gets the mirror image. pos is the position's usual abbreviation.
    const BACK_FOUR = [
        { role: "GK", pos: "GK", num: 1, hx: 0.025, hy: 0.5 },
        { role: "DF", pos: "LB", num: 3, hx: 0.2, hy: 0.14 },
        { role: "DF", pos: "CB", num: 5, hx: 0.17, hy: 0.38 },
        { role: "DF", pos: "CB", num: 4, hx: 0.17, hy: 0.62 },
        { role: "DF", pos: "RB", num: 2, hx: 0.2, hy: 0.86 },
    ];
    const FORMATIONS = {
        "4-4-2": BACK_FOUR.concat([
            { role: "MF", pos: "LM", num: 11, hx: 0.4, hy: 0.15 },
            { role: "MF", pos: "CM", num: 8, hx: 0.36, hy: 0.41 },
            { role: "MF", pos: "CM", num: 6, hx: 0.36, hy: 0.59 },
            { role: "MF", pos: "RM", num: 7, hx: 0.4, hy: 0.85 },
            { role: "FW", pos: "ST", num: 9, hx: 0.56, hy: 0.42 },
            { role: "FW", pos: "ST", num: 10, hx: 0.53, hy: 0.6 },
        ]),
        "4-3-3": BACK_FOUR.concat([
            { role: "MF", pos: "CDM", num: 6, hx: 0.32, hy: 0.5 },
            { role: "MF", pos: "CM", num: 8, hx: 0.4, hy: 0.33 },
            { role: "MF", pos: "CM", num: 10, hx: 0.4, hy: 0.67 },
            { role: "FW", pos: "LW", num: 11, hx: 0.56, hy: 0.16 },
            { role: "FW", pos: "ST", num: 9, hx: 0.6, hy: 0.5 },
            { role: "FW", pos: "RW", num: 7, hx: 0.56, hy: 0.84 },
        ]),
    };

    function lineup(opts) {
        if (opts.size !== "eleven") return LINEUP;
        const side = (form, team) =>
            (FORMATIONS[form] || FORMATIONS["4-3-3"]).map((d) =>
                Object.assign({}, d, { team, hx: team ? 1 - d.hx : d.hx, hy: team ? 1 - d.hy : d.hy }));
        return side(opts.formation, 0).concat(side(opts.rivalFormation || "4-4-2", 1));
    }

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

    // How good the Rivals are. Normal is the balance tuned on real matches;
    // the others move their pace, tackling, keeping and decisions around it.
    const LEVELS = {
        easy: { pace: 0.9, tackle: 0.6, save: -0.12, think: 0.45 },
        normal: { pace: 1, tackle: 1, save: 0, think: 0.25 },
        hard: { pace: 1.06, tackle: 1.3, save: 0.06, think: 0.15 },
    };
    // Sideways acceleration of a finesse shot, m/s².
    const CURL = 7;
    // What a keeper loses against a bending shot, and per metre he has to
    // cover to reach a shot (eleven a side).
    const TUNE = { CURL_EDGE: 0.12, NEED: 0.12 };
    // How often an AI player meets a cross with his head, free or marked.
    const HEAD_FREE = 0.55;
    const HEAD_MARKED = 0.25;
    // A half lasts this many real seconds unless create() is told otherwise.
    const HALF = 180;

    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const hyp = Math.hypot;

    const blankStats = () => ({ shots: 0, onTarget: 0, passes: 0, passesOk: 0, tackles: 0, tacklesWon: 0, saves: 0, corners: 0, poss: 0, fouls: 0, offsides: 0, yellows: 0, reds: 0 });

    function create(seed, opts) {
        opts = opts || {};
        const size = opts.size === "eleven" ? "eleven" : "five";
        usePitch(size);
        const clubs = [CLUBS.find((c) => c.id === opts.club) || CLUBS[0], CLUBS.find((c) => c.id === opts.rival) || CLUBS[1]];
        if (clubs[1] === clubs[0]) clubs[1] = CLUBS[clubs[0] === CLUBS[1] ? 0 : 1];
        TEAMS[0] = Object.assign({}, clubs[0]);
        TEAMS[1] = Object.assign({}, clubs[1]);
        // Kits too alike to tell apart: the away side changes.
        if (kitClash(TEAMS[0].kit, TEAMS[1].kit)) TEAMS[1].kit = TEAMS[1].away;
        const roster = lineup(Object.assign({}, opts, { rivalFormation: clubs[1].formation }));
        const bench = [[], []];
        const squads = [0, 1].map((t) => {
            const spots = roster.filter((d) => d.team === t);
            const all = squad(clubs[t], size === "eleven" ? spots.concat(BENCH.map((d) => Object.assign({ bench: true }, d))) : spots);
            bench[t] = all.splice(spots.length);
            return captain(clubs[t], all, spots).map((q) => ({ name: q.name, attrs: q.attrs, ovr: q.ovr }));
        });
        const seen = [0, 0];
        // The person starts on the centre forward.
        const fw = (team) => {
            const st = roster.findIndex((d) => d.team === team && d.pos === "ST");
            return st >= 0 ? st : roster.findIndex((d) => d.team === team && d.role === "FW");
        };
        const s = {
            t: 0,
            size,
            formation: opts.formation || null,
            clubs: clubs.map((c) => c.id),
            // Against a friend both sides are people, so the Rivals get no level.
            versus: !!opts.versus,
            level: !opts.versus && LEVELS[opts.level] ? opts.level : "normal",
            halfLen: opts.half || HALF,
            half: 1,
            // 0 in the first half (NB FC attack right), 1 after the change of ends.
            ends: 0,
            // Seconds played in this half; it stops while the ball is dead after a goal.
            clock: 0,
            // "play", "halftime" or "full".
            phase: "play",
            stats: [blankStats(), blankStats()],
            tally: { pass: null, shot: null },
            // Substitutes waiting, and how many changes each side has made (five allowed).
            bench,
            subs: [0, 0],
            // A cup tie: level after ninety minutes means extra time, then penalties.
            knockout: !!opts.knockout,
            perLen: opts.half || HALF,
            shootout: null,
            pens: null,
            // The side each person's keeper will dive on a penalty: -1, 0 or 1.
            dive: [0, 0],
            rand: rng(seed || 7),
            score: [0, 0],
            ball: { x: L / 2, y: W / 2, z: 0, vx: 0, vy: 0, vz: 0, last: -1, lastAt: -9, kickAt: -9 },
            players: roster.map((d, id) => Object.assign({}, squads[d.team][seen[d.team]++], {
                id,
                team: d.team,
                role: d.role,
                pos: d.pos || d.role,
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
                // Long-term tiredness: 1 fresh, falling through the match.
                energy: 1,
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
            // The player each side's person controls, or -1 for a side the AI runs.
            // `user` is always NB FC's, for the single-player screen.
            users: [fw(0), opts.versus ? fw(1) : -1],
            user: fw(0),
            carrier: -1,
            pass: null,
            held: null,
            pause: 0,
            after: null,
            flash: null,
            prev: [{}, {}],
            events: [],
            // Match log for tuning from real play: kicks, goals, saves, tackles.
            log: [],
        };
        kickoff(s, 0);
        return s;
    }

    // Which way a side attacks: NB FC go right in the first half, and the
    // teams change ends at half time.
    function attackDir(s, team) {
        return (team ^ (s.ends || 0)) === 0 ? 1 : -1;
    }

    // Formation spots are written for the first half; after the change of
    // ends the whole pitch is mirrored.
    function homeX(s, p) {
        return (s.ends ? 1 - p.hx : p.hx) * L;
    }

    function homeY(s, p) {
        return (s.ends ? 1 - p.hy : p.hy) * W;
    }

    function goalX(s, team) {
        // The goal this team defends.
        return attackDir(s, team) === 1 ? 0 : L;
    }

    function kickoff(s, team) {
        const b = s.ball;
        Object.assign(b, { x: L / 2, y: W / 2, z: 0, vx: 0, vy: 0, vz: 0, last: -1, lastAt: -9, kickAt: -9 });
        for (const p of s.players) {
            if (p.off) continue;
            p.x = homeX(s, p);
            p.y = homeY(s, p);
            // Everyone back in their own half, and the side not kicking off
            // outside the centre circle.
            p.x = attackDir(s, p.team) === 1 ? Math.min(p.x, L / 2 - 1.5) : Math.max(p.x, L / 2 + 1.5);
            if (p.team !== team && hyp(p.x - L / 2, p.y - W / 2) < CIRCLE + 1) p.x = L / 2 - attackDir(s, p.team) * (CIRCLE + 1);
            Object.assign(p, { vx: 0, vy: 0, dvx: 0, dvy: 0, stun: 0, run: null, queued: null, charge: 0, chargeKind: null });
            p.face = attackDir(s, p.team) === 1 ? 0 : Math.PI;
        }
        const fw = striker(s, team);
        fw.x = L / 2 - attackDir(s, team) * 0.7;
        fw.y = W / 2;
        for (const t of [0, 1]) if (human(s, t)) s.users[t] = striker(s, t).id;
        s.user = s.users[0];
        s.carrier = -1;
        s.pass = null;
        s.held = null;
        s.flash = { text: "Kick off", until: s.t + 1.2 };
    }

    function striker(s, team) {
        const on = s.players.filter((p) => p.team === team && !p.off);
        return on.find((p) => p.pos === "ST") || on.find((p) => p.role === "FW") || on.find((p) => p.role !== "GK");
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

    // inp drives NB FC's player; inp2 the Rivals' when a friend plays them.
    function step(s, inp, inp2) {
        usePitch(s.size);
        stepInner(s, [inp || {}, inp2 || {}]);
        count(s);
        for (const e of s.events) {
            if (e.type === "switch" || e.type === "control" || s.log.length > 4000) continue;
            const b = s.ball;
            const k = s.players.find((p) => p.team === 1 && p.role === "GK");
            const by = s.players[e.id];
            s.log.push(Object.assign({ t: +s.t.toFixed(2), bx: +b.x.toFixed(1), by: +b.y.toFixed(1), bz: +b.z.toFixed(1), v: +hyp(b.vx, b.vy).toFixed(1), kx: +k.x.toFixed(1), ky: +k.y.toFixed(1), team: by ? by.team : undefined }, e));
        }
        return s;
    }

    // Match stats from this step's events. A pass counts as completed when a
    // teammate is next to touch it; a shot is on target if it is saved or goes in.
    function count(s) {
        const st = s.stats;
        const tl = s.tally;
        const owner = s.held ? s.players[s.held.id] : s.players[s.carrier];
        if (owner && s.phase === "play" && s.pause <= 0) st[owner.team].poss += DT;
        for (const e of s.events) {
            const p = s.players[e.id];
            if (e.type === "kick") {
                if (e.kind === "shoot") {
                    st[p.team].shots += 1;
                    tl.shot = { team: p.team };
                    tl.pass = null;
                } else {
                    st[p.team].passes += 1;
                    tl.pass = { team: p.team };
                    tl.shot = null;
                }
            } else if (e.type === "control" || e.type === "catch") {
                if (tl.pass && tl.pass.team === p.team) st[p.team].passesOk += 1;
                tl.pass = null;
            } else if (e.type === "save" && e.won) {
                st[p.team].saves += 1;
                if (tl.shot && tl.shot.team !== p.team) st[tl.shot.team].onTarget += 1;
                tl.shot = null;
            } else if (e.type === "goal") {
                if (tl.shot && tl.shot.team === e.team) st[e.team].onTarget += 1;
                tl.shot = tl.pass = null;
            } else if (e.type === "tackle" || e.type === "nick") {
                if (e.type === "tackle" || e.won) st[p.team].tackles += 1;
                if (e.won) st[p.team].tacklesWon += 1;
                tl.pass = null;
            } else if (e.type === "out") {
                if (e.label === "Corner") st[e.team].corners += 1;
                tl.pass = tl.shot = null;
            } else if (e.type === "foul") {
                st[p.team].fouls += 1;
            } else if (e.type === "offside") {
                st[p.team].offsides += 1;
            } else if (e.type === "card") {
                st[p.team][e.color === "red" ? "reds" : "yellows"] += 1;
            }
        }
    }

    // The whistle for half time or full time. A shot already on its way to
    // goal is allowed to finish, for a few seconds at most.
    function checkClock(s) {
        if (s.shootout || s.clock < s.perLen || s.setPiece) return;
        const b = s.ball;
        const sp = hyp(b.vx, b.vy);
        const goalward = sp > 10 && (b.vx > 0 ? L - b.x : b.x) < 26 && Math.abs(b.vx) > sp * 0.6;
        if (goalward && s.clock < s.perLen + 4) return;
        const level = s.score[0] === s.score[1];
        // Ninety minutes, then for a level cup tie two short halves of extra
        // time, then penalties.
        s.phase = s.half === 1 ? "halftime" : s.half === 2 ? (s.knockout && level ? "extra" : "full") : s.half === 3 ? "etbreak" : level ? "pens" : "full";
        const say = { halftime: "Half time", full: "Full time", extra: "Extra time", etbreak: "Half time in extra time", pens: "Penalties" }[s.phase];
        s.flash = { text: say, until: s.t + 1e9 };
        s.carrier = -1;
        s.pass = null;
        for (const p of s.players) Object.assign(p, { vx: 0, vy: 0, dvx: 0, dvy: 0, charge: 0, chargeKind: null, queued: null });
        s.events.push({ type: "whistle", phase: s.phase, score: s.score.slice() });
    }

    // On from a break: the next half or period (the teams change ends and
    // take turns to kick off), or the shootout.
    function resume(s) {
        if (!["halftime", "extra", "etbreak", "pens"].includes(s.phase)) return;
        usePitch(s.size);
        const shoot = s.phase === "pens";
        s.phase = "play";
        s.pause = 0;
        s.after = null;
        s.setPiece = null;
        s.held = null;
        for (const p of s.players) {
            p.spot = null;
            // A breather.
            p.energy = Math.min(1, (p.energy || 1) + 0.07);
            p.stamina = 1;
        }
        if (shoot) return startShootout(s);
        s.half += 1;
        s.ends = (s.half - 1) % 2;
        s.clock = 0;
        s.perLen = s.half <= 2 ? s.halfLen : s.halfLen / 3;
        kickoff(s, (s.half - 1) % 2);
    }

    // The clock's minute at this moment: two halves of 45, extra time of 15 each.
    function minute(s) {
        const base = [0, 45, 90, 105][Math.min(3, s.half - 1)];
        const span = s.half <= 2 ? 45 : 15;
        return Math.min(base + span, Math.floor(base + (s.clock / s.perLen) * span) + 1);
    }

    /* ---------- Penalty shootout ---------- */

    function startShootout(s) {
        s.half = 5;
        s.ends = 0;
        s.shootout = { kicks: [[], []], turn: 0, state: "set" };
        s.carrier = -1;
        s.pass = null;
        nextPen(s);
    }

    // Takers go in order of their shooting.
    function penTaker(s, team) {
        const list = s.players.filter((p) => p.team === team && p.role !== "GK" && !p.off).sort((a, c) => c.attrs.sho - a.attrs.sho || a.id - c.id);
        return list[s.shootout.kicks[team].length % list.length];
    }

    function nextPen(s) {
        const so = s.shootout;
        so.state = "set";
        const team = so.turn;
        restart(s, "Penalty", team, goalX(s, 1 - team) - attackDir(s, team) * SPOT, W / 2, `Penalty ${so.kicks[team].length + 1}`);
    }

    function penResult(s, scored) {
        const so = s.shootout;
        const b = s.ball;
        const team = so.turn;
        so.kicks[team].push(scored);
        so.state = "between";
        b.vx = b.vy = b.vz = 0;
        s.held = null;
        s.events.push({ type: "pen", team, scored });
        const [a, c] = so.kicks.map((k) => k.filter(Boolean).length);
        const [na, nc] = so.kicks.map((k) => k.length);
        // Decided once one side cannot be caught in the first five, or is
        // ahead after the same number of kicks in sudden death.
        const first = Math.max(na, nc) <= 5;
        const over = first ? a > c + (5 - nc) || c > a + (5 - na) : na === nc && a !== c;
        if (over) {
            s.pens = [a, c];
            so.state = "done";
            s.phase = "full";
            s.flash = { text: "Full time", until: s.t + 1e9 };
            s.events.push({ type: "whistle", phase: "full", score: s.score.slice() });
            return;
        }
        s.flash = { text: scored ? "Scored" : "No goal", team, until: s.t + 1.4 };
        so.turn = 1 - team;
        s.pause = 1.5;
        s.after = nextPen;
    }

    /* ---------- Substitutions ---------- */

    // Bring a substitute on for a player: same shirt position, fresh legs.
    function substitute(s, team, outId, benchIndex) {
        const p = s.players[outId];
        const on = s.bench[team] && s.bench[team][benchIndex];
        if (!p || !on || p.team !== team || p.off || s.subs[team] >= 5 || s.shootout) return false;
        s.bench[team].splice(benchIndex, 1);
        Object.assign(p, { name: on.name, attrs: on.attrs, ovr: on.ovr, num: on.num, energy: 1, stamina: 1, yellow: 0 });
        s.subs[team] += 1;
        s.events.push({ type: "sub", id: p.id, team });
        return true;
    }

    // The AI's changes: its two most tired outfield players, once, in the second half.
    function autoSub(s, team) {
        const tired = s.players.filter((p) => p.team === team && p.role !== "GK" && !p.off).sort((a, c) => a.energy - c.energy);
        for (const p of tired.slice(0, 2)) {
            const i = s.bench[team].findIndex((q) => q.pos !== "GK");
            if (i >= 0 && p.energy < 0.8) substitute(s, team, p.id, i);
        }
    }

    // Kept for older callers.
    const secondHalf = resume;

    function human(s, team) {
        return s.users[team] >= 0;
    }

    function stepInner(s, inps) {
        s.events.length = 0;
        if (s.phase !== "play") return s;
        s.t += DT;
        const prevs = s.prev;
        s.prev = inps.map((inp) => Object.assign({}, inp));
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
        if (!s.shootout) s.clock += DT;
        // Facing a penalty, a person picks his keeper's side with up or down.
        for (const t of [0, 1]) s.dive[t] = (inps[t].down ? 1 : 0) - (inps[t].up ? 1 : 0);

        for (const p of s.players) {
            p.touchCd = Math.max(0, p.touchCd - DT);
            p.kickCd = Math.max(0, p.kickCd - DT);
            p.tackleCd = Math.max(0, p.tackleCd - DT);
            p.stun = Math.max(0, p.stun - DT);
        }

        const mine = [];
        for (const t of [0, 1]) {
            if (!human(s, t)) continue;
            const inp = inps[t];
            const prev = prevs[t] || {};
            const pressed = (k) => inp[k] && !prev[k];
            const released = (k) => !inp[k] && prev[k];
            if (pressed("swap")) swap(s, t);
            const me = s.players[s.users[t]];
            control(s, me, inp, pressed, released);
            mine.push(me);
        }
        for (const p of s.players) if (!mine.includes(p)) think(s, p);
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
        if (s.pause <= 0) checkClock(s);
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

        // In a shootout only the taker moves.
        if (s.shootout && !(s.setPiece && s.setPiece.taker === me.id)) {
            me.dvx = me.dvy = 0;
            me.chargeKind = null;
            me.queued = null;
            return;
        }
        const has = s.carrier === me.id;
        const sprint = !!inp.sprint && moving && me.stamina > 0.04;
        // Skill move: a feint and a burst that is hard to tackle for a moment.
        if (pressed("skill") && has && moving && s.t >= (me.feintCd || 0) && me.stamina > 0.12) {
            me.feintUntil = s.t + 0.45;
            me.feintCd = s.t + 1.8;
            me.stamina -= 0.12;
            me.vx += (dx / m) * 3;
            me.vy += (dy / m) * 3;
            s.events.push({ type: "skill", id: me.id });
        }
        let top = sprint ? SPRINT * (me.stamina < 0.25 ? 0.82 : 1) : JOG;
        if (has) top *= 0.9;
        if (me.stun > 0) top *= 0.35;
        me.sprinting = sprint;
        // Tired legs get their breath back more slowly.
        me.stamina = clamp(me.stamina + (sprint ? -0.2 : 0.09 * (0.5 + 0.5 * (me.energy === undefined ? 1 : me.energy))) * DT, 0, 1);

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

        for (const kind of ["pass", "shoot", "lob", "finesse"]) {
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

    function swap(s, team) {
        const b = s.ball;
        // On the ball (or taking a set piece) you keep the player you have.
        if (s.setPiece || s.carrier === s.users[team]) return;
        let best = null;
        let bestD = Infinity;
        for (const p of s.players) {
            if (p.team !== team || p.role === "GK" || p.off || p.id === s.users[team]) continue;
            const d = hyp(p.x - b.x, p.y - b.y);
            if (d < bestD) {
                bestD = d;
                best = p;
            }
        }
        if (best) setUser(s, best);
    }

    function setUser(s, p) {
        if (!human(s, p.team)) return;
        const old = s.players[s.users[p.team]];
        if (old && old !== p) {
            old.chargeKind = null;
            old.charge = 0;
            old.queued = null;
        }
        s.users[p.team] = p.id;
        s.user = s.users[0];
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
        const high = kind === "shoot" || kind === "finesse" ? 2.3 : 1.1;
        return p.kickCd <= 0 && p.stun <= 0 && b.z < high && hyp(b.x - p.x, b.y - p.y) < reach;
    }

    function pickTarget(s, p, dir, maxAngle) {
        let best = null;
        let bestScore = Infinity;
        for (const q of s.players) {
            if (q.team !== p.team || q.id === p.id || q.role === "GK" || q.off) continue;
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
        if (caughtOffside(s, p)) return offside(s, p);
        const dir = aim || { x: Math.cos(p.face), y: Math.sin(p.face) };
        const ad = attackDir(s, p.team);
        let vx;
        let vy;
        let vz = 0;
        const piece = s.setPiece ? s.setPiece.kind : null;
        // A finesse shot is a shot: placed and bent rather than hit hard.
        const finesse = kind === "finesse";
        if (finesse || piece === "Penalty") kind = "shoot";
        b.piece = piece;
        b.curl = 0;
        if (s.shootout && piece === "Penalty") s.shootout.state = "flight";
        // No offside straight from a throw-in, a corner or a goal kick.
        b.exempt = piece === "Throw-in" || piece === "Corner" || !!(s.held && s.held.id === p.id && s.held.goalKick);
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
        } else if (kind === "shoot" && towardGoal(s, p, dir, b) < -0.3) {
            // Turned back towards your own half: no shot at goal, just a hit where you face.
            const speed = 14 + 14 * power;
            vx = dir.x * speed;
            vy = dir.y * speed;
            vz = header ? 0 : 0.5 + power * 2.5;
            s.pass = null;
        } else if (kind === "shoot") {
            const gx = goalX(s, 1 - p.team);
            // Aimed with the stick, or else away from the side the keeper covers.
            const keeper = s.players.find((q) => q.team !== p.team && q.role === "GK");
            const open = keeper && Math.abs(keeper.y - W / 2) > 0.3 ? -Math.sign(keeper.y - W / 2) : b.y < W / 2 ? 1 : -1;
            const sideways = Math.abs(dir.y) > 0.3 ? Math.sign(dir.y) * Math.min(1, Math.abs(dir.y) * 1.3) : open * (0.35 + s.rand() * 0.4);
            const dist = hyp(gx - b.x, W / 2 - b.y);
            // Side-on to goal the strike gets wilder.
            const twist = Math.max(0, 0.3 - towardGoal(s, p, dir, b)) * 1.5;
            let spread = (0.35 + dist * 0.035 + twist + (power > 0.85 ? (power - 0.85) * 6 : 0)) / attr(s, p, "sho", 0.012);
            const tx = gx + ad * 0.3;
            // Headers and volleys are softer than a struck shot along the ground,
            // and so is a finesse shot, which is placed instead.
            const bend = finesse && !header;
            const speed = header ? 14 + 6 * power : bend ? 13 + 10 * power : 15 + 15 * power;
            if (bend) spread *= 0.5;
            let ty = W / 2 + sideways * (GOAL_W / 2 - (bend ? 0.45 : 0.7)) + (s.rand() - 0.5) * 2 * spread;
            let d = hyp(tx - b.x, ty - b.y);
            const t = d / speed;
            if (bend) {
                // It starts outside the post and curls back in: aim wide by
                // what the swerve will bring back over the flight.
                const out = Math.sign(ty - W / 2) || 1;
                b.curl = -out * CURL;
                ty += out * 0.5 * CURL * t * t;
                d = hyp(tx - b.x, ty - b.y);
            }
            // Past 85% power the shot starts to rise; a full bar usually clears the bar.
            const h = 0.2 + power * 1.1 + (power > 0.85 ? (power - 0.85) * 7 : 0) + s.rand() * 0.3;
            // Driven, not chipped: long weak shots skid in along the ground. A
            // free kick is struck up and over the wall and dips.
            const up = piece === "Free kick";
            vz = clamp(((up ? h + 0.5 : h) - b.z + 0.5 * G * t * t) / t, header ? -8 : 0, up ? 9 : 1.5 + power * 4);
            vx = ((tx - b.x) / d) * speed;
            vy = ((ty - b.y) / d) * speed;
            s.pass = null;
        } else if (kind === "pass") {
            const q = pickTarget(s, p, dir, 0.95);
            if (q) {
                let d = hyp(q.x - p.x, q.y - p.y);
                const lead = Math.min(1.2, d / 14);
                let tx = clamp(q.x + q.vx * lead, 1.5, L - 1.5);
                let ty = clamp(q.y + q.vy * lead, 1, W - 1);
                // A teammate running back towards our own goal gets it to feet:
                // leading him there would play it into our own net.
                if ((tx - b.x) * ad < 0 && (tx - goalX(s, p.team)) * ad < 14) {
                    tx = q.x;
                    ty = q.y;
                }
                // A poorer passer's ball drifts off line over distance.
                const slack = Math.max(0, 1 - attr(s, p, "pas", 0.012)) + (s.size === "eleven" ? 0.02 : 0);
                tx += (s.rand() - 0.5) * d * slack;
                ty += (s.rand() - 0.5) * d * slack;
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
            // The AI's crosses from a corner pick a head too; its clearances don't.
            const q = human(s, p.team) || piece === "Corner" ? pickTarget(s, p, dir, 1.2) : null;
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
        b.kicker = p.id;
        b.fromX = b.x;
        b.fromY = b.y;
        b.header = kind === "shoot" && b.z > 1.1;
        // How far each keeper stands from the line of a shot as it is struck:
        // on the big goal, the further he has to go the less likely he keeps it out.
        b.need = 0;
        if (kind === "shoot" && s.size === "eleven") {
            const k = s.players.find((q) => q.team !== p.team && q.role === "GK");
            const sp0 = hyp(vx, vy) || 1;
            if (k) b.need = Math.min(4.5, Math.abs((k.x - b.x) * vy - (k.y - b.y) * vx) / sp0);
        }
        p.kickCd = 0.3;
        p.touchCd = 0.35;
        p.face = Math.atan2(vy, vx);
        s.carrier = -1;
        s.events.push({ type: "kick", kind, id: p.id, power });
        // Offside is judged the moment the ball is played forward to a teammate.
        if (s.size === "eleven") {
            for (const q of s.players) {
                if (q.team !== p.team || q === p) continue;
                q.offAt = kind !== "shoot" && !b.exempt && !q.off && isOffside(s, q) ? s.t : -1;
            }
        }

        // FIFA habit: control follows the pass.
        if (human(s, p.team) && s.pass && s.players[s.pass.to]) setUser(s, s.players[s.pass.to]);
    }

    // How much the player is turned towards the goal they attack: 1 square on,
    // 0 side-on, -1 back to goal. The better of body facing and stick, so pressing
    // up or down to pick a corner still counts as facing the goal.
    function towardGoal(s, p, dir, b) {
        // A header faces the incoming cross; with the stick let go it goes at goal.
        if (b.z > 1.1 && !p.stickHeld) return 1;
        const ad = attackDir(s, p.team);
        return Math.max(Math.cos(p.face) * ad, dir.x * ad);
    }

    // Was this player in an offside position when a teammate played the ball
    // that he is now the first to reach?
    function caughtOffside(s, p) {
        const b = s.ball;
        const from = s.players[b.kicker];
        return s.size === "eleven" && p.offAt === b.kickAt && b.kickAt > 0 && from && from !== p && from.team === p.team && b.last === from.id && b.lastAt === b.kickAt;
    }

    function offside(s, p) {
        p.offAt = -1;
        s.events.push({ type: "offside", id: p.id });
        restart(s, "Free kick", 1 - p.team, clamp(p.x, 2, L - 2), clamp(p.y, 2, W - 2), "Offside");
    }

    function foul(s, p, victim, hard) {
        const b = s.ball;
        s.events.push({ type: "foul", id: p.id, on: victim.id });
        victim.stun = 0.9;
        let text = "Foul";
        // A booking for the bad ones; two make a red.
        if (s.rand() < (hard ? 0.5 : 0.18)) {
            p.yellow = (p.yellow || 0) + 1;
            const red = p.yellow >= 2;
            s.events.push({ type: "card", id: p.id, color: red ? "red" : "yellow" });
            text = red ? "Red card" : "Yellow card";
            if (red) sendOff(s, p);
        }
        const box = inBox(s, p.team, b.x, b.y);
        const card = text === "Foul" ? null : text === "Red card" ? "red" : "yellow";
        if (box) restart(s, "Penalty", victim.team, goalX(s, p.team) + attackDir(s, p.team) * SPOT, W / 2, card ? `Penalty · ${text}` : "Penalty!", card, p.id);
        else restart(s, "Free kick", victim.team, clamp(b.x, 1, L - 1), clamp(b.y, 1, W - 1), text, card, p.id);
    }

    // A sent-off player waits out the match beyond the touchline; his side
    // plays on a man short.
    function sendOff(s, p) {
        p.off = true;
        p.stun = Infinity;
        Object.assign(p, { x: L / 2, y: -40, vx: 0, vy: 0, dvx: 0, dvy: 0, chargeKind: null, charge: 0, queued: null, run: null });
        if (s.users[p.team] === p.id) {
            const b = s.ball;
            const next = s.players.filter((q) => q.team === p.team && q.role !== "GK" && !q.off).reduce((a, q) => (hyp(b.x - q.x, b.y - q.y) < hyp(b.x - a.x, b.y - a.y) ? q : a));
            s.users[p.team] = next.id;
            s.user = s.users[0];
        }
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
        let behind = false;
        if (owner) {
            const ov = hyp(owner.vx, owner.vy);
            behind = ov > 1 && ((p.x - owner.x) * owner.vx + (p.y - owner.y) * owner.vy) / ov < -0.3;
            if (behind) chance *= 0.6;
        }
        if (owner && (owner.feintUntil || 0) > s.t) chance *= 0.4;
        const won = s.rand() < chance * attr(s, p, "def", 0.008);
        // Getting the man: likely when a lunge misses, and from behind even
        // when it gets the ball too.
        if (owner && !soft && hyp(owner.x - p.x, owner.y - p.y) < 1.7) {
            const risk = lunge ? (behind ? (won ? 0.3 : 0.6) : won ? 0 : 0.25) : won ? 0 : behind ? 0.25 : 0.08;
            if (s.rand() < risk) {
                p.stun = 0.5;
                s.events.push({ type, id: p.id, won: false });
                return foul(s, p, owner, lunge && behind);
            }
        }
        if (won) {
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
        if (s.shootout && !(s.setPiece && s.setPiece.taker === p.id)) {
            p.dvx = p.dvy = 0;
            return;
        }
        if (p.stun > 0) {
            p.dvx *= 0.5;
            p.dvy *= 0.5;
            return;
        }
        if (s.held) {
            // The other side's keeper has it: leave his box and wait outside it.
            const k = s.players[s.held.id];
            if (k.team !== p.team) {
                if (inBox(s, k.team, p.x, p.y)) return seek(p, goalX(s, k.team) + attackDir(s, k.team) * (BOX_D + 2), clamp(p.y, 3, W - 3), AI_RUN);
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
            if (s.t - sp.at > 0.9) {
                const ad = attackDir(s, p.team);
                let aim;
                const gx = goalX(s, 1 - p.team);
                const dG = hyp(gx - sp.x, W / 2 - sp.y);
                if (sp.kind === "Penalty") {
                    return kick(s, p, "shoot", 0.55 + s.rand() * 0.25, norm(ad, (s.rand() < 0.5 ? -1 : 1) * (0.7 + s.rand() * 0.5)));
                }
                if (sp.kind === "Free kick" && dG < 27 && Math.abs(sp.y - W / 2) < 16) {
                    return kick(s, p, "shoot", 0.6 + s.rand() * 0.2, norm(ad, (s.rand() < 0.5 ? -1 : 1) * (0.4 + s.rand() * 0.4)));
                }
                if (sp.kind === "Free kick") {
                    const q = passOption(s, p, s.players.filter((o) => o.team !== p.team && o.role !== "GK"));
                    if (q) return kick(s, p, "pass", 0.4, norm(q.x - p.x, q.y - p.y));
                    return kick(s, p, "lob", 0.7, norm(ad, (W / 2 - sp.y) / 30));
                }
                if (sp.kind === "Corner") {
                    // Cross towards the penalty spot, where teammates are lined up.
                    aim = norm(gx - ad * 7 - p.x, W / 2 - p.y);
                } else {
                    // Throw to an open teammate, or else infield and up the line.
                    const q = passOption(s, p, s.players.filter((o) => o.team !== p.team && o.role !== "GK"));
                    aim = q ? norm(q.x - p.x, q.y - p.y) : norm(ad * 0.5, sp.inward.y);
                }
                kick(s, p, sp.kind === "Throw-in" ? "pass" : "lob", 0.6, aim);
            }
            return;
        }
        if (sp && p.spot) return seek(p, p.spot.x, p.spot.y, AI_RUN);
        if (block(s, p)) return;
        if (s.pass && s.pass.to === p.id && s.carrier !== p.id) {
            // A cross dropping onto his head near goal: head it at a corner.
            // He doesn't always get there first: much less often with a defender on him.
            if (b.z > 0.8 && canKick(s, p, "shoot") && hyp(goalX(s, 1 - p.team) - b.x, W / 2 - b.y) < 14 && p.headerTried !== b.kickAt) {
                p.headerTried = b.kickAt;
                const marked = s.players.some((o) => o.team !== p.team && o.role !== "GK" && hyp(o.x - p.x, o.y - p.y) < 1.6);
                if (s.rand() < (marked ? HEAD_MARKED : HEAD_FREE)) {
                    const side = s.rand() < 0.5 ? -1 : 1;
                    return kick(s, p, "shoot", 0.4 + s.rand() * 0.35, norm(attackDir(s, p.team), side * (0.3 + s.rand() * 0.5)));
                }
            }
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
        const ad = attackDir(s, p.team);
        let x = homeX(s, p) + (b.x - L / 2) * 0.5;
        let y = homeY(s, p) + (b.y - W / 2) * 0.3;
        if (s.size === "eleven") {
            // With the ball the side pushes up and spreads; without it, it
            // drops and narrows into a block between ball and goal.
            const c = s.carrier >= 0 ? s.players[s.carrier] : s.held ? s.players[s.held.id] : null;
            const ours = c && c.team === p.team;
            const push = p.role === "DF" ? 6 : p.role === "MF" ? 9 : 10;
            if (c) x += ad * (ours ? push : -push * 0.6);
            y = W / 2 + (y - W / 2) * (ours ? 1.1 : 0.8);
            // Forwards hold the line of the last defender instead of running offside.
            if (p.role === "FW") x = ad > 0 ? Math.min(x, offsideLine(s, p.team) - 0.5) : Math.max(x, offsideLine(s, p.team) + 0.5);
        } else if (p.role === "FW") x = ad > 0 ? Math.max(x, b.x + 6) : Math.min(x, b.x - 6);
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
        const me = human(s, p.team) ? s.players[s.users[p.team]] : null;
        const go = me ? nearest === p && d(p) < d(me) - 1 : nearest === p;
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
        const gx = goalX(s, p.team);
        const d = (q) => hyp(b.x - q.x, b.y - q.y);
        const me = human(s, p.team) ? s.players[s.users[p.team]] : null;
        const mates = s.players.filter((q) => q.team === p.team && q.role !== "GK" && q.stun <= 0 && q !== me);
        const nearest = mates.reduce((a, q) => (d(q) < d(a) ? q : a), mates[0]);
        // You count as the presser only when close and goal-side, not chasing from behind.
        const userPresses = !!me && (d(me) < 2.5 || (d(me) < 7 && (b.x - me.x) * attackDir(s, owner.team) < 0.5));
        if (nearest === p && !userPresses) {
            const g = norm(gx - b.x, W / 2 - b.y);
            seek(p, b.x + g.x * 0.9, b.y + g.y * 0.9, AI_RUN);
            if (d(p) < 1.15 && p.tackleCd <= 0) tackle(s, p, 0.33 * (p.team === 1 ? LEVELS[s.level].tackle : 1));
            return;
        }
        if (s.size === "eleven") {
            // A second man covers a few metres behind the presser.
            const rest = mates.filter((q) => q !== nearest || userPresses);
            const second = rest.reduce((a, q) => (d(q) < d(a) ? q : a), rest[0]);
            if (second === p && d(p) < 18) {
                const g = norm(gx - b.x, W / 2 - b.y);
                return seek(p, b.x + g.x * 5, b.y + g.y * 5, AI_RUN);
            }
        }
        // Mark: share out the other side's outfield players (not the one on the
        // ball) by who is nearest to whose formation spot.
        const markers = mates.filter((q) => userPresses || q !== nearest);
        const targets = s.players.filter((q) => q.team !== p.team && q.role !== "GK" && q !== owner && !q.off);
        const taken = new Set();
        let mine = null;
        for (const m of markers.sort((a, c) => a.id - c.id)) {
            let best = null;
            let bestD = Infinity;
            for (const t of targets) {
                if (taken.has(t)) continue;
                const dd = hyp(t.x - homeX(s, m), t.y - homeY(s, m));
                if (dd < bestD) {
                    bestD = dd;
                    best = t;
                }
            }
            if (best) taken.add(best);
            if (m === p) mine = best;
        }
        if (!mine) return shape(s, p, false);
        // On the big pitch a man is only followed while he is in your zone.
        if (s.size === "eleven" && hyp(mine.x - homeX(s, p) - (b.x - L / 2) * 0.5, mine.y - homeY(s, p)) > 17) return shape(s, p, false);
        const g = norm(gx - mine.x, W / 2 - mine.y);
        seek(p, mine.x + g.x * 1.8, mine.y + g.y * 1.8, AI_RUN);
    }

    // AI on the ball (the Rivals; your own AI players hand the ball to you).
    function carrierThink(s, p) {
        const b = s.ball;
        const ad = attackDir(s, p.team);
        const gx = goalX(s, 1 - p.team);
        const dG = hyp(gx - b.x, W / 2 - b.y);
        const opps = s.players.filter((q) => q.team !== p.team && q.role !== "GK");
        const dist = (q) => hyp(q.x - p.x, q.y - p.y);
        const press = Math.min(...opps.map(dist));
        if (canKick(s, p) && s.t >= (p.decideAt || 0)) {
            p.decideAt = s.t + LEVELS[s.level].think;
            const settled = s.t - (p.gotAt || 0) > 0.3;
            // Shoot: close in, or with a defender closing, or now and then from range.
            if (dG < 16 && Math.abs(b.y - W / 2) < 10 && (dG < 9.5 || (press < 2 && dG < 13) || s.rand() < 0.015)) {
                const aim = norm(ad, (s.rand() < 0.5 ? -1 : 1) * (0.45 + s.rand() * 0.4));
                return kick(s, p, "shoot", 0.45 + s.rand() * 0.32, aim);
            }
            // Pinned in our own box: clear it.
            if (inBox(s, p.team, b.x, b.y) && press < 3) {
                return kick(s, p, "lob", 0.7, norm(ad, b.y < W / 2 ? -0.6 : 0.6));
            }
            // Under pressure, or a teammate clearly better placed: pass.
            const far = s.size === "eleven" && dG > 30;
            if (settled && (press < 2.8 || s.rand() < (far ? 0.3 : 0.08))) {
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
        const ad = attackDir(s, p.team);
        let best = null;
        let bestScore = -Infinity;
        for (const q of s.players) {
            if (q.team !== p.team || q === p || q.role === "GK" || q.off) continue;
            const dx = q.x - p.x;
            const dy = q.y - p.y;
            const d = hyp(dx, dy);
            if (d < 4 || d > (s.size === "eleven" ? 38 : 30) || dx * ad < -4) continue;
            if (s.size === "eleven" && !s.setPiece && isOffside(s, q)) continue;
            // Never back to someone deep in our own box: one missed touch is a goal.
            if ((q.x - goalX(s, p.team)) * ad < 7 && Math.abs(q.y - W / 2) < BOX_W / 2) continue;
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

    // Where an attacker of `team` stops being onside: level with the second
    // last defender, or the ball, or halfway, whichever is furthest forward
    // for the defence. Returns an x.
    function offsideLine(s, team) {
        const ad = attackDir(s, team);
        const xs = s.players.filter((q) => q.team !== team && !q.off).map((q) => q.x * ad).sort((a, c) => c - a);
        const second = xs[1] !== undefined ? xs[1] : L * ad;
        return Math.max(second, s.ball.x * ad, (L / 2) * ad) * ad;
    }

    function isOffside(s, q) {
        const ad = attackDir(s, q.team);
        return q.x * ad > offsideLine(s, q.team) * ad + 0.3;
    }

    function norm(x, y) {
        const d = hyp(x, y) || 1;
        return { x: x / d, y: y / d };
    }

    /* ---------- Keepers ---------- */

    function inBox(s, team, x, y) {
        const gx = goalX(s, team);
        return Math.abs(x - gx) < BOX_D && Math.abs(y - W / 2) < BOX_W / 2;
    }

    function keeperThink(s, p) {
        const b = s.ball;
        const gx = goalX(s, p.team);
        const ad = attackDir(s, p.team);
        p.diving = false;

        if (s.held && s.held.id === p.id) {
            p.dvx = p.dvy = 0;
            // Release once the opponents have cleared the box (or after 3 s regardless).
            const clear = !s.players.some((q) => q.team !== p.team && inBox(s, p.team, q.x, q.y));
            if (s.t > s.held.until && (clear || s.t > s.held.until + 3)) {
                // Roll it to an open teammate with a clear lane; if nobody is free, punt it long.
                const opps = s.players.filter((q) => q.team !== p.team && q.role !== "GK");
                const q = passOption(s, p, opps);
                if (q) kick(s, p, "pass", 0.4, norm(q.x - p.x, q.y - p.y));
                else kick(s, p, "lob", 0.85, norm(ad, (s.rand() - 0.5) * 0.8));
            }
            return;
        }

        // A penalty: on the line until it is struck.
        if (s.setPiece && s.setPiece.kind === "Penalty") return seek(p, gx + ad * 0.3, W / 2, 4);

        // Facing a penalty he has to guess: one side or the other, now and
        // then staying in the middle.
        if (b.piece === "Penalty" && s.t - b.kickAt < 0.9 && b.last !== p.id && (gx - b.x) * b.vx > 0) {
            if (p.guessAt !== b.kickAt) {
                p.guessAt = b.kickAt;
                const r = s.rand();
                // A person's keeper goes where they are holding; with no
                // choice made, or for the AI, he guesses.
                p.guess = human(s, p.team) && s.dive[p.team] ? s.dive[p.team] : r < 0.12 ? 0 : r < 0.56 ? -1 : 1;
            }
            p.diving = true;
            return seek(p, gx + ad * 0.3, W / 2 + p.guess * 2.5, 6.5);
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
        if (owner && owner.team !== p.team && inBox(s, p.team, b.x, b.y) && hyp(b.x - p.x, b.y - p.y) < 5) return seek(p, b.x, b.y, 6);

        // Loose ball in the box and nobody nearer: come and claim it.
        if (s.carrier < 0 && inBox(s, p.team, b.x, b.y) && hyp(b.vx, b.vy) < 9) {
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
            if (!inBox(s, p.team, b.x, b.y)) continue;
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
            const save = clamp(1.5 - Math.max(0, sp - 12) / 30 - stretch * 0.55 + range + (p.diving ? 0 : 0.1) - (b.header ? 0.12 : 0) + (p.team === 1 ? LEVELS[s.level].save : 0) + (attr(s, p, "gk", 0.006) - 1) - (b.curl ? TUNE.CURL_EDGE : 0) - (b.need || 0) * TUNE.NEED, 0.15, 0.95);
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
            // Hit at him he usually holds it, even a hard one; at a stretch he can
            // only push it away.
            const grip = sp < 17 ? 0.7 : stretch < 0.4 ? 0.55 : stretch < 0.7 ? 0.25 : 0;
            if (s.rand() < grip) hold(s, p);
            else {
                // Parry wide, towards the side the ball was heading, not back out
                // to the edge of the box where the shooter is waiting.
                const ad = attackDir(s, p.team);
                const side = Math.abs(b.y - p.y) > 0.2 ? Math.sign(b.y - p.y) : Math.sign(b.vy) || 1;
                // From a tight angle by the byline, it goes behind for a corner.
                const tight = Math.abs(b.fromX - goalX(s, p.team)) < 6;
                b.vx = tight ? -ad * (3 + s.rand() * 2) : ad * (2 + s.rand() * 3);
                b.vy = side * (tight ? 4 + s.rand() * 3 : 8 + s.rand() * 4);
                b.vz = 1 + s.rand() * 2;
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
        let k = (p.team === 1 && p.role !== "GK" && !human(s, 1) ? LEVELS[s.level].pace : 1) * attr(s, p, "pac", 0.004);
        if (s.size === "eleven" && p.role !== "GK" && !p.off) {
            // Running wears players down over the match, sprinting most of all.
            const sp0 = hyp(p.vx, p.vy) / SPRINT;
            p.energy = Math.max(0.25, p.energy - DT * (180 / s.halfLen) * (0.0008 + 0.0026 * sp0 * sp0));
            k *= 0.88 + 0.12 * p.energy;
        }
        let ax = p.dvx * k - p.vx;
        let ay = p.dvy * k - p.vy;
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
        if (s.held || s.shootout) return;
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
        if (caughtOffside(s, p)) return offside(s, p);

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
            // The other side wins it and the player you control is far away:
            // switch to whoever on your side is nearest the ball.
            const other = 1 - p.team;
            if (human(s, other) && (!before || before.team === other)) {
                const me = s.players[s.users[other]];
                if (hyp(b.x - me.x, b.y - me.y) > 8) {
                    const q = s.players.filter((o) => o.team === other && o.role !== "GK").reduce((a, o) => (hyp(b.x - o.x, b.y - o.y) < hyp(b.x - a.x, b.y - a.y) ? o : a));
                    setUser(s, q);
                }
            }
        }
        b.last = p.id;
        b.lastAt = s.t;
        s.carrier = p.id;
        if (s.pass && s.pass.to === p.id) s.pass = null;
        if (p.id !== s.users[p.team]) setUser(s, p);
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
        // A bent shot swerves until something touches it.
        if (b.curl && b.last === b.kicker && b.lastAt === b.kickAt && s.t - b.kickAt < 2.5) b.vy += b.curl * DT;
        else b.curl = 0;
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
        if (s.shootout) {
            const so = s.shootout;
            if (so.state !== "flight") return;
            const mouth = Math.abs(b.y - W / 2) < GOAL_W / 2 && b.z < GOAL_H;
            if ((b.px <= L && b.x > L && mouth) || (b.px >= 0 && b.x < 0 && mouth)) {
                b.x = b.x > L ? L + GOAL_D * 0.7 : -GOAL_D * 0.7;
                return penResult(s, true);
            }
            const dead = s.held || b.x < 0 || b.x > L || b.y < 0 || b.y > W || s.t - b.kickAt > 3 || (s.t - b.kickAt > 0.8 && hyp(b.vx, b.vy) < 1) || (b.last !== b.kicker && s.t - b.lastAt > 0.7);
            if (dead) penResult(s, false);
            return;
        }
        if (s.held) return;
        const inMouth = Math.abs(b.y - W / 2) < GOAL_W / 2 && b.z < GOAL_H;
        // `right` is the side defending the right-hand goal this half.
        const right = goalX(s, 0) === L ? 0 : 1;
        if (b.px <= L && b.x > L && inMouth) return goal(s, 1 - right);
        if (b.px >= 0 && b.x < 0 && inMouth) return goal(s, right);

        if (b.y < 0 || b.y > W) {
            const team = lastTeam(s) === 0 ? 1 : 0;
            return restart(s, "Throw-in", team, clamp(b.x, 1, L - 1), b.y < 0 ? 0.3 : W - 0.3);
        }
        if (b.x < 0 || b.x > L) {
            const defending = b.x > L ? right : 1 - right;
            const gx = goalX(s, defending);
            if (lastTeam(s) === defending) {
                return restart(s, "Corner", 1 - defending, gx === 0 ? 0.5 : L - 0.5, b.y < W / 2 ? 0.5 : W - 0.5);
            }
            return restart(s, "Goal kick", defending, gx + attackDir(s, defending) * SIX_D, W / 2);
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
        b.x = attackDir(s, team) === 1 ? L + GOAL_D * 0.7 : -GOAL_D * 0.7;
        b.vx = b.vy = b.vz = 0;
        b.z = 0.3;
        // The match minute, as the clock shows it: each half is 45.
        const min = minute(s);
        // A deflection or a keeper's fingertips on the way in still counts for
        // whoever struck it; only a defender's own kick or touch is an own goal.
        const last = s.players[b.last];
        const kicker = s.players[b.kicker];
        const scorer = last && last.team === team ? last.id : kicker && kicker.team === team && b.lastAt - b.kickAt < 1.5 ? kicker.id : b.last;
        s.events.push({ type: "goal", team, scorer, min });
        s.flash = { text: "Goal!", team, until: s.t + 2.4, who: scorer, min };
        s.carrier = -1;
        s.pass = null;
        s.pause = 2.4;
        s.after = (st) => kickoff(st, 1 - team);
    }

    // `say` is what the screen shows if not the label ("Offside", "Yellow card"),
    // with the card's colour and who got it.
    function restart(s, label, team, x, y, say, card, who) {
        const b = s.ball;
        b.vx = b.vy = b.vz = 0;
        b.z = 0;
        s.carrier = -1;
        s.pass = null;
        s.held = null;
        const free = label === "Free kick" || label === "Penalty";
        // The AI makes its changes at a stoppage midway through the second half.
        if (s.size === "eleven" && s.half === 2 && s.clock > s.perLen * 0.35) {
            s.aiSubbed = s.aiSubbed || [false, false];
            for (const t of [0, 1]) {
                if (!human(s, t) && !s.aiSubbed[t]) {
                    s.aiSubbed[t] = true;
                    autoSub(s, t);
                }
            }
        }
        s.flash = { text: say || label, until: s.t + (free ? 2 : 1.4), card: card || null, who: who === undefined ? -1 : who };
        s.events.push({ type: "out", label, team });
        s.pause = free ? 1.5 : 0.9;
        s.after = (st) => {
            b.x = x;
            b.y = y;
            if (label === "Goal kick") {
                const k = st.players.find((p) => p.team === team && p.role === "GK");
                k.x = x;
                k.y = y;
                k.face = attackDir(st, team) === 1 ? 0 : Math.PI;
                st.held = { id: k.id, until: st.t + 0.8, goalKick: true };
                return;
            }
            const pool = st.players.filter((p) => p.team === team && p.role !== "GK" && !p.off);
            const nearest = pool.reduce((a, c) => (hyp(c.x - x, c.y - y) < hyp(a.x - x, a.y - y) ? c : a));
            const taker = label === "Penalty" ? (st.shootout ? penTaker(st, team) : striker(st, team)) : nearest;
            // The taker stands behind the ball facing infield and plays it with
            // pass, lob or shoot; until then the ball is dead.
            const goalward = norm(goalX(st, 1 - team) - x, W / 2 - y);
            const inward = free ? goalward : label === "Corner" ? norm(L / 2 - x, W / 2 - y) : { x: 0, y: y < W / 2 ? 1 : -1 };
            st.setPiece = { kind: label, team, x, y, taker: taker.id, inward, at: st.t };
            taker.x = x - inward.x * 0.6;
            taker.y = y - inward.y * 0.6;
            taker.vx = taker.vy = 0;
            taker.face = Math.atan2(inward.y, inward.x);
            taker.aim = inward;
            for (const p of st.players) p.spot = null;
            if (label === "Corner") lineUpCorner(st, team, y, taker);
            else if (label === "Penalty") lineUpPenalty(st, team, taker);
            else if (label === "Free kick") lineUpWall(st, team, x, y);
            else {
                // Two teammates come short for the throw.
                const ad = attackDir(s, team);
                const near = pool.filter((p) => p !== taker).sort((a, c) => hyp(a.x - x, a.y - y) - hyp(c.x - x, c.y - y));
                const spots = [
                    { x: x - ad * 5, y: y + inward.y * 5 },
                    { x: x + ad * 8, y: y + inward.y * 4 },
                ];
                near.slice(0, 2).forEach((p, i) => (p.spot = { x: clamp(spots[i].x, 3, L - 3), y: spots[i].y }));
            }
            setUser(st, taker);
        };
    }

    // Penalty: everyone but the taker and the keeper outside the box and the arc.
    function lineUpPenalty(s, team, taker) {
        const gx = goalX(s, 1 - team);
        const ad = attackDir(s, team);
        const keeper = s.players.find((p) => p.team !== team && p.role === "GK");
        Object.assign(keeper, { x: gx - ad * 0.3, y: W / 2, vx: 0, vy: 0 });
        const rest = s.players.filter((p) => p !== taker && p !== keeper && !p.off && p.role !== "GK");
        rest.forEach((p, i) => {
            const row = Math.floor(i / 2);
            const at = { x: gx - ad * (BOX_D + 2 + (i % 2) * 2.5), y: W / 2 + (row % 2 ? -1 : 1) * (CIRCLE + 1 + Math.floor(row / 2) * 2.4) };
            Object.assign(p, { x: at.x, y: clamp(at.y, 2, W - 2), vx: 0, vy: 0, spot: at });
        });
    }

    // Free kick in range: the nearest defenders line up ten yards away, between
    // the ball and the near post.
    function lineUpWall(s, team, x, y) {
        const gx = goalX(s, 1 - team);
        const dG = hyp(gx - x, W / 2 - y);
        if (dG > 32) return;
        const room = s.size === "eleven" ? 9.15 : 5;
        const to = norm(gx - x, W / 2 - y);
        const n = dG < 24 ? 3 : 2;
        const men = s.players.filter((p) => p.team !== team && p.role !== "GK" && !p.off).sort((a, c) => hyp(a.x - x, a.y - y) - hyp(c.x - x, c.y - y)).slice(0, n);
        men.forEach((p, i) => {
            const off = (i - (n - 1) / 2) * 0.95;
            const at = { x: x + to.x * room - to.y * off, y: y + to.y * room + to.x * off };
            Object.assign(p, { x: at.x, y: at.y, vx: 0, vy: 0, spot: at, face: Math.atan2(-to.y, -to.x) });
        });
    }

    // Corner routine: attackers into the box, defenders marking the six-yard line.
    function lineUpCorner(s, team, y, taker) {
        const ad = attackDir(s, team);
        const gx = goalX(s, 1 - team);
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
        const mates = s.players.filter((p) => p.team === team && p.role !== "GK" && p !== taker && !p.off);
        // The deepest player stays back.
        mates.sort((a, c) => (a.role === "DF" ? 1 : 0) - (c.role === "DF" ? 1 : 0));
        mates.forEach((p, i) => put(p, attack[i] || { x: L / 2 + ad * 6, y: W / 2 }));
        s.players.filter((p) => p.team !== team && p.role !== "GK" && !p.off).forEach((p, i) => put(p, mark[i % mark.length]));
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
        const ten = s.size === "eleven" ? 9.15 : 5;
        const room = sp.kind === "Corner" ? (s.size === "eleven" ? 9.15 : 8) : sp.kind === "Throw-in" ? 3 : ten;
        for (const p of s.players) {
            if (p.team === sp.team || p.off) continue;
            const d = hyp(p.x - sp.x, p.y - sp.y);
            if (d < room) {
                const n = d > 0.01 ? norm(p.x - sp.x, p.y - sp.y) : sp.inward;
                p.x = sp.x + n.x * room;
                p.y = sp.y + n.y * room;
            }
        }
    }

    const api = { create, step, secondHalf, resume, substitute, minute, LEVELS, FORMATIONS, PITCHES, CLUBS, DT, GOAL_D, R_PLAYER, R_BALL, REACH, JOG, SPRINT, ACCEL, TEAMS, speedFor, rollDist };
    // For headless tests only.
    api.test = { restart, isOffside, offsideLine, goalX, attackDir, TUNE };
    // The pitch's measurements follow whichever match was made last.
    for (const k of ["L", "W", "GOAL_W", "GOAL_H", "BOX_D", "BOX_W", "SIX_D", "SIX_W", "SPOT", "CIRCLE"]) {
        Object.defineProperty(api, k, { enumerable: true, get: () => ({ L, W, GOAL_W, GOAL_H, BOX_D, BOX_W, SIX_D, SIX_W, SPOT, CIRCLE })[k] });
    }
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.MatchSim = api;
})(typeof window !== "undefined" ? window : globalThis);
