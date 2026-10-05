window.__dealReady = true;

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
}

cards.forEach((card) => {
    card.querySelector(".c-flip").addEventListener("click", () => setFlipped(card, true));
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
});

const pageTabs = Array.from(document.querySelectorAll(".page-tab"));

function showPage(tab, moveFocus) {
    pageTabs.forEach((other) => {
        const selected = other === tab;
        other.setAttribute("aria-selected", String(selected));
        other.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(other.getAttribute("aria-controls"));
        panel.hidden = !selected;
        if (selected) dealPanel(panel);
    });
    if (moveFocus) tab.focus();
}

pageTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => showPage(tab, false));
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
    }, { threshold: 0.15 });
    observer.observe(binderPage);
}
