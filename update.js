const fs = require("fs");
const path = require("path");
const daily = require("./v2/daily.json");
const weekly = require("./v2/weekly.json");
const event = require("./v2/event.json");

function parseResponse(id, res) {
    const responses = res.split("#");
    const l = Object.fromEntries(responses[0].split(":").map((e, i, a) => i % 2 == 0 ? [e, a[i + 1]] : null).filter(e => e != null));
    const dailyInfo = {
        timelyID: 0,
        dates: []
    };
    if (id == -1) {
        dailyInfo.timelyID = parseInt(l[41]);
        const dailyDate = new Date(daily[0].dates[0]);
        dailyDate.setUTCDate(dailyDate.getUTCDate() + (dailyInfo.timelyID - daily[0].timelyID));
        dailyInfo.dates = [dailyDate.getUTCFullYear() + "-" + (dailyDate.getUTCMonth() + 1).toString().padStart(2, "0") + "-" + dailyDate.getUTCDate().toString().padStart(2, "0")];
    }
    else if (id == -2) {
        dailyInfo.timelyID = parseInt(l[41]) - 100000;
        dailyInfo.dates = weekly[0].dates.map(d => {
            const date = new Date(d);
            date.setUTCDate(date.getUTCDate() + (dailyInfo.timelyID - weekly[0].timelyID) * 7);
            return date.getUTCFullYear() + "-" + (date.getUTCMonth() + 1).toString().padStart(2, "0") + "-" + date.getUTCDate().toString().padStart(2, "0");
        });
    }
    else if (id == -3) {
        dailyInfo.timelyID = parseInt(l[41]) - 200000;
        dailyInfo.dates = [];
        const date = new Date(event[1].dates[event[1].dates.length - 1]);
        const currentDate = new Date(Math.floor(Date.now() / 86400000) * 86400000 - 86400000);
        while (date.getTime() < currentDate.getTime()) {
            date.setUTCDate(date.getUTCDate() + 1);
            event[0].dates.push(date.getUTCFullYear() + "-" + (date.getUTCMonth() + 1).toString().padStart(2, "0") + "-" + date.getUTCDate().toString().padStart(2, "0"));
        }
    }
    return {
        id: parseInt(l[1]),
        name: l[2],
        ...dailyInfo,
        tier: 0
    };
}

const GDDL = [];

async function updateTiersAndStringify(daily) {
    for (let i = 0; i < daily.length; i++) {
        const index = GDDL.findIndex(d => d.id == daily[i].id);
        daily[i].tier = index >= 0 ? GDDL[index].tier : 0;
    }
    return JSON.stringify(daily).replace(/\},\{/g, "},\n  {").replace("[", "[\n  ").slice(0, -1) + "\n]";
}

async function saveDaily(daily, dailyName) {
    await fs.promises.writeFile(path.join(__dirname, "v2", `${dailyName}.json`), await updateTiersAndStringify(daily));
}

