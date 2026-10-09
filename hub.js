(function () {
    const root = document.documentElement;
    const home = document.getElementById("home");
    if (!home) return;
    window.__hubReady = true;

    const main = document.getElementById("main");
    const hero = home.querySelector("[data-hero]");
    const playerWrap = document.querySelector(".player-wrap");
    const about = document.getElementById("about");
    const notes = document.getElementById("notes");
    const toggle = document.querySelector(".view-toggle");
    const tiles = Array.from(home.querySelectorAll(".tile"));
    const motion = typeof motionOK !== "undefined" && motionOK;

    const SCREENS = {
        home: "Home",
        binder: "Squad",
        about: "Player profile",
        path: "Transfers",
        index: "Trophies",
        kickoff: "Kick off",
        contact: "Transfer request",
    };
    const ALIASES = { top: "home", main: "home", notes: "about", pitch: "kickoff", squad: "binder", formation: "binder" };
    let current = null;

    function count(name, title) {
        if (typeof track === "function") track(name, title);
    }

    function sound(name) {
        if (window.sfx) window.sfx(name);
    }

    // Section headings read as editorial copy in Classic view and as the
    // menu's own names on the home screen.
    const retitled = Array.from(document.querySelectorAll("[data-hub]"));
    retitled.forEach((node) => (node.dataset.classic = node.textContent));

    function retitle(hub) {
        retitled.forEach((node) => (node.textContent = hub ? node.dataset.hub : node.dataset.classic));
    }

    // Moved nodes leave a marker so the classic page can put them back.
    function marker(node) {
        const mark = document.createComment("hub-slot");
        node.before(mark);
        return mark;
    }
    const playerSlot = marker(playerWrap);
    const notesSlot = marker(notes);

    Object.keys(SCREENS).forEach((id) => {
        if (id === "home") return;
        const section = document.getElementById(id);
        const bar = document.createElement("div");
        bar.className = "screen-bar";
        bar.innerHTML = `<button class="screen-back" type="button"><span aria-hidden="true">&larr;</span> Back <kbd>Esc</kbd></button><p class="screen-name">${SCREENS[id]}</p>`;
        bar.querySelector("button").addEventListener("click", () => go("home"));
        section.prepend(bar);
    });

    const track$ = home.querySelector(".ticker-track");
    Array.from(track$.children).forEach((item) => {
        const copy = item.cloneNode(true);
        copy.setAttribute("aria-hidden", "true");
        track$.appendChild(copy);
    });

    function screenFor(hash) {
        let id = (hash || "").replace(/^#/, "");
        id = ALIASES[id] || id;
        return SCREENS[id] ? id : "home";
    }

    function focusTile(tile, quiet) {
        if (!quiet && tile && !tile.classList.contains("is-selected")) sound("move");
        tiles.concat(heroButton()).forEach((other) => other && other.classList.toggle("is-selected", other === tile));
        if (tile) tile.focus({ preventScroll: true });
    }

    function heroButton() {
        return hero.querySelector(".c-flip");
    }

    function redeal() {
        const panel = document.querySelector(".page-panel:not([hidden])");
        if (!panel || typeof dealPanel !== "function" || !motion) return;
        panel.classList.remove("is-dealt");
        void panel.offsetWidth;
        dealPanel(panel);
    }

    // Warp: the chosen tile grows into the screen while the screen's name
    // sweeps across, the way a game menu cuts between screens.

    const warpEl = document.createElement("div");
    warpEl.className = "warp";
    warpEl.hidden = true;
    warpEl.setAttribute("aria-hidden", "true");
    warpEl.innerHTML = '<span class="warp-band"></span><span class="warp-title"><span class="warp-kicker"></span><span class="warp-name"></span></span>';
    document.body.appendChild(warpEl);
    let warpAnims = [];
    let warpTimer = 0;
    let arriveTimer = 0;
    const WARP_GROW = 420;
    const WARP_REVEAL = 640;

    function tileFor(id) {
        return tiles.find((tile) => tile.hash === `#${id}`);
    }

    function box(rect) {
        return { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` };
    }

    function stopWarp() {
        window.clearTimeout(warpTimer);
        warpAnims.forEach((animation) => animation.cancel());
        warpAnims = [];
        warpEl.hidden = true;
    }

    function warp(from, to) {
        stopWarp();
        if (!motion || !from) return 0;
        const named = to === "home" ? from : to;
        const tile = tileFor(named);
        const sheet = document.getElementById(named).getBoundingClientRect();
        const tileBox = tile ? tile.getBoundingClientRect() : sheet;
        warpEl.querySelector(".warp-kicker").textContent = tile ? tile.querySelector(".tile-kicker").textContent : "";
        warpEl.querySelector(".warp-name").textContent = tile ? tile.querySelector(".tile-title").textContent : SCREENS[named];
        warpEl.classList.toggle("is-dark", named === "binder");
        warpEl.hidden = false;
        const ease = "cubic-bezier(0.7, 0, 0.2, 1)";
        const band = warpEl.querySelector(".warp-band");
        const title = warpEl.querySelector(".warp-title");

        if (to === "home") {
            warpEl.classList.add("is-back");
            warpAnims = [
                warpEl.animate([{ ...box(sheet), opacity: 1 }, { ...box(tileBox), opacity: 1, offset: 0.85 }, { ...box(tileBox), opacity: 0 }], { duration: 420, easing: ease, fill: "both" }),
                title.animate([{ opacity: 1 }, { opacity: 0, offset: 0.35 }, { opacity: 0 }], { duration: 420, fill: "both" }),
            ];
            if (tile) {
                tile.classList.remove("is-landing");
                window.setTimeout(() => tile.classList.add("is-landing"), 360);
                window.setTimeout(() => tile.classList.remove("is-landing"), 900);
            }
            warpAnims[0].onfinish = stopWarp;
            warpTimer = window.setTimeout(stopWarp, 800);
            return 0;
        }

        warpEl.classList.remove("is-back");
        const total = WARP_REVEAL + 260;
        const at = (ms) => ms / total;
        warpAnims = [
            warpEl.animate([
                { ...box(from === "home" ? tileBox : sheet), opacity: from === "home" ? 1 : 0, offset: 0 },
                { ...box(sheet), opacity: 1, offset: at(from === "home" ? WARP_GROW : 160) },
                { ...box(sheet), opacity: 1, offset: at(WARP_REVEAL) },
                { ...box(sheet), opacity: 0, offset: 1 },
            ], { duration: total, easing: ease, fill: "both" }),
            band.animate([
                { transform: "translateX(-120%) skewX(-18deg)", offset: 0 },
                { transform: "translateX(-120%) skewX(-18deg)", offset: at(120) },
                { transform: "translateX(260%) skewX(-18deg)", offset: at(WARP_REVEAL) },
                { transform: "translateX(260%) skewX(-18deg)", offset: 1 },
            ], { duration: total, easing: "cubic-bezier(0.5, 0, 0.3, 1)", fill: "both" }),
            title.animate([
                { opacity: 0, transform: "translateX(-8%) scale(1.2)", offset: 0 },
                { opacity: 0, transform: "translateX(-8%) scale(1.2)", offset: at(200) },
                { opacity: 1, transform: "translateX(0) scale(1.45)", offset: at(420) },
                { opacity: 1, transform: "translateX(2%) scale(1.5)", offset: at(WARP_REVEAL) },
                { opacity: 0, transform: "translateX(6%) scale(1.55)", offset: 1 },
            ], { duration: total, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)", fill: "both" }),
        ];
        warpAnims[0].onfinish = stopWarp;
        // Paused timelines (a hidden tab) must not leave the warp on screen.
        warpTimer = window.setTimeout(stopWarp, total + 400);
        return WARP_REVEAL;
    }

    // Each screen gets told when it is actually visible, after the warp.
    function arrive(id, previous, wait) {
        window.clearTimeout(arriveTimer);
        const section = document.getElementById(id);
        if (id !== "home") section.classList.remove("is-arriving");
        arriveTimer = window.setTimeout(() => {
            if (id === "binder") {
                // A direct link lands on a settled lineup; only a visit from the menu deals it.
                if (previous) redeal();
                if (window.dealFormation) window.dealFormation(Boolean(previous));
            }
            if (id !== "home" && motion) {
                void section.offsetWidth;
                section.classList.add("is-arriving");
            }
            window.dispatchEvent(new CustomEvent("hub:screen", { detail: { id, previous } }));
        }, wait);
    }

    function show(id) {
        if (id === current) return;
        const previous = current;
        current = id;
        main.dataset.screen = id;
        main.querySelectorAll(":scope > section").forEach((section) => {
            section.classList.toggle("is-active", section.id === id);
        });
        document.title = id === "home" ? "Nihar Bagkar" : `${SCREENS[id]} · Nihar Bagkar`;

        // The player card lives on the home screen and walks over to the profile.
        const profileSlot = about.querySelector(".pf-card");
        if (profileSlot) {
            if (id === "about") profileSlot.appendChild(playerWrap);
            else if (playerWrap.parentElement !== hero) hero.appendChild(playerWrap);
        }

        const wait = warp(previous, id);
        arrive(id, previous, wait);

        if (previous) sound(id === "home" ? "back" : "select");
        if (id === "home") {
            focusTile(tileFor(previous) || tiles[0], true);
        } else {
            const section = document.getElementById(id);
            // The browser's own jump to #id can scroll the sheet; undo it.
            section.scrollTop = 0;
            requestAnimationFrame(() => {
                section.scrollTop = 0;
                document.documentElement.scrollTop = 0;
            });
            const target = section.querySelector("[data-autofocus]:not([hidden])") || section.querySelector(".screen-back");
            window.setTimeout(() => target.focus({ preventScroll: true }), 60);
        }
        if (previous) count(`screen-${id}`, `Opened screen: ${SCREENS[id]}`);
    }

    function go(id) {
        if (id === current) return;
        const url = id === "home" ? location.pathname + location.search : `#${id}`;
        history.pushState(null, "", url);
        show(id);
    }

    function enterHub() {
        root.classList.add("hub");
        home.hidden = false;
        hero.appendChild(playerWrap);
        about.appendChild(notes);
        retitle(true);
        toggle.innerHTML = "Classic<span class=\"vt-more\"> view</span>";
        current = null;
        show(screenFor(location.hash));
        window.scrollTo(0, 0);
    }

    function leaveHub() {
        stopWarp();
        window.clearTimeout(arriveTimer);
        root.classList.remove("hub");
        home.hidden = true;
        playerSlot.after(playerWrap);
        notesSlot.after(notes);
        retitle(false);
        main.querySelectorAll(":scope > section").forEach((section) => section.classList.remove("is-active"));
        delete main.dataset.screen;
        toggle.textContent = "Home screen";
        document.title = "Nihar Bagkar";
        const target = current && current !== "home" ? document.getElementById(current) : null;
        current = null;
        window.scrollTo(0, target ? target.offsetTop - 70 : 0);
        window.dispatchEvent(new Event("resize"));
    }

    function remember(view) {
        try {
            localStorage.setItem("nb-view", view);
        } catch (error) {
            /* Private mode: the choice lasts for this visit only. */
        }
    }

    toggle.addEventListener("click", () => {
        if (root.classList.contains("hub")) {
            leaveHub();
            remember("classic");
            count("view-classic", "Switched to classic view");
        } else {
            enterHub();
            remember("hub");
            count("view-hub", "Switched to home screen view");
        }
    });

    document.addEventListener("click", (event) => {
        if (!root.classList.contains("hub")) return;
        const link = event.target.closest('a[href^="#"]');
        if (!link) return;
        event.preventDefault();
        go(screenFor(link.getAttribute("href")));
    });

    window.addEventListener("popstate", () => {
        if (root.classList.contains("hub")) show(screenFor(location.hash));
    });

    tiles.forEach((tile) => {
        tile.addEventListener("pointerenter", () => {
            if (window.matchMedia("(hover: hover)").matches) focusTile(tile);
        });
        tile.addEventListener("focus", () => focusTile(tile));
    });

    function moveSelection(dx, dy) {
        const items = tiles.concat(heroButton() ? [heroButton()] : []);
        const from = items.includes(document.activeElement) ? document.activeElement : null;
        if (!from) {
            focusTile(tiles[0]);
            return;
        }
        const box = (el) => (el === heroButton() ? hero : el).getBoundingClientRect();
        const a = box(from);
        const ax = a.left + a.width / 2;
        const ay = a.top + a.height / 2;
        let best = null;
        let bestScore = Infinity;
        items.forEach((item) => {
            if (item === from) return;
            const b = box(item);
            const along = dx ? (b.left + b.width / 2 - ax) * dx : (b.top + b.height / 2 - ay) * dy;
            if (along <= 4) return;
            // Tiles that line up with the current one on the cross axis win.
            const overlaps = dx ? b.top < a.bottom && b.bottom > a.top : b.left < a.right && b.right > a.left;
            const across = overlaps ? 0 : dx ? Math.abs(b.top + b.height / 2 - ay) : Math.abs(b.left + b.width / 2 - ax);
            const score = along + across * 2;
            if (score < bestScore) {
                bestScore = score;
                best = item;
            }
        });
        if (best) focusTile(best);
    }

    document.addEventListener("keydown", (event) => {
        if (!root.classList.contains("hub")) return;
        if (introOpen) {
            if (event.key === "Escape") closeIntro();
            return;
        }
        const target = event.target;
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
        if (event.key === "Escape") {
            if (current === "home" || (target.closest && target.closest(".face-back"))) return;
            event.preventDefault();
            go("home");
            return;
        }
        if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
        const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (current === "home" && arrows[event.key]) {
            event.preventDefault();
            moveSelection(...arrows[event.key]);
        }
        if (current === "binder" && typeof stepPage === "function" && (event.key === "q" || event.key === "e")) {
            stepPage(event.key === "e" ? 1 : -1);
        }
    });

    // Pack opening

    const intro = document.querySelector(".pack-intro");
    const pack = intro.querySelector(".pack");
    const cardHolder = intro.querySelector(".walkout-card");
    let introOpen = false;
    let timers = [];

    function packSeen() {
        try {
            return localStorage.getItem("nb-pack") === "1";
        } catch (error) {
            return false;
        }
    }

    function markPackSeen() {
        try {
            localStorage.setItem("nb-pack", "1");
        } catch (error) {
            /* Private mode: the pack shows again next visit. */
        }
    }

    function later(fn, ms) {
        timers.push(window.setTimeout(fn, ms));
    }

    function openIntro() {
        if (!motion) return;
        timers.forEach(window.clearTimeout);
        timers = [];
        const clone = playerWrap.querySelector(".player-slot").cloneNode(true);
        clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
        clone.querySelector(".card").classList.remove("is-flipped", "is-tilting");
        clone.inert = true;
        cardHolder.replaceChildren(clone);
        intro.className = "pack-intro";
        intro.removeAttribute("data-step");
        intro.hidden = false;
        introOpen = true;
        pack.focus({ preventScroll: true });
    }

    function closeIntro() {
        if (!introOpen) return;
        timers.forEach(window.clearTimeout);
        timers = [];
        introOpen = false;
        markPackSeen();
        intro.classList.add("is-leaving");
        window.setTimeout(() => {
            intro.hidden = true;
            intro.className = "pack-intro";
        }, 450);
        if (current === "home") focusTile(tiles[0], true);
    }

    pack.addEventListener("click", () => {
        if (intro.classList.contains("is-tearing")) return;
        intro.classList.add("is-tearing");
        sound("rip");
        count("pack-open", "Opened the player pack");
        later(() => {
            intro.classList.add("is-walkout");
            intro.dataset.step = "city";
        }, 950);
        later(() => (intro.dataset.step = "position"), 1750);
        later(() => (intro.dataset.step = "club"), 2550);
        later(() => {
            intro.dataset.step = "card";
            intro.classList.add("is-reveal");
            sound("reveal");
        }, 3350);
        later(() => intro.querySelector(".pack-continue").focus({ preventScroll: true }), 4300);
    });

    intro.querySelector(".pack-continue").addEventListener("click", closeIntro);
    intro.querySelector(".pack-skip").addEventListener("click", () => {
        count("pack-skip", "Skipped the player pack");
        closeIntro();
    });
    home.querySelector(".pack-replay").addEventListener("click", openIntro);

    if (root.classList.contains("hub")) {
        enterHub();
        if (current === "home" && !packSeen()) openIntro();
    } else {
        toggle.textContent = "Home screen";
    }
})();
