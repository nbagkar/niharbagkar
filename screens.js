(function () {
    // Game screens for the home-screen view. Each one is built from the
    // page's own content, so Classic view and these screens never drift apart.
    const root = document.documentElement;
    const main = document.getElementById("main");
    if (!document.getElementById("home")) return;

    const motion = typeof motionOK !== "undefined" && motionOK;
    const handlers = {};

    function inHub() {
        return root.classList.contains("hub");
    }

    function sound(name) {
        if (window.sfx) window.sfx(name);
    }

    function count(name, title) {
        if (typeof track === "function") track(name, title);
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function replay(node, className) {
        if (!motion) return;
        node.classList.remove(className);
        void node.offsetWidth;
        node.classList.add(className);
    }

    function remembered(key) {
        try {
            return JSON.parse(localStorage.getItem(key)) || [];
        } catch (error) {
            return [];
        }
    }

    function remember(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            /* Private mode: progress lasts for this visit only. */
        }
    }

    window.addEventListener("hub:screen", (event) => {
        const handler = handlers[event.detail.id];
        if (handler && handler.arrive) handler.arrive(event.detail.previous);
    });

    document.addEventListener("keydown", (event) => {
        if (!inHub() || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
        const handler = handlers[main.dataset.screen];
        if (handler && handler.key) handler.key(event);
    });

    // Player profile: tabs on the left, the player card on the right.

    const about = document.getElementById("about");
    const TABS = [
        ["overview", "Overview"],
        ["playstyles", "PlayStyles"],
        ["bio", "Bio"],
    ];
    const pfTabs = el("div", "pf-tabs");
    pfTabs.setAttribute("role", "tablist");
    pfTabs.setAttribute("aria-label", "Player profile");
    pfTabs.innerHTML = '<kbd class="pf-key" aria-hidden="true">Q</kbd>' +
        TABS.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}">${label}</button>`).join("") +
        '<kbd class="pf-key" aria-hidden="true">E</kbd>';
    const pfCard = el("div", "pf-card");
    about.prepend(pfTabs);
    about.append(pfCard);
    let profileTab = "overview";

    function setTab(next, animate) {
        profileTab = next;
        about.dataset.tab = next;
        pfTabs.querySelectorAll("[role=tab]").forEach((tab) => {
            const on = tab.dataset.tab === next;
            tab.setAttribute("aria-selected", String(on));
            tab.tabIndex = on ? 0 : -1;
        });
        if (animate) replay(about, "is-tabbing");
        if (next === "overview" && typeof countUp === "function") countUp(about.querySelector(".glance"));
    }

    function stepTab(step, focus) {
        const index = TABS.findIndex(([id]) => id === profileTab);
        const next = TABS[(index + step + TABS.length) % TABS.length][0];
        setTab(next, true);
        sound("tab");
        if (focus) pfTabs.querySelector(`[data-tab="${next}"]`).focus();
    }

    pfTabs.addEventListener("click", (event) => {
        const tab = event.target.closest("[role=tab]");
        if (!tab || tab.dataset.tab === profileTab) return;
        setTab(tab.dataset.tab, true);
        sound("tab");
        count(`profile-${tab.dataset.tab}`, `Profile tab: ${tab.textContent}`);
    });

    pfTabs.addEventListener("keydown", (event) => {
        const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[event.key];
        if (!step) return;
        event.preventDefault();
        stepTab(step, true);
    });

    handlers.about = {
        arrive() {
            setTab(profileTab, false);
        },
        key(event) {
            if (event.key === "q" || event.key === "e") stepTab(event.key === "e" ? 1 : -1, false);
        },
    };

    setTab("overview", false);

    // Transfers: one club at a time, stepped along a rail.

    const path = document.getElementById("path");
    const clubs = Array.from(path.querySelectorAll(".ledger li")).map((item) => {
        const heading = item.querySelector("h3").textContent.trim();
        const comma = heading.indexOf(", ");
        return {
            when: item.querySelector(".when").textContent.trim(),
            crest: item.querySelector(".crest").textContent.trim(),
            club: comma > 0 ? heading.slice(0, comma) : heading,
            role: comma > 0 ? heading.slice(comma + 2) : "",
            text: item.querySelector("p").textContent.trim(),
        };
    });

    const tx = el("div", "tx");
    tx.innerHTML = `
        <div class="tx-stage">
            <button class="tx-nav" type="button" data-step="-1" aria-label="Newer club"><span aria-hidden="true">&larr;</span></button>
            <div class="tx-window"><article class="tx-card" aria-live="polite"></article></div>
            <button class="tx-nav" type="button" data-step="1" aria-label="Older club"><span aria-hidden="true">&rarr;</span></button>
        </div>
        <div class="tx-rail-wrap">
            <ol class="tx-rail" aria-label="Clubs, newest first"></ol>
        </div>
        <p class="tx-hint"><span class="hint-hover"><kbd>&larr;</kbd><kbd>&rarr;</kbd> Step through clubs</span><span class="hint-tap">Swipe the card to step through clubs</span></p>`;
    path.querySelector(".wrap").appendChild(tx);

    const txCard = tx.querySelector(".tx-card");
    const rail = tx.querySelector(".tx-rail");
    rail.style.setProperty("--n", String(clubs.length));
    clubs.forEach((club, index) => {
        const item = el("li");
        const node = el("button", "tx-node");
        node.type = "button";
        node.dataset.index = String(index);
        node.style.setProperty("--i", String(index));
        node.append(el("span", `tx-crest${index === 0 ? " is-accent" : ""}`, club.crest), el("span", "tx-node-when", club.when));
        node.setAttribute("aria-label", `${club.club}, ${club.when}`);
        item.appendChild(node);
        rail.appendChild(item);
    });
    const nodes = Array.from(rail.querySelectorAll(".tx-node"));
    let clubIndex = 0;

    function renderClub(index) {
        const club = clubs[index];
        const crest = el("span", `tx-big-crest${index === 0 ? " is-accent" : ""}`, club.crest);
        crest.setAttribute("aria-hidden", "true");
        const copy = el("div", "tx-copy");
        const meta = el("p", "tx-meta");
        meta.append(el("span", "", club.when), el("span", "", `Transfer ${index + 1} of ${clubs.length}`));
        copy.append(meta, el("h3", "tx-club", club.club));
        if (club.role) copy.appendChild(el("p", "tx-role", club.role));
        copy.appendChild(el("p", "tx-text", club.text));
        const stamp = el("span", "tx-stamp", /now/i.test(club.when) ? "Current club" : "Signed");
        stamp.setAttribute("aria-hidden", "true");
        txCard.replaceChildren(crest, copy, stamp);
    }

    function showClub(index, direction) {
        clubIndex = (index + clubs.length) % clubs.length;
        renderClub(clubIndex);
        nodes.forEach((node, i) => {
            if (i === clubIndex) node.setAttribute("aria-current", "step");
            else node.removeAttribute("aria-current");
        });
        rail.style.setProperty("--progress", String(clubs.length > 1 ? clubIndex / (clubs.length - 1) : 0));
        txCard.classList.remove("is-from-left", "is-from-right");
        if (direction) txCard.classList.add(direction > 0 ? "is-from-right" : "is-from-left");
        replay(txCard, "is-stamping");
        if (motion) window.setTimeout(() => sound("stamp"), 380);
    }

    function stepClub(step) {
        showClub(clubIndex + step, step);
        count("transfers-step", "Stepped through transfers");
    }

    tx.querySelectorAll(".tx-nav").forEach((button) => {
        button.addEventListener("click", () => stepClub(Number(button.dataset.step)));
    });

    nodes.forEach((node, index) => {
        node.addEventListener("click", () => {
            if (index !== clubIndex) showClub(index, index > clubIndex ? 1 : -1);
        });
    });

    let swipe = null;
    const txWindow = tx.querySelector(".tx-window");
    txWindow.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse") return;
        swipe = { x: event.clientX, y: event.clientY };
    });
    txWindow.addEventListener("pointerup", (event) => {
        if (!swipe) return;
        const dx = event.clientX - swipe.x;
        const dy = event.clientY - swipe.y;
        swipe = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) stepClub(dx < 0 ? 1 : -1);
    });
    txWindow.addEventListener("pointercancel", () => (swipe = null));

    handlers.path = {
        arrive() {
            showClub(clubIndex, 0);
        },
        key(event) {
            const step = { ArrowRight: 1, ArrowLeft: -1, e: 1, q: -1 }[event.key];
            if (!step) return;
            event.preventDefault();
            stepClub(step);
        },
    };

    showClub(0, 0);

    // Trophies: a lit cabinet; pick a piece to see its plaque.

    const index = document.getElementById("index");
    const pieces = [
        ...Array.from(index.querySelectorAll(".shelf .trophy")).map((item) => ({
            kind: "award",
            type: Array.from(item.classList).find((name) => name.startsWith("trophy-")),
            icon: item.querySelector(".trophy-icon").innerHTML,
            name: item.querySelector(".trophy-name").textContent.trim(),
            where: item.querySelector(".where").textContent.trim(),
        })),
        ...Array.from(index.querySelectorAll(".contents li")).map((item) => {
            const link = item.querySelector("a");
            return {
                kind: "book",
                name: link.textContent.trim(),
                where: item.querySelector(".where").textContent.trim(),
                href: link.getAttribute("href"),
            };
        }),
    ];

    const cab = el("div", "cab");
    cab.innerHTML = `
        <div class="cab-case">
            <p class="cab-label">Awards</p>
            <div class="cab-row" data-row="0"></div>
            <div class="cab-row" data-row="1"></div>
            <p class="cab-label">Publications</p>
            <div class="cab-row cab-books" data-row="2"></div>
        </div>
        <aside class="cab-plaque" aria-live="polite">
            <div class="cab-spot"><span class="cab-big"></span></div>
            <p class="cab-where"></p>
            <h3 class="cab-name"></h3>
            <a class="btn cab-link" target="_blank" rel="noopener" hidden>Read it <span aria-hidden="true">&nearr;</span></a>
            <p class="cab-progress"></p>
        </aside>`;
    index.querySelector(".wrap").appendChild(cab);

    // Covers carry an initial and ruled lines; the full title is on the plaque.
    function coverFor(piece) {
        const cover = el("span", "cab-cover");
        cover.setAttribute("aria-hidden", "true");
        cover.append(el("b", "", piece.name.charAt(0)), el("i"), el("i"), el("i"));
        return cover;
    }

    let seen = remembered("nb-cabinet");
    const items = pieces.map((piece, i) => {
        const button = el("button", `cab-item ${piece.kind === "book" ? "cab-book" : piece.type}`);
        button.type = "button";
        button.style.setProperty("--i", String(i));
        if (piece.kind === "award") {
            const icon = el("span", "trophy-icon");
            icon.innerHTML = piece.icon;
            button.append(icon, el("span", "cab-plate", piece.name));
        } else {
            button.append(coverFor(piece), el("span", "cab-plate", piece.where));
        }
        button.appendChild(el("span", "cab-new", "New"));
        button.setAttribute("aria-label", `${piece.name}, ${piece.where}`);
        const row = piece.kind === "book" ? 2 : i < 3 ? 0 : 1;
        cab.querySelector(`[data-row="${row}"]`).appendChild(button);
        button.addEventListener("click", () => pick(i, true));
        return button;
    });
    let picked = 0;

    function markSeen() {
        items.forEach((item, i) => item.classList.toggle("is-seen", seen.includes(pieces[i].name)));
        const done = pieces.filter((piece) => seen.includes(piece.name)).length;
        const complete = done === pieces.length;
        cab.querySelector(".cab-progress").textContent = complete
            ? `Cabinet complete: all ${pieces.length} pieces inspected`
            : `Inspected ${done} of ${pieces.length}. Pieces marked New are still waiting.`;
        cab.classList.toggle("is-complete", complete);
        return complete;
    }

    function pick(i, byUser) {
        picked = i;
        const piece = pieces[i];
        items.forEach((item, n) => item.setAttribute("aria-pressed", String(n === i)));
        const big = cab.querySelector(".cab-big");
        big.className = `cab-big ${piece.kind === "book" ? "cab-book" : piece.type}`;
        if (piece.kind === "award") {
            big.innerHTML = `<span class="trophy-icon">${piece.icon}</span>`;
        } else {
            big.replaceChildren(coverFor(piece));
        }
        cab.querySelector(".cab-where").textContent = piece.where;
        cab.querySelector(".cab-name").textContent = piece.name;
        const link = cab.querySelector(".cab-link");
        link.hidden = piece.kind !== "book";
        if (piece.href) link.href = piece.href;
        replay(cab.querySelector(".cab-plaque"), "is-spinning");
        if (byUser) {
            sound("tab");
            count(`cabinet-${i}`, `Inspected: ${piece.name}`);
            // On narrow screens the plaque sits above the shelves.
            if (window.matchMedia("(max-width: 860px)").matches) {
                cab.querySelector(".cab-plaque").scrollIntoView({ block: "nearest", behavior: motion ? "smooth" : "auto" });
            }
        }
        if (!seen.includes(piece.name)) {
            const wasComplete = cab.classList.contains("is-complete");
            seen = seen.concat(piece.name);
            remember("nb-cabinet", seen);
            if (markSeen() && !wasComplete) {
                window.setTimeout(() => sound("unlock"), 250);
                count("cabinet-complete", "Inspected the whole trophy cabinet");
            }
        }
    }

    handlers.index = {
        arrive() {
            pick(picked, false);
        },
        key(event) {
            const rows = [0, 1, 2].map((row) => items.filter((item) => item.parentElement.dataset.row === String(row)));
            const current = items[picked];
            const row = rows.findIndex((list) => list.includes(current));
            const col = rows[row].indexOf(current);
            let target = null;
            if (event.key === "ArrowRight") target = items[Math.min(items.length - 1, picked + 1)];
            if (event.key === "ArrowLeft") target = items[Math.max(0, picked - 1)];
            if (event.key === "ArrowDown" && rows[row + 1]) target = rows[row + 1][Math.min(col, rows[row + 1].length - 1)];
            if (event.key === "ArrowUp" && rows[row - 1]) target = rows[row - 1][Math.min(col, rows[row - 1].length - 1)];
            if (!target) return;
            event.preventDefault();
            target.focus();
            pick(items.indexOf(target), true);
        },
    };

    markSeen();
    pick(0, false);

    // Transfer request: the contact form as a three-step offer sheet.

    const form = document.querySelector(".contact-form");
    const nameInput = form.querySelector("#name");
    const emailInput = form.querySelector("#email");
    const messageInput = form.querySelector("#message");
    const submit = form.querySelector("[type=submit]");
    const OFFERS = ["Product role", "Venture work", "Automation project", "Just saying hi"];

    const head = el("div", "offer-head");
    head.innerHTML = `
        <p class="offer-title">Transfer offer</p>
        <p class="offer-parties"><span>To <strong>Nihar Bagkar</strong></span><span>From <strong data-from>your club</strong></span></p>
        <ol class="offer-steps"><li>Club details</li><li>Offer</li><li>Terms</li></ol>`;

    const stepOne = el("div", "offer-step");
    stepOne.dataset.step = "1";
    stepOne.append(form.querySelector('label[for="name"]'), nameInput, form.querySelector('label[for="email"]'), emailInput);

    const stepTwo = el("div", "offer-step offer-hub");
    stepTwo.dataset.step = "2";
    stepTwo.innerHTML = `<fieldset class="offer-types"><legend>What kind of offer?</legend>${OFFERS.map((offer) =>
        `<label class="offer-chip"><input type="radio" name="offer" value="${offer}"><span>${offer}</span></label>`).join("")}</fieldset>`;

    const stepThree = el("div", "offer-step");
    stepThree.dataset.step = "3";
    const signature = el("p", "offer-sign offer-hub");
    signature.innerHTML = '<span class="offer-sig" data-sig></span><span class="offer-sig-line">Signed</span>';
    stepThree.append(form.querySelector('label[for="message"]'), messageInput, signature);

    const nav = el("div", "offer-nav");
    nav.innerHTML = '<button class="offer-back" type="button">Back</button><button class="offer-next btn" type="button">Next</button>';
    nav.appendChild(submit);
    const stamp = el("p", "offer-stamp offer-hub", "Offer sent");
    stamp.setAttribute("aria-hidden", "true");

    form.prepend(head, stepOne, stepTwo, stepThree, nav, stamp);
    submit.dataset.hub = "Sign and send";
    const steps = [stepOne, stepTwo, stepThree];
    const back = nav.querySelector(".offer-back");
    const next = nav.querySelector(".offer-next");
    let offerStep = 1;
    let sending = false;

    function setOfferStep(step, focus) {
        offerStep = step;
        form.dataset.step = String(step);
        head.querySelectorAll(".offer-steps li").forEach((item, i) => {
            item.classList.toggle("is-done", i < step - 1);
            if (i === step - 1) item.setAttribute("aria-current", "step");
            else item.removeAttribute("aria-current");
        });
        back.disabled = step === 1;
        replay(steps[step - 1], "is-in");
        if (focus) {
            const field = steps[step - 1].querySelector("input:not([type=radio]), textarea, input:checked, input");
            if (field) field.focus({ preventScroll: true });
        }
    }

    function stepIsValid(step) {
        const fields = Array.from(steps[step - 1].querySelectorAll("input[required], textarea[required]"));
        const bad = fields.find((field) => !field.checkValidity());
        if (!bad) return true;
        if (offerStep !== step) setOfferStep(step, false);
        bad.reportValidity();
        return false;
    }

    next.addEventListener("click", () => {
        if (!stepIsValid(offerStep)) return;
        setOfferStep(offerStep + 1, true);
        sound("tab");
    });

    back.addEventListener("click", () => {
        setOfferStep(Math.max(1, offerStep - 1), true);
        sound("back");
    });

    nameInput.addEventListener("input", () => {
        const name = nameInput.value.trim();
        head.querySelector("[data-from]").textContent = name || "your club";
        signature.querySelector("[data-sig]").textContent = name;
    });

    form.addEventListener("keydown", (event) => {
        if (!inHub() || event.key !== "Enter" || event.target.tagName === "TEXTAREA" || offerStep === 3) return;
        if (event.target.tagName !== "INPUT") return;
        event.preventDefault();
        next.click();
    });

    const done = el("div", "offer-done offer-hub");
    done.setAttribute("role", "status");
    done.innerHTML = '<p class="offer-done-title">Offer received.</p><p class="offer-done-text"></p><button class="offer-again" type="button">Send another offer</button>';
    form.insertBefore(done, nav);

    function finish(name) {
        done.querySelector(".offer-done-text").textContent = `Thanks${name ? `, ${name}` : ""}. Your offer is on its way to my inbox.`;
        form.dataset.step = "done";
        head.querySelectorAll(".offer-steps li").forEach((item) => {
            item.classList.add("is-done");
            item.removeAttribute("aria-current");
        });
        done.querySelector(".offer-again").focus({ preventScroll: true });
    }

    done.querySelector(".offer-again").addEventListener("click", () => {
        form.reset();
        form.classList.remove("is-signed");
        nameInput.dispatchEvent(new Event("input"));
        sending = false;
        submit.disabled = false;
        setOfferStep(1, true);
    });

    // Send in the background so visitors stay on the site. If Formspree turns
    // the request down (reCAPTCHA still on for the form, or a network error),
    // fall back to the classic post so the message is never lost.
    form.addEventListener("submit", async (event) => {
        if (!inHub()) return;
        event.preventDefault();
        if (sending) return;
        if (![1, 2, 3].every(stepIsValid)) return;
        sending = true;
        submit.disabled = true;
        const name = nameInput.value.trim();
        let sent = false;
        try {
            const response = await fetch(form.action, {
                method: "POST",
                body: new FormData(form),
                headers: { Accept: "application/json" },
            });
            sent = response.ok;
        } catch (error) {
            sent = false;
        }
        if (!sent) {
            count("offer-fallback", "Offer fell back to the Formspree page");
            HTMLFormElement.prototype.submit.call(form);
            return;
        }
        form.classList.add("is-signed");
        sound("stamp");
        count("offer-signed", "Signed the transfer offer");
        window.setTimeout(() => finish(name), motion ? 650 : 0);
    });

    handlers.contact = {
        arrive() {
            setOfferStep(offerStep, false);
        },
    };

    setOfferStep(1, false);
})();
