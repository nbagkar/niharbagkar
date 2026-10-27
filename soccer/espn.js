// Fixtures and scores from ESPN's public scoreboard feed (no key, allows
// cross-origin requests). It isn't an official API, so everything that
// reads it goes through here. `dates` is a day (YYYYMMDD) or a whole month
// (YYYYMM); the feed rejects ranges.
window.SoccerESPN = (function () {
    const LEAGUES = [
        { id: "uefa.champions", name: "Champions League", short: "UCL" },
        { id: "eng.1", name: "Premier League", short: "EPL" },
        { id: "esp.1", name: "LaLiga", short: "Liga" },
        { id: "ita.1", name: "Serie A", short: "Serie A" },
        { id: "ger.1", name: "Bundesliga", short: "Buli" },
        { id: "fra.1", name: "Ligue 1", short: "L1" },
        { id: "uefa.europa", name: "Europa League", short: "UEL" },
        { id: "usa.1", name: "MLS", short: "MLS" }
    ];

    async function scoreboard(league, dates) {
        try {
            const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league.id}/scoreboard?dates=${dates}`);
            if (!response.ok) return [];
            const data = await response.json();
            return (data.events || []).map((event) => toMatch(event, league)).filter(Boolean);
        } catch {
            return [];
        }
    }

    function toMatch(event, league) {
        const comp = event.competitions && event.competitions[0];
        if (!comp) return null;
        const side = (where) => comp.competitors.find((c) => c.homeAway === where);
        const home = side("home");
        const away = side("away");
        if (!home || !away) return null;
        const status = (comp.status || event.status || {}).type || {};
        const team = (c) => ({ name: c.team.shortDisplayName || c.team.displayName, logo: c.team.logo, score: c.score });
        return {
            id: event.id,
            league,
            kickoff: new Date(event.date),
            state: status.state, // pre | in | post
            completed: Boolean(status.completed),
            detail: status.shortDetail || "",
            home: team(home),
            away: team(away)
        };
    }

    return { LEAGUES, scoreboard };
})();
