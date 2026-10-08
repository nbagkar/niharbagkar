window.__dealReady = true;

function track(name, title) {
    if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({ path: name, title: title || name, event: true });
    }
}

function slug(text) {
    return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const cards = document.querySelectorAll(".card");
const canHover = window.matchMedia("(hover: hover)").matches;

function setFlipped(card, flipped) {
    const front = card.querySelector(".face-front");
    const back = card.querySelector(".face-back");
    card.classList.toggle("is-flipped", flipped);
    front.inert = flipped;
    back.inert = !flipped;
    card.querySelector(".c-flip").setAttribute("aria-expanded", String(flipped));
    (flipped ? back.querySelector(".c-link") : card.querySelector(".c-flip")).focus({ preventScroll: true });
    if (flipped && card.classList.contains("player")) countUp(back);
}

const motionOK = document.documentElement.classList.contains("js");

function countUp(root) {
    if (!motionOK) return;
    const started = performance.now();
    const counters = Array.from(root.querySelectorAll("[data-count]"));
    function frame(now) {
        const t = Math.min(1, (now - started) / 1100);
        const eased = 1 - Math.pow(1 - t, 3);
        counters.forEach((el) => {
            const decimals = Number(el.dataset.decimals || 0);
            el.textContent = (Number(el.dataset.count) * eased).toFixed(decimals);
        });
        if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

cards.forEach((card) => {
    const cardName = card.querySelector(".c-head h3").textContent.trim();
    card.querySelector(".c-flip").addEventListener("click", () => {
        setFlipped(card, true);
        track(`flip-${slug(cardName)}`, `Flipped card: ${cardName}`);
    });
    card.querySelector(".c-back").addEventListener("click", () => setFlipped(card, false));
    card.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && card.classList.contains("is-flipped")) {
            setFlipped(card, false);
        }
    });

    if (canHover && card.classList.contains("is-foil")) {
        const front = card.querySelector(".face-front");
        card.addEventListener("pointermove", (event) => {
            const rect = card.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width;
            const y = (event.clientY - rect.top) / rect.height;
            front.style.setProperty("--mx", `${x * 100}%`);
            front.style.setProperty("--my", `${y * 100}%`);
            front.style.setProperty("--bgx", `${x * 100}%`);
            front.style.setProperty("--bgy", `${y * 100}%`);
        });
    }

    if (canHover && motionOK && card.classList.contains("player")) {
        card.addEventListener("pointermove", (event) => {
            const rect = card.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width - 0.5;
            const y = (event.clientY - rect.top) / rect.height - 0.5;
            card.classList.add("is-tilting");
            card.style.setProperty("--rx", `${(-y * 14).toFixed(2)}deg`);
            card.style.setProperty("--ry", `${(x * 18).toFixed(2)}deg`);
        });
        card.addEventListener("pointerleave", () => {
            card.classList.remove("is-tilting");
            card.style.removeProperty("--rx");
            card.style.removeProperty("--ry");
        });
    }
});

const pageTabs = Array.from(document.querySelectorAll(".page-tab"));

const pagesStage = document.querySelector(".pages");
const TURN_MS = 900;
let activeTurn = null;

function panelFor(tab) {
    return document.getElementById(tab.getAttribute("aria-controls"));
}

function endTurn() {
    if (!activeTurn) return;
    const turn = activeTurn;
    activeTurn = null;
    turn.animations.forEach((animation) => animation.cancel());
    turn.cleanup();
}

function turnPage(fromPanel, toPanel, forward) {
    const sheet = forward ? fromPanel : toPanel;
    const under = forward ? toPanel : fromPanel;
    const shades = [sheet, under].map((panel) => {
        const shade = document.createElement("div");
        shade.className = "turn-shade";
        panel.appendChild(shade);
        return shade;
    });
    const flap = document.createElement("div");
    flap.className = "turn-flap";
    sheet.appendChild(flap);
    sheet.classList.add("is-sheet");
    under.classList.add("is-under");
    pagesStage.classList.add("is-turning");

    // Peel the free corner up first, then swing the sheet over on the ring spine.
    const rect = sheet.getBoundingClientRect();
    const peel = `${Math.round(Math.min(rect.width, rect.height) * 0.28)}px`;
    const cut = (size) => `polygon(0 0, 100% 0, 100% calc(100% - ${size}), calc(100% - ${size}) 100%, 0 100%)`;
    const frames = {
        sheet: [
            { transform: "rotateY(0deg)", clipPath: cut("0px"), offset: 0 },
            { transform: "rotateY(-4deg)", clipPath: cut(peel), offset: 0.38 },
            { transform: "rotateY(-92deg)", clipPath: cut(peel), offset: 1 },
        ],
        flap: [
            { width: "0px", height: "0px", offset: 0 },
            { width: peel, height: peel, offset: 0.38 },
            { width: peel, height: peel, offset: 1 },
        ],
    };
    const ordered = (list) => (forward ? list : list.slice().reverse().map((frame) => ({ ...frame, offset: 1 - frame.offset })));
    const timing = { duration: TURN_MS, easing: "cubic-bezier(0.4, 0, 0.4, 1)", fill: "both" };
    const animations = [
        sheet.animate(ordered(frames.sheet), timing),
        flap.animate(ordered(frames.flap), timing),
        shades[0].animate({ opacity: forward ? [0, 1] : [1, 0] }, timing),
        shades[1].animate({ opacity: forward ? [1, 0] : [0, 1] }, timing),
    ];

    const turn = {
        animations,
        cleanup() {
            shades.forEach((shade) => shade.remove());
            flap.remove();
            sheet.classList.remove("is-sheet");
            under.classList.remove("is-under");
            pagesStage.classList.remove("is-turning");
            fromPanel.hidden = true;
        },
    };
    activeTurn = turn;
    animations[0].onfinish = () => {
        if (activeTurn === turn) endTurn();
    };
}

