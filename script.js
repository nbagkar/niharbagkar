const root = document.documentElement;
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");
const menuToggle = document.getElementById("menu-toggle");
const paletteToggle = document.getElementById("palette-toggle");
const siteNav = document.getElementById("site-nav");
const navLinks = Array.from(document.querySelectorAll(".site-nav a"));
const sections = Array.from(document.querySelectorAll("main section[id]"));
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
const projectModal = document.getElementById("project-modal");
const projectModalTitle = projectModal?.querySelector("[data-project-modal-title]");
const projectModalDescription = projectModal?.querySelector("[data-project-modal-description]");
const projectModalMeta = projectModal?.querySelector("[data-project-modal-meta]");
const projectModalImage = projectModal?.querySelector("[data-project-modal-image]");
const projectModalPoints = projectModal?.querySelector("[data-project-modal-points]");
const projectModalLink = projectModal?.querySelector("[data-project-modal-link]");
const projectModalClose = projectModal?.querySelector("[data-close-project-modal]");
const paletteModal = document.getElementById("quick-jump-palette");
const paletteInput = paletteModal?.querySelector("[data-palette-input]");
const paletteList = paletteModal?.querySelector("[data-palette-list]");
const paletteClose = paletteModal?.querySelector("[data-close-palette]");
const paletteItems = Array.from(document.querySelectorAll("[data-palette-list] .palette-item"));
const projectCards = Array.from(document.querySelectorAll(".project-card"));
let lastProjectTrigger = null;
let lastPaletteTrigger = null;

function setProgressAccent(sectionId) {
    if (!progressBar) return;
    const accent = sectionAccents[sectionId] || sectionAccents.story;
    progressBar.style.background = `linear-gradient(90deg, ${accent.start}, ${accent.end})`;
    progressBar.style.boxShadow = `0 0 18px ${accent.start}55`;
}

setProgressAccent("story");

function openDialog(dialog) {
    if (!dialog) return;
    dialog.hidden = false;
    requestAnimationFrame(() => {
        dialog.classList.add("open");
    });
    document.body.classList.add("dialog-open");
}

function closeDialog(dialog) {
    if (!dialog) return;
    dialog.classList.remove("open");
    document.body.classList.remove("dialog-open");
    window.setTimeout(() => {
        dialog.hidden = true;
    }, 180);
}

function getProjectData(card) {
    const title = card.querySelector("h3")?.textContent?.trim() || "Project";
    const meta = Array.from(card.querySelectorAll(".project-meta span")).map((item) => item.textContent?.trim()).filter(Boolean);
    const description = card.querySelector("p")?.textContent?.trim() || "";
    const points = Array.from(card.querySelectorAll(".impact-list li")).map((item) => item.textContent?.trim()).filter(Boolean);
    const link = card.querySelector("a");
    const image = card.querySelector(".project-cover");

    return {
        title,
        meta,
        description,
        points,
        linkHref: link?.href || "",
        linkText: link?.textContent?.trim() || "Open Project",
        imageSrc: image?.getAttribute("src") || "",
        imageAlt: image?.getAttribute("alt") || title
    };
}

function openProjectModal(card) {
    if (!projectModal || !projectModalTitle || !projectModalDescription || !projectModalMeta || !projectModalImage || !projectModalPoints || !projectModalLink) return;
    const data = getProjectData(card);

    projectModalTitle.textContent = data.title;
    projectModalDescription.textContent = data.description;
    projectModalMeta.innerHTML = data.meta.map((item) => `<span>${item}</span>`).join("");
    projectModalPoints.innerHTML = data.points.map((item) => `<li>${item}</li>`).join("");
    projectModalLink.href = data.linkHref;
    projectModalLink.textContent = data.linkText;

    if (data.imageSrc) {
        projectModalImage.src = data.imageSrc;
        projectModalImage.alt = data.imageAlt;
        projectModalImage.parentElement?.removeAttribute("hidden");
    } else {
        projectModalImage.removeAttribute("src");
        projectModalImage.alt = "";
        projectModalImage.parentElement?.setAttribute("hidden", "true");
    }

    openDialog(projectModal);
    projectModalClose?.focus();
}

function closeProjectModal() {
    closeDialog(projectModal);
    lastProjectTrigger?.focus();
    lastProjectTrigger = null;
}

function openPalette() {
    if (!paletteModal) return;
    openDialog(paletteModal);
    paletteInput?.focus();
}

function closePalette() {
    closeDialog(paletteModal);
    lastPaletteTrigger?.focus();
    lastPaletteTrigger = null;
}

