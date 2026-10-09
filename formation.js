(function () {
    const section = document.getElementById("binder");
    if (!section) return;
    const wrap = section.querySelector(".wrap");

    // The binder cards stay the single source of truth; the formation reads from them.
    const LINES = {
        attack: { name: "Attack", meaning: "Products people use today" },
        midfield: { name: "Midfield", meaning: "Systems and platforms" },
        defence: { name: "Defence", meaning: "Tools and data work" },
        keeper: { name: "Keeper", meaning: "Trust and safety" },
        bench: { name: "Bench", meaning: "Concepts and prototypes" },
        reserves: { name: "Reserves", meaning: "Case work" },
    };
    const POSITIONS = {
        LW: "Left wing", ST: "Striker", RW: "Right wing", CM: "Central midfield",
        LB: "Left back", CB: "Centre back", RB: "Right back", GK: "Goalkeeper",
        SUB: "Substitute", RES: "Reserve",
    };
    const DEFAULT = [
        ["attack", "LW", "Viridian"], ["attack", "ST", "Cue"], ["attack", "RW", "UPHouse"],
        ["midfield", "CM", "SignalPath"], ["midfield", "CM", "Soccer Analytics"], ["midfield", "CM", "Earnings Call Bot"],
        ["defence", "LB", "IB Prep Hub"], ["defence", "CB", "BCPS Parser"], ["defence", "CB", "CleanMatch"], ["defence", "RB", "Automated GP"],
        ["keeper", "GK", "BinderChain"],
        ["bench", "SUB", "Stripe Education Suite"], ["bench", "SUB", "Savficiency"], ["bench", "SUB", "BlitzQuiz"],
        ["bench", "SUB", "AbroadRomantics"], ["bench", "SUB", "Altbert"], ["bench", "SUB", "The Digital Graveyard"],
        ["bench", "SUB", "Celsius AI Campaign"],
        ["reserves", "RES", "Internship Case"],
        ["reserves", "RES", "Uber AV Strategy"],
    ];
    // Chemistry: real shared themes between projects.
    const LINKS = [
        ["Viridian", "BinderChain", "Collectibles"],
        ["Viridian", "UPHouse", "Live on the App Store"],
        ["Cue", "SignalPath", "AI products"],
        ["Soccer Analytics", "Earnings Call Bot", "Markets and forecasting"],
        ["BCPS Parser", "CleanMatch", "Cleaning up financial data"],
        ["CleanMatch", "Earnings Call Bot", "AI for finance"],
        ["IB Prep Hub", "Automated GP", "Workflow tools"],
    ];
    const FACTS = {
        Viridian: "App Store",
        UPHouse: "App Store",
        SignalPath: "Top 5 of 47",
        "Soccer Analytics": "610 tests",
        "Uber AV Strategy": "1st place",
    };

    const cards = new Map();
    document.querySelectorAll(".page-panel .card").forEach((card) => {
        const title = card.querySelector(".c-head h3").textContent.trim();
        const img = card.querySelector(".c-art img, .c-shots img");
        const foot = card.querySelector(".c-foot span");
        cards.set(title, {
            title,
            card,
            no: card.querySelector(".c-no").textContent.split("/")[0],
            type: card.querySelector(".c-type").textContent.trim(),
            text: card.querySelector(".c-text").textContent.trim(),
            fact: FACTS[title] || (foot ? foot.textContent.trim() : ""),
            foil: card.classList.contains("is-foil"),
            art: img ? img.getAttribute("src") : "",
            shots: Boolean(card.querySelector(".c-shots")),
            artBg: card.style.getPropertyValue("--art-bg").trim() || "#fff",
            artFit: card.style.getPropertyValue("--art-fit").trim() || "cover",
            artPos: card.style.getPropertyValue("--art-pos").trim() || "center",
        });
    });

    let lineup = DEFAULT.map(([line, pos, title]) => ({ line, pos, title }));

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const motion = typeof motionOK !== "undefined" && motionOK;

    function count(name, title) {
        if (typeof track === "function") track(name, title);
    }

    // Markup

    const views = document.createElement("div");
    views.className = "squad-views";
    views.setAttribute("role", "tablist");
    views.setAttribute("aria-label", "Squad view");
    views.innerHTML = '<button type="button" role="tab" data-view="formation">Starting XI</button><button type="button" role="tab" data-view="club">Club binder</button>';

    const formation = document.createElement("div");
    formation.className = "formation";
    formation.innerHTML = `
        <div class="pitch-board">
            <svg class="chem" aria-hidden="true"></svg>
            <div class="line" data-line="attack"></div>
            <div class="line" data-line="midfield"></div>
            <div class="line" data-line="defence"></div>
            <div class="line" data-line="keeper"></div>
        </div>
        <aside class="dugout">
            <div class="scout" aria-live="polite"></div>
            <div class="dugout-group"><p class="label dugout-head">Bench <button class="lineup-reset" type="button" hidden>Reset the lineup</button></p><div class="bench" data-line="bench"></div></div>
            <div class="dugout-group"><p class="label">Reserves</p><div class="bench" data-line="reserves"></div></div>
        </aside>`;
    wrap.prepend(formation);

    const board = formation.querySelector(".pitch-board");
    const chem = formation.querySelector(".chem");
    const scout = formation.querySelector(".scout");
    const resetButton = formation.querySelector(".lineup-reset");

    function attachViews() {
        const bar = section.querySelector(".screen-bar");
        if (bar && !bar.contains(views)) bar.insertBefore(views, bar.lastElementChild);
    }

    function setView(view) {
        section.dataset.view = view;
        views.querySelectorAll("[role=tab]").forEach((tab) => {
            const on = tab.dataset.view === view;
            tab.setAttribute("aria-selected", String(on));
            tab.tabIndex = on ? 0 : -1;
        });
        if (view === "formation") requestAnimationFrame(drawChem);
    }

    views.addEventListener("click", (event) => {
        const tab = event.target.closest("[role=tab]");
        if (!tab) return;
        setView(tab.dataset.view);
        count(`squad-${tab.dataset.view}`, `Squad view: ${tab.textContent}`);
    });

    function scoutDefault() {
        scout.innerHTML = `<p class="label">Scout report</p><p class="scout-name">4-3-3</p>
            <ul class="scout-legend">
                <li><strong>Attack</strong> ${LINES.attack.meaning}</li>
                <li><strong>Midfield</strong> ${LINES.midfield.meaning}</li>
                <li><strong>Defence</strong> ${LINES.defence.meaning}</li>
                <li><strong>Keeper</strong> ${LINES.keeper.meaning}</li>
            </ul>
            <p class="scout-hint">${finePointer ? "Hover a player for links, click to inspect, drag a sub onto the pitch." : "Tap a player to inspect the card."}</p>`;
    }

    function linksFor(title) {
        return LINKS.filter(([a, b]) => a === title || b === title).map(([a, b, label]) => ({ other: a === title ? b : a, label }));
    }

    function scoutFor(slot) {
        const data = cards.get(slot.title);
        const links = linksFor(slot.title);
        const onPitch = !["bench", "reserves"].includes(slot.line);
        const linkText = links.length
            ? links.map((link) => `<li><strong>${link.other}</strong> ${link.label}</li>`).join("")
            : "<li>No links in this lineup yet.</li>";
        scout.innerHTML = `<p class="label">${POSITIONS[slot.pos]} &middot; ${LINES[slot.line].name}</p>
            <p class="scout-name">${data.title}</p>
            <p class="scout-body">${data.text}</p>
            ${onPitch ? `<p class="label">Chemistry</p><ul class="scout-legend">${linkText}</ul>` : ""}`;
    }

    function miniFor(slot, index) {
        const data = cards.get(slot.title);
        const mini = document.createElement("button");
        mini.type = "button";
        mini.className = `mini${data.foil ? " is-foil" : ""}`;
        mini.dataset.title = data.title;
        mini.dataset.index = String(index);
        mini.style.setProperty("--tone", getComputedStyle(data.card).getPropertyValue("--tone"));
        mini.style.setProperty("--i", String(index));
        mini.setAttribute("aria-label", `${data.title}, ${POSITIONS[slot.pos].toLowerCase()}. ${data.fact}. Open the card.`);
        const fit = data.shots ? "cover" : data.artFit;
        const pos = data.shots ? "top center" : data.artPos;
        mini.innerHTML = `<span class="mini-face">
                <span class="mini-top"><span class="mini-pos">${slot.pos}</span><span class="mini-no">${data.no}</span></span>
                <span class="mini-art" style="background:${data.artBg}"><img src="${data.art}" alt="" loading="lazy" style="object-fit:${fit};object-position:${pos}"></span>
                <span class="mini-name">${data.title}</span>
                <span class="mini-fact">${data.fact}</span>
            </span>`;
        return mini;
    }

    function render() {
        formation.querySelectorAll("[data-line]").forEach((holder) => holder.replaceChildren());
        lineup.forEach((slot, index) => {
            formation.querySelector(`[data-line="${slot.line}"]`).appendChild(miniFor(slot, index));
        });
        const changed = lineup.some((slot, index) => slot.title !== DEFAULT[index][2]);
        resetButton.hidden = !changed;
        requestAnimationFrame(drawChem);
    }

    function drawChem(active) {
        const box = board.getBoundingClientRect();
        if (!box.width) return;
        const focus = typeof active === "string" ? active : null;
        chem.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
        const center = (title) => {
            const mini = board.querySelector(`.mini[data-title="${CSS.escape(title)}"]`);
            if (!mini) return null;
            const rect = mini.getBoundingClientRect();
            return [rect.left + rect.width / 2 - box.left, rect.top + rect.height / 2 - box.top];
        };
        chem.innerHTML = LINKS.map(([a, b]) => {
            const pa = center(a);
            const pb = center(b);
            if (!pa || !pb) return "";
            const on = focus && (a === focus || b === focus);
            const cls = focus ? (on ? "is-on" : "is-dim") : "";
            return `<line class="${cls}" x1="${pa[0]}" y1="${pa[1]}" x2="${pb[0]}" y2="${pb[1]}"/>`;
        }).join("");
    }

    if ("ResizeObserver" in window) new ResizeObserver(() => drawChem()).observe(board);

    function slotOf(mini) {
        return lineup[Number(mini.dataset.index)];
    }

    formation.addEventListener("pointerover", (event) => {
        const mini = event.target.closest(".mini");
        if (!mini || dragging) return;
        scoutFor(slotOf(mini));
        drawChem(mini.dataset.title);
    });
    formation.addEventListener("focusin", (event) => {
        const mini = event.target.closest(".mini");
        if (!mini) return;
        scoutFor(slotOf(mini));
        drawChem(mini.dataset.title);
    });
    formation.addEventListener("pointerleave", () => {
        if (dragging) return;
        scoutDefault();
        drawChem();
    });

    resetButton.addEventListener("click", () => {
        lineup = DEFAULT.map(([line, pos, title]) => ({ line, pos, title }));
        render();
        scoutDefault();
        count("formation-reset", "Reset the formation");
    });

    // Drag a player onto another to swap them (desktop pointers only).

    let dragging = null;
    let suppressClick = false;

    // The dragged card sits under the pointer, so look past it.
    function miniUnder(event, dragged) {
        for (const el of document.elementsFromPoint(event.clientX, event.clientY)) {
            const mini = el.closest(".mini");
            if (mini && mini !== dragged) return mini;
        }
        return null;
    }

    formation.addEventListener("pointerdown", (event) => {
        const mini = event.target.closest(".mini");
        if (!mini || !finePointer || event.button !== 0) return;
        const start = { x: event.clientX, y: event.clientY };
        let moved = false;

        function move(moveEvent) {
            const dx = moveEvent.clientX - start.x;
            const dy = moveEvent.clientY - start.y;
            if (!moved) {
                if (Math.hypot(dx, dy) < 6) return;
                moved = true;
                dragging = mini;
                try {
                    mini.setPointerCapture(event.pointerId);
                } catch (error) {
                    /* The pointer is already gone; the drag still follows moves. */
                }
                mini.classList.add("is-dragging");
                formation.classList.add("is-dragging");
            }
            mini.style.transform = `translate(${dx}px, ${dy}px) rotate(${Math.max(-10, Math.min(10, dx / 12))}deg) scale(1.08)`;
            const target = miniUnder(moveEvent, mini);
            formation.querySelectorAll(".mini.is-target").forEach((el) => el.classList.remove("is-target"));
            if (target && target !== mini) target.classList.add("is-target");
        }

        function end(endEvent) {
            mini.removeEventListener("pointermove", move);
            mini.removeEventListener("pointerup", end);
            mini.removeEventListener("pointercancel", end);
            if (!moved) return;
            suppressClick = true;
            window.setTimeout(() => (suppressClick = false), 300);
            const target = miniUnder(endEvent, mini);
            dragging = null;
            formation.classList.remove("is-dragging");
            if (target && target !== mini) {
                const a = slotOf(mini);
                const b = slotOf(target);
                [a.title, b.title] = [b.title, a.title];
                render();
                scoutFor(b);
                count("formation-swap", `Swapped ${b.title} and ${a.title}`);
            } else {
                mini.classList.remove("is-dragging");
                mini.classList.add("is-returning");
                mini.style.transform = "";
                window.setTimeout(() => mini.classList.remove("is-returning"), 450);
            }
        }

        mini.addEventListener("pointermove", move);
        mini.addEventListener("pointerup", end);
        mini.addEventListener("pointercancel", end);
    });

    // Inspect: open the full card, flip it, browse the squad.

    const inspect = document.createElement("div");
    inspect.className = "inspect";
    inspect.hidden = true;
    inspect.setAttribute("role", "dialog");
    inspect.setAttribute("aria-modal", "true");
    inspect.setAttribute("aria-label", "Card");
    inspect.innerHTML = `
        <div class="inspect-backdrop"></div>
        <p class="inspect-meta"></p>
        <div class="inspect-stage">
            <button class="inspect-nav" type="button" data-step="-1" aria-label="Previous player">&larr;</button>
            <div class="inspect-slot"></div>
            <button class="inspect-nav" type="button" data-step="1" aria-label="Next player">&rarr;</button>
        </div>
        <button class="inspect-close" type="button">Close <kbd>Esc</kbd></button>`;
    document.body.appendChild(inspect);
    const inspectSlot = inspect.querySelector(".inspect-slot");
    const inspectMeta = inspect.querySelector(".inspect-meta");
    let inspecting = -1;
    let returnFocus = null;

    function flip(card, flipped) {
        card.classList.toggle("is-flipped", flipped);
        card.querySelector(".face-front").inert = flipped;
        card.querySelector(".face-back").inert = !flipped;
        card.querySelector(".c-flip").setAttribute("aria-expanded", String(flipped));
        (flipped ? card.querySelector(".face-back .c-link") : card.querySelector(".c-flip")).focus({ preventScroll: true });
    }

    function showInspect(index) {
        inspecting = (index + lineup.length) % lineup.length;
        const slot = lineup[inspecting];
        const data = cards.get(slot.title);
        const clone = data.card.cloneNode(true);
        clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
        clone.classList.remove("is-flipped", "is-dragging", "is-returning");
        clone.style.transform = "";
        clone.querySelector(".face-front").inert = false;
        clone.querySelector(".face-back").inert = true;
        clone.querySelector(".c-flip").addEventListener("click", () => flip(clone, true));
        clone.querySelector(".c-back").addEventListener("click", () => flip(clone, false));
        if (data.foil) {
            const front = clone.querySelector(".face-front");
            clone.addEventListener("pointermove", (event) => {
                const rect = clone.getBoundingClientRect();
                const x = ((event.clientX - rect.left) / rect.width) * 100;
                const y = ((event.clientY - rect.top) / rect.height) * 100;
                ["--mx", "--bgx"].forEach((name) => front.style.setProperty(name, `${x}%`));
                ["--my", "--bgy"].forEach((name) => front.style.setProperty(name, `${y}%`));
            });
        }
        inspectSlot.replaceChildren(clone);
        inspectSlot.classList.remove("is-in");
        void inspectSlot.offsetWidth;
        inspectSlot.classList.add("is-in");
        inspectMeta.innerHTML = `<strong>${slot.pos}</strong> ${POSITIONS[slot.pos]} &middot; ${LINES[slot.line].name}: ${LINES[slot.line].meaning.toLowerCase()}`;
        inspect.setAttribute("aria-label", `${data.title} card`);
        clone.querySelector(".c-flip").focus({ preventScroll: true });
    }

    function openInspect(index) {
        returnFocus = document.activeElement;
        inspect.hidden = false;
        showInspect(index);
        count(`inspect-${lineup[index].title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, `Inspected ${lineup[index].title}`);
    }

    function closeInspect() {
        inspect.hidden = true;
        inspectSlot.replaceChildren();
        inspecting = -1;
        if (returnFocus) returnFocus.focus({ preventScroll: true });
    }

    formation.addEventListener("click", (event) => {
        const mini = event.target.closest(".mini");
        if (!mini || suppressClick) return;
        openInspect(Number(mini.dataset.index));
    });
    inspect.querySelector(".inspect-backdrop").addEventListener("click", closeInspect);
    inspect.querySelector(".inspect-close").addEventListener("click", closeInspect);
    inspect.querySelectorAll(".inspect-nav").forEach((button) => {
        button.addEventListener("click", () => showInspect(inspecting + Number(button.dataset.step)));
    });

    document.addEventListener("keydown", (event) => {
        if (inspect.hidden) return;
        const flipped = inspectSlot.querySelector(".card.is-flipped");
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (flipped) flip(flipped, false);
            else closeInspect();
        } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            event.stopPropagation();
            showInspect(inspecting + (event.key === "ArrowRight" ? 1 : -1));
        } else if (event.key === "Tab") {
            const focusables = Array.from(inspect.querySelectorAll("button, a[href]")).filter((el) => !el.closest("[inert]"));
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    }, true);

    window.dealFormation = (animate = true) => {
        attachViews();
        if (!section.dataset.view) setView("formation");
        drawChem();
        if (!motion || !animate) return;
        formation.classList.remove("is-dealing");
        void formation.offsetWidth;
        formation.classList.add("is-dealing");
        window.setTimeout(() => formation.classList.remove("is-dealing"), lineup.length * 30 + 600);
    };

    render();
    scoutDefault();
    attachViews();
    setView("formation");
})();
