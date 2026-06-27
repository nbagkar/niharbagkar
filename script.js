const root = document.documentElement;
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");
const menuToggle = document.getElementById("menu-toggle");
const siteNav = document.getElementById("site-nav");
const navLinks = Array.from(document.querySelectorAll(".site-nav a"));
const sections = Array.from(document.querySelectorAll("main section[id]"));

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
    themeToggle.addEventListener("click", () => {
        const darkMode = root.getAttribute("data-theme") === "dark";
        setTheme(darkMode ? "light" : "dark");
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
revealItems.forEach((item, idx) => {
    item.style.transitionDelay = `${Math.min(idx * 45, 260)}ms`;
});
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
        { threshold: 0.14 }
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