async function getDaily(id) { // -1 for daily, -2 for weekly, -3 for event
    const dailyName = id == -1 ? "daily" : id == -2 ? "weekly" : id == -3 ? "event" : "";
    const dailyType = id == -1 ? 21 : id == -2 ? 22 : id == -3 ? 23 : 0;
    const dailyUpper = dailyName[0].toUpperCase() + dailyName.slice(1);
    const dailyJSON = id == -1 ? daily : id == -2 ? weekly : id == -3 ? event : [];
    const response = await fetch("https://www.boomlings.com/database/downloadGJLevel22.php", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": ""
        },
        body: `gameVersion=22&binaryVersion=42&levelID=${id}&secret=Wmfd2893gb7`,
    });
    if (!response.ok) {
        console.log(`${dailyUpper} response not ok: ${response.status}`);
        return await saveDaily(dailyJSON, dailyName);
    }
    const dailyText = await response.text();
    if (dailyText == "-1") {
        const safe = await getSafe(dailyType);
        if (safe.length == 0) return await saveDaily(dailyJSON, dailyName);

        const safeIndex = safe.findIndex(x => x.id == dailyJSON[0].id);
        if (safeIndex == -1) {
            console.log(`No safe ${dailyName} found`);
            return await saveDaily(dailyJSON, dailyName);
        }

        const firstID = dailyJSON[0].timelyID;
        const firstDates = dailyJSON[0].dates;
        const dailyNames = [];
        for (let i = safeIndex - 1; i >= 0; i--) {
            safe[i].timelyID = firstID + safeIndex - i;
            safe[i].dates = firstDates.map(d => {
                const date = new Date(d);
                date.setUTCDate(date.getUTCDate() + safe[i].timelyID - firstID);
                return date.getUTCFullYear() + "-" + (date.getUTCMonth() + 1).toString().padStart(2, "0") + "-" + date.getUTCDate().toString().padStart(2, "0");
            });
            dailyNames.push(safe[i].name);
            delete safe[i].name;
            dailyJSON.unshift(safe[i]);
        }
        if (dailyNames.length > 0) console.log(dailyNames.join(" / "));
        else console.log(`${dailyUpper} already up to date`);
        return await saveDaily(dailyJSON, dailyName);
    }
    else if (dailyText.startsWith("<") || dailyText.startsWith("error code:")) {
        console.log(`${dailyUpper} Cloudflare error: ${dailyText}`);
        return await saveDaily(dailyJSON, dailyName);
    }

    if (dailyJSON[0].id == parseInt(Object.fromEntries(dailyText.split("#")[0].split(":").map((e, i, a) => i % 2 == 0 ? [e, a[i + 1]] : null).filter(e => e != null))[1])) {
        console.log(`${dailyUpper} already up to date`);
        return await saveDaily(dailyJSON, dailyName);
    }

    const parsedResponse = parseResponse(id, dailyText);

    if (parsedResponse.timelyID - dailyJSON[0].timelyID == 1) {
        console.log(parsedResponse.name);
        delete parsedResponse.name;
        dailyJSON.unshift(parsedResponse);
        return await saveDaily(dailyJSON, dailyName);
    }

    const safe = await getSafe(dailyType);
    if (safe.length == 0) return await saveDaily(dailyJSON, dailyName);

    const safeIndex = safe.findIndex(x => x.id == dailyJSON[0].id);
    if (safeIndex == -1) {
        console.log(`No safe ${dailyName} found`);
        return await saveDaily(dailyJSON, dailyName);
    }

    const firstID = dailyJSON[0].timelyID;
    const firstDates = dailyJSON[0].dates;
    const dailyNames = [];
    for (let i = safeIndex - 1; i > 0; i--) {
        safe[i].timelyID = firstID + safeIndex - i;
        safe[i].dates = firstDates.map(d => {
            const date = new Date(d);
            date.setUTCDate(date.getUTCDate() + safe[i].timelyID - firstID);
            return date.getUTCFullYear() + "-" + (date.getUTCMonth() + 1).toString().padStart(2, "0") + "-" + date.getUTCDate().toString().padStart(2, "0");
        });
        dailyNames.push(safe[i].name);
        delete safe[i].name;
        dailyJSON.unshift(safe[i]);
    }

    console.log(`${dailyNames.join(" / ")} / ${parsedResponse.name}`);
    delete parsedResponse.name;
    dailyJSON.unshift(parsedResponse);
    await saveDaily(dailyJSON, dailyName);
}

async function getSafe(type) {
    const response = await fetch("https://www.boomlings.com/database/getGJLevels21.php", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": ""
        },
        body: `gameVersion=22&binaryVersion=42&type=${type}&secret=Wmfd2893gb7`,
    });
    if (!response.ok) {
        console.log(`Safe response not ok: ${response.status}`);
        return [];
    }
    const safeText = await response.text();
    return safeText.split("#")[0].split("|").map(x => parseResponse(0, x));
}

(async () => {
    const args = process.argv.length > 2 ? process.argv.slice(2) : ["-1", "-2", "-3"];

    const response = await fetch("https://docs.google.com/spreadsheets/d/1qKlWKpDkOpU1ZF6V6xGfutDY2NvcA8MNPnsv6GBkKPQ/gviz/tq?tqx=out:csv&sheet=GDDL");
    if (response.ok) {
        const csv = await response.text();
        const lines = csv.replace(/\r/g, "").split("\n").map(l => l.slice(1, -1).split('","'));
        const header = lines.shift();
        const data = lines.map(l => Object.fromEntries(l.map((e, i) => [header[i], e])));
        for (const level of data) GDDL.push({
            id: parseInt(level["ID"]),
            tier: !Number.isNaN(parseFloat(level["Tier"])) ? Math.round(parseFloat(level["Tier"])) : 0
        });
    }
    else console.log(`GDDL response not ok: ${response.status}`);

    for (const arg of args) await getDaily(parseInt(arg));
})();
