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
