const root = document.documentElement;
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");
const menuToggle = document.getElementById("menu-toggle");
const siteNav = document.getElementById("site-nav");
const navLinks = Array.from(document.querySelectorAll(".site-nav a"));
const sections = Array.from(document.querySelectorAll("main section[id]"));
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const chapterNames = {
    story: "Story",
    thesis: "Thesis",
    work: "Work",
    testimonials: "Testimonials",
    timeline: "Journey",
    proof: "Proof",
    contact: "Contact",
    catalog: "Archive"
};
const sectionAccents = {
    story: { start: "#ff5a36", end: "#ff9a58" },
    thesis: { start: "#cc3f22", end: "#09c184" },
    work: { start: "#09c184", end: "#35b7ff" },
    testimonials: { start: "#8b5cf6", end: "#ff7f5f" },
    timeline: { start: "#ff7f5f", end: "#f4b860" },
    proof: { start: "#f4b860", end: "#3ce5ae" },
    contact: { start: "#3ce5ae", end: "#ff5a36" }
};
const progressBar = document.getElementById("scroll-progress-bar");

function createChapterLabel() {
    if (!sections.length) return null;
    const existing = document.querySelector("[data-chapter-label]");
    if (existing) {
        return existing;
    }

    const badge = document.createElement("aside");
    badge.className = "chapter-label";
    badge.setAttribute("data-chapter-label", "true");
    badge.setAttribute("aria-live", "polite");
    badge.innerHTML = `
        <span class="chapter-label-kicker">Chapter</span>
        <span class="chapter-label-value" data-chapter-value></span>
    `;

    document.body.appendChild(badge);
    return badge;
}

const chapterLabel = createChapterLabel();

function humanizeSectionName(sectionId) {
    if (!sectionId) return "";
    if (chapterNames[sectionId]) {
        return chapterNames[sectionId];
    }
    return sectionId
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function updateChapterLabel(sectionId) {
    if (!chapterLabel) return;
    const valueNode = chapterLabel.querySelector("[data-chapter-value]");
    if (!valueNode) return;

    const chapterName = humanizeSectionName(sectionId);
    if (!chapterName) {
        chapterLabel.classList.remove("is-visible");
        return;
    }

    valueNode.textContent = chapterName;
    chapterLabel.classList.add("is-visible");
}

function setProgressAccent(sectionId) {
    if (!progressBar) return;
    const accent = sectionAccents[sectionId] || sectionAccents.story;
    progressBar.style.background = `linear-gradient(90deg, ${accent.start}, ${accent.end})`;
    progressBar.style.boxShadow = `0 0 18px ${accent.start}55`;
}

setProgressAccent("story");

function setTheme(mode) {
    if (mode === "dark") {
        root.setAttribute("data-theme", "dark");
        if (themeIcon) {
            themeIcon.classList.remove("fa-moon");
            themeIcon.classList.add("fa-sun");
        }
    } else {
        root.removeAttribute("data-theme");
        if (themeIcon) {
            themeIcon.classList.remove("fa-sun");
            themeIcon.classList.add("fa-moon");
        }
    }
    localStorage.setItem("theme", mode);
}

function preferredTheme() {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") {
        return saved;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

if (themeToggle) {
    setTheme(preferredTheme());
    themeToggle.setAttribute("aria-pressed", String(root.getAttribute("data-theme") === "dark"));
    themeToggle.addEventListener("click", () => {
        const darkMode = root.getAttribute("data-theme") === "dark";
        const nextMode = darkMode ? "light" : "dark";
        setTheme(nextMode);
        themeToggle.setAttribute("aria-pressed", String(nextMode === "dark"));
    });
}

if (menuToggle && siteNav) {
    menuToggle.addEventListener("click", () => {
        const next = !siteNav.classList.contains("open");
        siteNav.classList.toggle("open", next);
        menuToggle.setAttribute("aria-expanded", String(next));
    });

    navLinks.forEach((link) => {
        link.addEventListener("click", () => {
            siteNav.classList.remove("open");
            menuToggle.setAttribute("aria-expanded", "false");
        });
    });
}

const revealItems = document.querySelectorAll(".reveal");
if (!prefersReducedMotion) {
    revealItems.forEach((item, idx) => {
        item.style.transitionDelay = `${Math.min(idx * 45, 260)}ms`;
    });
}
if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    revealObserver.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.22 }
    );

    revealItems.forEach((item) => revealObserver.observe(item));
} else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
}