function showPage(tab, moveFocus) {
    const fromTab = pageTabs.find((other) => other.getAttribute("aria-selected") === "true");
    if (moveFocus) tab.focus();
    if (tab === fromTab) return;
    endTurn();
    pageTabs.forEach((other) => {
        const selected = other === tab;
        other.setAttribute("aria-selected", String(selected));
        other.tabIndex = selected ? 0 : -1;
    });
    const fromPanel = panelFor(fromTab);
    const toPanel = panelFor(tab);
    toPanel.hidden = false;
    dealPanel(toPanel);
    if (motionOK && pagesStage && toPanel.animate) {
        turnPage(fromPanel, toPanel, pageTabs.indexOf(tab) > pageTabs.indexOf(fromTab));
    } else {
        fromPanel.hidden = true;
    }
}

function stepPage(step) {
    const index = pageTabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
    showPage(pageTabs[(index + step + pageTabs.length) % pageTabs.length], false);
}

const pageCorner = document.querySelector(".page-corner");
if (pageCorner) {
    pageCorner.addEventListener("click", () => {
        stepPage(1);
        track("binder-corner", "Turned binder page from the corner");
    });
}

if (pagesStage) {
    let swipeStart = null;
    let suppressClick = false;
    pagesStage.addEventListener("touchstart", (event) => {
        const touch = event.touches[0];
        swipeStart = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null;
    }, { passive: true });
    pagesStage.addEventListener("touchend", (event) => {
        if (!swipeStart) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - swipeStart.x;
        const dy = touch.clientY - swipeStart.y;
        swipeStart = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            suppressClick = true;
            window.setTimeout(() => { suppressClick = false; }, 400);
            stepPage(dx < 0 ? 1 : -1);
            track("binder-swipe", "Swiped binder page");
        }
    }, { passive: true });
    pagesStage.addEventListener("click", (event) => {
        if (!suppressClick) return;
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
    }, true);
}

pageTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
        showPage(tab, false);
        track(`binder-${tab.id}`, `Opened binder ${tab.firstChild.textContent.trim()}`);
    });
    tab.addEventListener("keydown", (event) => {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (step) {
            event.preventDefault();
            showPage(pageTabs[(index + step + pageTabs.length) % pageTabs.length], true);
        }
    });
});

const DEAL_STAGGER_MS = 90;
const DEAL_DURATION_MS = 800;

function dealPanel(panel) {
    if (panel.classList.contains("is-dealt")) return;
    const panelCards = panel.querySelectorAll(".card");
    panelCards.forEach((card, index) => card.style.setProperty("--i", index));
    panel.classList.add("is-dealing", "is-dealt");
    window.setTimeout(() => panel.classList.remove("is-dealing"), panelCards.length * DEAL_STAGGER_MS + DEAL_DURATION_MS + 100);
}

const dealPages = Array.from(document.querySelectorAll(".page-panel"));
const binderPage = document.querySelector(".binder-page");

if (!document.documentElement.classList.contains("js") || !("IntersectionObserver" in window)) {
    dealPages.forEach((panel) => panel.classList.add("is-dealt"));
} else {
    const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            dealPanel(dealPages[0]);
        }
    }, { threshold: 0 });
    observer.observe(binderPage);
}

document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    if (link.dataset.track) track(link.dataset.track, `Clicked: ${link.textContent.trim()}`);
    const href = link.getAttribute("href");
    if (!/^(https?:|mailto:)/.test(href)) return;
    const card = link.closest(".card");
    const label = card ? card.querySelector(".c-head h3").textContent.trim() : link.textContent.trim();
    const kind = href.startsWith("mailto:") ? "email" : "out";
    if (kind === "email") {
        track("email-click", "Clicked email link");
    } else {
        track(`out-${slug(label)}`, `Outbound: ${label} → ${href.split("?")[0]}`);
    }
});
