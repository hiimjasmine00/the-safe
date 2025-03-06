const fs = require("fs");
const path = require("path");
const daily = require("./v2/daily.json");
const weekly = require("./v2/weekly.json");
const event = require("./v2/event.json");

const LEVELID = parseInt(process.argv[2]); // -1 for daily, -2 for weekly, -3 for event

function parseResponse(res) {
    const responses = res.split("#");
    const l = Object.fromEntries(responses[0].split(":").map((e, i, a) => i % 2 == 0 ? [e, a[i + 1]] : null).filter(e => e != null));
    const dailyInfo = {
        timelyID: 0,
        dates: []
    };
    if (LEVELID == -1) {
        dailyInfo.timelyID = parseInt(l[41]);
        const dailyDate = new Date(daily[0].dates[0]);
        dailyDate.setUTCDate(dailyDate.getUTCDate() + (dailyInfo.timelyID - daily[0].timelyID));
        dailyInfo.dates = [dailyDate.getUTCFullYear() + "-" + (dailyDate.getUTCMonth() + 1).toString().padStart(2, "0") + "-" + dailyDate.getUTCDate().toString().padStart(2, "0")];
    }
    else if (LEVELID == -2) {
        dailyInfo.timelyID = parseInt(l[41]) - 100000;
        dailyInfo.dates = weekly[0].dates.map(d => {
            const date = new Date(d);
            date.setUTCDate(date.getUTCDate() + (dailyInfo.timelyID - weekly[0].timelyID) * 7);
            return date.getUTCFullYear() + "-" + (date.getUTCMonth() + 1).toString().padStart(2, "0") + "-" + date.getUTCDate().toString().padStart(2, "0");
        });
    }
    else if (LEVELID == -3) {
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
        ...dailyInfo,
        tier: 0
    };
}

function newLineForEveryEntryButDontPrettifyEverything(obj) {
    return JSON.stringify(obj).replace(/\},\{/g, "},\n  {").replace("[", "[\n  ").slice(0, -1) + "\n]";
}

async function getDaily() {
    const dailyName = LEVELID == -1 ? "daily" : LEVELID == -2 ? "weekly" : LEVELID == -3 ? "event" : "";
    const dailyUpper = dailyName[0].toUpperCase() + dailyName.slice(1);
    const dailyJSON = LEVELID == -1 ? daily : LEVELID == -2 ? weekly : LEVELID == -3 ? event : [];
    const response = await fetch("https://www.boomlings.com/database/downloadGJLevel22.php", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": ""
        },
        body: `gameVersion=22&binaryVersion=42&levelID=${LEVELID}&secret=Wmfd2893gb7`,
    });
    const dailyText = await response.text();
    if (dailyText == "-1") {
        console.log(`Invalid ${dailyName} response, falling back to safe`);
        const safe = await getSafe();
        const safeIndex = safe.findIndex(x => x.id == dailyJSON[0].id);
        if (safeIndex == -1) {
            console.log(`No safe ${dailyName} found`);
            return;
        }
        console.log(`Safe ${dailyName} found at index ${safeIndex}`);
        const firstID = dailyJSON[0].id;
        const firstDates = dailyJSON[0].dates;
        for (let i = safeIndex - 1; i >= 0; i--) {
            safe[i].dailyID = firstID + safeIndex - i;
            safe[i].dates = firstDates.map(d => {
                const date = new Date(d);
                date.setUTCDate(date.getUTCDate() + safe[i].dailyID - firstID);
                return date.getUTCFullYear() + "-" + (date.getUTCMonth() + 1).toString().padStart(2, "0") + "-" + date.getUTCDate().toString().padStart(2, "0");
            });
            dailyJSON.unshift(safe[i]);
        }
        return;
    }
    else if (dailyText.startsWith("<") || dailyText.startsWith("error code:")) {
        console.log(`${dailyUpper} Cloudflare error: ${dailyText}`);
        return;
    }

    console.log(`${dailyUpper} response: ${dailyText.replace(/:4:[^:]+/, "")}`);
    const parsedResponse = parseResponse(dailyText);

    if (dailyJSON[0].id == parsedResponse.id) {
        console.log(`${dailyUpper} already up to date`);
        return;
    }

    console.log(JSON.stringify(parsedResponse));

    if (parsedResponse.timelyID - dailyJSON[0].timelyID == 1) {
        console.log(`Skipping ${dailyName} safe`);
        dailyJSON.unshift(parsedResponse);
        fs.writeFileSync(path.join(__dirname, "v2", `${dailyName}.json`), newLineForEveryEntryButDontPrettifyEverything(dailyJSON));
        return;
    }

    const safe = await getSafe();
    const safeIndex = safe.findIndex(x => x.id == dailyJSON[0].id);
    if (safeIndex == -1) {
        console.log(`No safe ${dailyName} found`);
        return;
    }
    console.log(`Safe ${dailyName} found at index ${safeIndex}`);
    const firstID = dailyJSON[0].timelyID;
    const firstDates = dailyJSON[0].dates;
    for (let i = safeIndex - 1; i > 0; i--) {
        safe[i].timelyID = firstID + safeIndex - i;
        safe[i].dates = firstDates.map(d => {
            const date = new Date(d);
            date.setUTCDate(date.getUTCDate() + safe[i].timelyID - firstID);
            return date.getUTCFullYear() + "-" + (date.getUTCMonth() + 1).toString().padStart(2, "0") + "-" + date.getUTCDate().toString().padStart(2, "0");
        });
        dailyJSON.unshift(safe[i]);
    }

    dailyJSON.unshift(parsedResponse);
    fs.writeFileSync(path.join(__dirname, "v2", `${dailyName}.json`), newLineForEveryEntryButDontPrettifyEverything(dailyJSON));
}

async function getSafe() {
    const response = await fetch("https://www.boomlings.com/database/getGJLevels21.php", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": ""
        },
        body: `gameVersion=22&binaryVersion=42&type=${LEVELID == -1 ? 21 : LEVELID == -2 ? 22 : LEVELID == -3 ? 23 : 0}&secret=Wmfd2893gb7`,
    });
    const safeText = await response.text();
    return safeText.split("#")[0].split("|").map(parseResponse);
}

getDaily();