function filterPalette(query) {
    const normalized = query.trim().toLowerCase();
    paletteItems.forEach((item) => {
        const matches = item.textContent.toLowerCase().includes(normalized);
        item.hidden = !matches;
    });
}

function runPaletteItem(item) {
    const section = item.getAttribute("data-section");
    const url = item.getAttribute("data-url");
    const isIndexPage = location.pathname.endsWith("index.html") || location.pathname.endsWith("/");

    closePalette();

    if (section) {
        const sectionId = section.startsWith("#") ? section.slice(1) : section;
        const target = document.getElementById(sectionId);
        if (target && isIndexPage) {
            target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
            history.replaceState(null, "", `#${sectionId}`);
        } else {
            window.location.href = `index.html#${sectionId}`;
        }
        return;
    }

    if (url) {
        if (/^https?:/i.test(url)) {
            window.open(url, "_blank", "noopener");
        } else {
            window.location.href = url;
        }
    }
}

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

if (paletteToggle) {
    paletteToggle.addEventListener("click", () => {
        lastPaletteTrigger = paletteToggle;
        openPalette();
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

if (projectModal) {
    projectCards.forEach((card) => {
        const primaryLink = card.querySelector("a");
        if (!primaryLink) return;

        card.classList.add("is-clickable");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-haspopup", "dialog");
        card.addEventListener("click", (event) => {
            if (event.target.closest("a,button")) return;
            lastProjectTrigger = card;
            openProjectModal(card);
        });
        primaryLink.addEventListener("click", (event) => {
            event.preventDefault();
            lastProjectTrigger = card;
            openProjectModal(card);
        });
        card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                lastProjectTrigger = card;
                openProjectModal(card);
            }
        });
    });

    projectModal.addEventListener("click", (event) => {
        if (event.target === projectModal) {
            closeProjectModal();
        }
    });

    projectModalClose?.addEventListener("click", closeProjectModal);
}

if (paletteModal) {
    paletteToggle?.setAttribute("aria-controls", "quick-jump-palette");

    paletteModal.addEventListener("click", (event) => {
        if (event.target === paletteModal) {
            closePalette();
        }
    });

    paletteClose?.addEventListener("click", closePalette);
    paletteInput?.addEventListener("input", (event) => {
        filterPalette(event.target.value);
    });

    paletteItems.forEach((item) => {
        item.addEventListener("click", () => runPaletteItem(item));
    });
}

window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        lastPaletteTrigger = paletteToggle || lastPaletteTrigger;
        openPalette();
    }

    if (event.key === "Escape") {
        if (paletteModal && !paletteModal.hidden) {
            closePalette();
        }
        if (projectModal && !projectModal.hidden) {
            closeProjectModal();
        }
    }
});

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

const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
const projectCards = Array.from(document.querySelectorAll("[data-project-grid] .project-card"));

if (filterButtons.length && projectCards.length) {
    filterButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const filter = button.getAttribute("data-filter") || "all";
            filterButtons.forEach((btn) => btn.classList.remove("active"));
            button.classList.add("active");

            projectCards.forEach((card) => {
                const categories = (card.getAttribute("data-category") || "").split(/\s+/);
                const shouldShow = filter === "all" || categories.includes(filter);
                card.classList.toggle("is-hidden", !shouldShow);
            });
        });
    });
}

const randomProjectButton = document.querySelector("[data-random-project]");
if (randomProjectButton && projectCards.length) {
    randomProjectButton.addEventListener("click", () => {
        const visibleCards = projectCards.filter((card) => !card.classList.contains("is-hidden"));
        if (!visibleCards.length) return;
        const selected = visibleCards[Math.floor(Math.random() * visibleCards.length)];
        projectCards.forEach((card) => card.classList.remove("spotlight"));
        selected.classList.add("spotlight");
        selected.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
    });
}

if (!prefersReducedMotion && window.matchMedia("(pointer: fine)").matches) {
    const tiltCards = Array.from(document.querySelectorAll("[data-tilt]"));
    tiltCards.forEach((card) => {
        card.addEventListener("mousemove", (event) => {
            const rect = card.getBoundingClientRect();
            const px = (event.clientX - rect.left) / rect.width;
            const py = (event.clientY - rect.top) / rect.height;
            const rotateY = (px - 0.5) * 5;
            const rotateX = (0.5 - py) * 5;
            card.style.transform = `translateY(-4px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
        });

        card.addEventListener("mouseleave", () => {
            card.style.transform = "";
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
