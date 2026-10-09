(function () {
    // Menu sounds, synthesised on the fly so there are no audio files to load.
    // Off until the visitor turns them on; the choice is remembered.
    const button = document.querySelector(".sound-toggle");
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!button || !Context) {
        if (button) button.hidden = true;
        window.sfx = () => {};
        return;
    }

    let on = false;
    let ctx = null;
    let master = null;

    try {
        on = localStorage.getItem("nb-sound") === "on";
    } catch (error) {
        /* Private mode: sound stays off. */
    }

    function audio() {
        if (!ctx) {
            ctx = new Context();
            master = ctx.createGain();
            master.gain.value = 0.5;
            master.connect(ctx.destination);
        }
        if (ctx.state === "suspended") ctx.resume();
        return ctx;
    }

    function tone(freq, length, { type = "triangle", gain = 0.12, at = 0, to = null } = {}) {
        const now = audio().currentTime + at;
        const osc = ctx.createOscillator();
        const amp = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (to) osc.frequency.exponentialRampToValueAtTime(to, now + length);
        amp.gain.setValueAtTime(0.0001, now);
        amp.gain.exponentialRampToValueAtTime(gain, now + 0.01);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + length);
        osc.connect(amp).connect(master);
        osc.start(now);
        osc.stop(now + length + 0.02);
    }

    function noise(length, { gain = 0.15, at = 0, from = 800, to = 3000, q = 1.2 } = {}) {
        const now = audio().currentTime + at;
        const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const amp = ctx.createGain();
        src.buffer = buffer;
        filter.type = "bandpass";
        filter.Q.value = q;
        filter.frequency.setValueAtTime(from, now);
        filter.frequency.exponentialRampToValueAtTime(to, now + length);
        amp.gain.setValueAtTime(0.0001, now);
        amp.gain.exponentialRampToValueAtTime(gain, now + length * 0.2);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + length);
        src.connect(filter).connect(amp).connect(master);
        src.start(now);
    }

    const SOUNDS = {
        move: () => tone(880, 0.05, { type: "square", gain: 0.025 }),
        select: () => {
            tone(520, 0.09, { gain: 0.1 });
            tone(780, 0.14, { gain: 0.1, at: 0.06 });
            noise(0.35, { gain: 0.05, from: 400, to: 4000 });
        },
        back: () => {
            tone(620, 0.08, { gain: 0.08 });
            tone(410, 0.12, { gain: 0.08, at: 0.06 });
        },
        tab: () => tone(700, 0.06, { type: "square", gain: 0.03 }),
        rip: () => noise(0.55, { gain: 0.25, from: 600, to: 5000, q: 0.8 }),
        reveal: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.4, { gain: 0.08, at: i * 0.08 })),
        stamp: () => {
            tone(140, 0.18, { type: "sine", gain: 0.3, to: 60 });
            noise(0.12, { gain: 0.12, from: 300, to: 200 });
        },
        tick: () => tone(660, 0.12, { type: "square", gain: 0.05 }),
        go: () => tone(1320, 0.3, { type: "square", gain: 0.05 }),
        whistle: () => {
            tone(2600, 0.25, { type: "sine", gain: 0.08 });
            tone(2600, 0.55, { type: "sine", gain: 0.08, at: 0.32 });
        },
        goal: () => {
            [392, 523, 659].forEach((f) => tone(f, 0.6, { gain: 0.06 }));
            noise(1.4, { gain: 0.12, from: 500, to: 1500, q: 0.5 });
        },
        unlock: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.22, { gain: 0.07, at: i * 0.07 })),
    };

    function render() {
        button.setAttribute("aria-pressed", String(on));
        button.title = on ? "Sound on" : "Sound off";
    }

    button.addEventListener("click", () => {
        on = !on;
        try {
            localStorage.setItem("nb-sound", on ? "on" : "off");
        } catch (error) {
            /* Private mode: the choice lasts for this visit only. */
        }
        render();
        if (on) SOUNDS.select();
        if (typeof track === "function") track(on ? "sound-on" : "sound-off", on ? "Turned sound on" : "Turned sound off");
    });

    window.sfx = (name) => {
        if (!on || !SOUNDS[name]) return;
        try {
            SOUNDS[name]();
        } catch (error) {
            /* Audio can fail before a user gesture; stay quiet. */
        }
    };

    render();
})();
