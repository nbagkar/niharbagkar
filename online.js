(function () {
    // Friend rooms for Kick off and Five-a-side: a thin layer over Supabase Realtime broadcast and
    // presence. Nothing touches the database; the library is loaded only when
    // someone opens or joins a room.
    const PROJECT_URL = "https://cnqxfazzvpmcvtttkjed.supabase.co";
    const PUBLISHABLE_KEY = "sb_publishable_wcwDmj61WMUcgRVFNmL0SA_6RY0vrTw";
    const LIBRARY = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.75.0/dist/umd/supabase.min.js";
    // No I or O, so codes are easy to read out loud.
    const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

    let client = null;
    let loading = null;

    function loadLibrary() {
        if (window.supabase && window.supabase.createClient) return Promise.resolve();
        if (!loading) {
            loading = new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src = LIBRARY;
                script.async = true;
                script.onload = resolve;
                script.onerror = () => {
                    loading = null;
                    reject(new Error("Could not load the online library."));
                };
                document.head.appendChild(script);
            });
        }
        return loading;
    }

    // Random letters can spell things; skip codes containing any of these.
    const AVOID = ["FCK", "FUK", "FUC", "SHT", "CNT", "CUM", "KKK", "NGR", "NIG", "FAG", "DCK", "DIK", "ASS", "SEX",
        "TIT", "XXX", "KYS", "WTF", "POO", "GAY", "NAZ", "JEW", "RAP", "PUS", "VAG", "HOE", "SLT", "TWT", "BCH", "DMN",
        "PNS", "PSS", "STD", "FKN", "FCKN"];

    function newCode() {
        for (;;) {
            let code = "";
            const values = crypto.getRandomValues(new Uint8Array(4));
            values.forEach((value) => (code += LETTERS[value % LETTERS.length]));
            if (!AVOID.some((word) => code.includes(word))) return code;
        }
    }

    function cleanCode(text) {
        return String(text || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    }

    // Join room `code` as "host" or "guest". handlers.message(payload) gets
    // every broadcast from the other player; handlers.peers(list) gets the
    // other people in the room whenever that changes. `game` keeps each
    // game's rooms apart.
    async function open(code, role, handlers, game) {
        await loadLibrary();
        if (!client) {
            client = window.supabase.createClient(PROJECT_URL, PUBLISHABLE_KEY, {
                realtime: { params: { eventsPerSecond: 40 } },
            });
        }
        const id = `${role}-${newCode()}${Date.now() % 10000}`;
        const channel = client.channel(`${game || "kickoff"}:${code}`, {
            config: { broadcast: { self: false }, presence: { key: id } },
        });
        channel.on("broadcast", { event: "msg" }, ({ payload }) => handlers.message(payload));
        channel.on("presence", { event: "sync" }, () => {
            const state = channel.presenceState();
            const others = Object.keys(state)
                .filter((key) => key !== id)
                .map((key) => ({ id: key, ...(state[key][0] || {}) }));
            handlers.peers(others);
        });

        await new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error("Could not reach the room. Check your connection.")), 10000);
            channel.subscribe((status) => {
                if (status === "SUBSCRIBED") {
                    window.clearTimeout(timer);
                    resolve();
                } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                    window.clearTimeout(timer);
                    reject(new Error("Could not reach the room. Check your connection."));
                }
            });
        });
        await channel.track({ role, joined: Date.now() });

        return {
            code,
            role,
            id,
            send(payload) {
                channel.send({ type: "broadcast", event: "msg", payload });
            },
            close() {
                channel.untrack();
                client.removeChannel(channel);
            },
        };
    }

    window.KickoffNet = { newCode, cleanCode, open };
})();