function updateActiveLink() {
    const scrollLine = window.scrollY + window.innerHeight * 0.34;
    let activeId = "";

    sections.forEach((section) => {
        const top = section.offsetTop;
        const bottom = top + section.offsetHeight;
        if (scrollLine >= top && scrollLine < bottom) {
            activeId = section.id;
        }
    });

    navLinks.forEach((link) => {
        const href = link.getAttribute("href") || "";
        const matches = href === `#${activeId}`;
        link.classList.toggle("active", matches);
        if (matches) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });

    setProgressAccent(activeId || "story");
    updateChapterLabel(activeId || sections[0]?.id || "");
}

window.addEventListener("scroll", updateActiveLink, { passive: true });
window.addEventListener("resize", updateActiveLink);
updateActiveLink();

function updateScrollProgress() {
    if (!progressBar) return;
    const scrollTop = window.scrollY;
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
    progressBar.style.width = `${progress}%`;
}

window.addEventListener("scroll", updateScrollProgress, { passive: true });
window.addEventListener("resize", updateScrollProgress);
updateScrollProgress();

const allProjectCards = Array.from(document.querySelectorAll(".project-card"));
const archiveProjectCards = Array.from(document.querySelectorAll("[data-project-grid] .project-card"));

function createProjectModal() {
    const existing = document.querySelector("[data-project-modal]");
    if (existing) {
        return existing;
    }

    const modal = document.createElement("div");
    modal.className = "project-modal";
    modal.setAttribute("data-project-modal", "true");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
        <div class="project-modal-backdrop" data-project-modal-close></div>
        <div class="project-modal-panel" role="document">
            <button class="project-modal-close" type="button" data-project-modal-close aria-label="Close project details">×</button>
            <div class="project-modal-media">
                <img alt="" data-project-modal-image>
            </div>
            <div class="project-modal-body">
                <p class="section-kicker" data-project-modal-meta></p>
                <h2 data-project-modal-title></h2>
                <p class="project-modal-description" data-project-modal-description></p>
                <ul class="project-modal-impact" data-project-modal-impact></ul>
                <a class="btn btn-solid project-modal-link" data-project-modal-link target="_blank" rel="noopener">Open Project</a>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    return modal;
}

const projectModal = allProjectCards.length ? createProjectModal() : null;

function getCardDescription(card) {
    return Array.from(card.children).find((child) => child.tagName === "P")?.textContent.trim() || "";
}

function openProjectModal(card) {
    if (!projectModal) return;

    const title = card.querySelector("h3")?.textContent.trim() || "Project";
    const meta = Array.from(card.querySelectorAll(".project-meta span"))
        .map((item) => item.textContent.trim())
        .filter(Boolean)
        .join(" · ");
    const description = getCardDescription(card);
    const impactItems = Array.from(card.querySelectorAll(".impact-list li")).map((item) => item.textContent.trim());
    const image = card.querySelector(".project-cover");
    const link = card.querySelector("a[href]");

    const modalImage = projectModal.querySelector("[data-project-modal-image]");
    const modalMeta = projectModal.querySelector("[data-project-modal-meta]");
    const modalTitle = projectModal.querySelector("[data-project-modal-title]");
    const modalDescription = projectModal.querySelector("[data-project-modal-description]");
    const modalImpact = projectModal.querySelector("[data-project-modal-impact]");
    const modalLink = projectModal.querySelector("[data-project-modal-link]");

    if (modalImage && image) {
        modalImage.src = image.getAttribute("src") || image.src;
        modalImage.alt = image.getAttribute("alt") || title;
    }

    if (modalMeta) modalMeta.textContent = meta;
    if (modalTitle) modalTitle.textContent = title;
    if (modalDescription) modalDescription.textContent = description;

    if (modalImpact) {
        modalImpact.innerHTML = impactItems.map((item) => `<li>${item}</li>`).join("");
    }

    if (modalLink && link) {
        modalLink.href = link.href;
        modalLink.textContent = link.textContent.trim() || "Open Project";
    }

    projectModal.classList.add("is-open");
    projectModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    const closeButton = projectModal.querySelector("[data-project-modal-close]");
    closeButton?.focus();
}

function closeProjectModal() {
    if (!projectModal) return;
    projectModal.classList.remove("is-open");
    projectModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
}

