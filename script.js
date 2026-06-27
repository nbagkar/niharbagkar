const root = document.documentElement;
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");
const menuToggle = document.getElementById("menu-toggle");
const siteNav = document.getElementById("site-nav");
const navLinks = Array.from(document.querySelectorAll(".site-nav a"));
const sections = Array.from(document.querySelectorAll("main section[id]"));
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
}

window.addEventListener("scroll", updateActiveLink, { passive: true });
window.addEventListener("resize", updateActiveLink);
updateActiveLink();

const progressBar = document.getElementById("scroll-progress-bar");
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