if (projectModal) {
    projectModal.addEventListener("click", (event) => {
        if (event.target instanceof Element && event.target.closest("[data-project-modal-close]")) {
            closeProjectModal();
        }
    });

    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeProjectModal();
        }
    });
}

if (allProjectCards.length) {
    allProjectCards.forEach((card) => {
        card.tabIndex = 0;
        card.setAttribute("aria-haspopup", "dialog");
        card.setAttribute("aria-label", `Open project details for ${card.querySelector("h3")?.textContent.trim() || "project"}`);

        card.addEventListener("click", (event) => {
            if (event.target instanceof Element && event.target.closest("a, button, input, textarea, select, label")) {
                return;
            }
            openProjectModal(card);
        });

        card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openProjectModal(card);
            }
        });
    });
}

const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));

if (filterButtons.length && archiveProjectCards.length) {
    filterButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const filter = button.getAttribute("data-filter") || "all";
            filterButtons.forEach((btn) => btn.classList.remove("active"));
            button.classList.add("active");

            archiveProjectCards.forEach((card) => {
                const categories = (card.getAttribute("data-category") || "").split(/\s+/);
                const shouldShow = filter === "all" || categories.includes(filter);
                card.classList.toggle("is-hidden", !shouldShow);
            });
        });
    });
}

const randomProjectButton = document.querySelector("[data-random-project]");
if (randomProjectButton && archiveProjectCards.length) {
    randomProjectButton.addEventListener("click", () => {
        const visibleCards = archiveProjectCards.filter((card) => !card.classList.contains("is-hidden"));
        if (!visibleCards.length) return;
        const selected = visibleCards[Math.floor(Math.random() * visibleCards.length)];
        archiveProjectCards.forEach((card) => card.classList.remove("spotlight"));
        selected.classList.add("spotlight");
        selected.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
    });
}

if (!prefersReducedMotion && window.matchMedia("(pointer: fine)").matches) {
    allProjectCards.forEach((card) => {
        card.addEventListener("mouseenter", () => {
            card.classList.add("is-magnetic");
        });

        card.addEventListener("mousemove", (event) => {
            const rect = card.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const offsetX = ((event.clientX - centerX) / rect.width) * 10;
            const offsetY = ((event.clientY - centerY) / rect.height) * 10;
            const rotateY = offsetX * 0.35;
            const rotateX = -offsetY * 0.35;
            card.style.transform = `translate3d(${offsetX.toFixed(2)}px, ${offsetY.toFixed(2)}px, 0) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
        });

        card.addEventListener("mouseleave", () => {
            card.classList.remove("is-magnetic");
            card.style.transform = "";
        });
    });

    const spotlightTargets = Array.from(document.querySelectorAll(".hero-visual, .thesis-card"));
    spotlightTargets.forEach((target) => {
        target.classList.add("spotlight-surface");
        target.addEventListener("mousemove", (event) => {
            const rect = target.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            target.style.setProperty("--spot-x", `${x}px`);
            target.style.setProperty("--spot-y", `${y}px`);
            target.style.setProperty("--spot-active", "1");
        });

        target.addEventListener("mouseleave", () => {
            target.style.setProperty("--spot-active", "0");
        });
    });
}

const ribbon = document.querySelector(".hero-ribbon");
if (ribbon && !prefersReducedMotion && "IntersectionObserver" in window) {
    const ribbonObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                ribbon.classList.toggle("is-paused", !entry.isIntersecting);
            });
        },
        { threshold: 0.1 }
    );
    ribbonObserver.observe(ribbon);
}

const contactForm = document.querySelector(".contact-form");
if (contactForm) {
    const formStatus = contactForm.querySelector("[data-form-status]");
    contactForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (formStatus) {
            formStatus.className = "form-status";
            formStatus.textContent = "Sending message...";
        }

        try {
            const response = await fetch(contactForm.action, {
                method: contactForm.method,
                body: new FormData(contactForm),
                headers: {
                    Accept: "application/json"
                }
            });

            if (!response.ok) {
                throw new Error("Form submit failed");
            }

            contactForm.reset();
            if (formStatus) {
                formStatus.className = "form-status success";
                formStatus.textContent = "Message sent. Thanks for reaching out.";
            }
        } catch (error) {
            if (formStatus) {
                formStatus.className = "form-status error";
                formStatus.textContent = "Could not send right now. Please try again in a moment.";
            }
        }
    });
}
